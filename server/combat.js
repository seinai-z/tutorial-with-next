/* server/combat.js — damage formulas, kills/drops/exp, auto-attack and skill casting.
 * `w` is the World instance (see world.js). */
const GD = require('../shared/data');
const P = require('./player');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));

/* ------------------------------------------------------------------ damage */
/** Physical damage roll. att/tgt are players or monsters (both expose .d stats). */
function physRoll(att, tgt, mult, sure) {
  const a = att.d, t = tgt.d;
  if (!sure && Math.random() > clamp(0.55 + (a.hit - t.flee) / 180, 0.12, 0.97)) return { miss: true, dmg: 0 };
  const base = Array.isArray(a.atk) ? rnd(a.atk[0], a.atk[1] + 1) : a.atk * rnd(0.9, 1.1);
  const crit = !!att.isPlayer && Math.random() * 100 < a.crit;
  let dmg = base * mult * (crit ? 1.4 : 1);
  dmg *= 1 - t.def / (t.def + 80);
  dmg *= 1 - (t.red || 0);
  return { dmg: Math.max(1, Math.round(dmg)), crit };
}
function magRoll(att, tgt, mult) {
  let dmg = att.d.matk * mult * rnd(0.88, 1.12);
  dmg *= 1 - tgt.d.mdef / (tgt.d.mdef + 80);
  return { dmg: Math.max(1, Math.round(dmg)) };
}
/** Floating-number event. kind: md (monster hurt) | pd (player hurt) | h (heal) | sp | miss */
function dmgEvent(w, tgt, v, o = {}) {
  w.ev(tgt.map, { t: 'dmg', id: tgt.id, x: tgt.x, y: tgt.y, v, c: o.crit ? 1 : 0, k: o.kind, dl: o.delay || 0 });
}
const reach = (a, t) => Math.hypot(t.x - a.x, t.y - a.y) - (t.def ? t.def.size / 3 : 0);

/* ----------------------------------------------------------------- monsters */
function hurtMon(w, mon, att, dmg, o = {}) {
  if (mon.dead) return;
  mon.hp -= dmg; mon.lastChase = Date.now();
  dmgEvent(w, mon, dmg, { crit: o.crit, kind: o.dot ? 'dot' : 'md', delay: o.delay });
  if (att) {
    mon.dmgBy[att.id] = (mon.dmgBy[att.id] || 0) + dmg;
    if (!mon.target && !att.dead && att.hidden <= Date.now()) mon.target = att.id;
  }
  if (mon.hp <= 0) killMon(w, mon, att);
}

function killMon(w, mon, killer) {
  const D = mon.def, now = Date.now();
  mon.dead = true; mon.hp = 0; mon.respawnAt = now + D.resp; mon.target = null; mon.path = null; mon.poison = null; mon.dmgBy = {};
  w.ev(mon.map, { t: 'die', id: mon.id, x: mon.x, y: mon.y });
  if (D.boss) w.announce(`${killer ? killer.name : 'Someone'} has slain ${D.name}!`);
  if (!killer || killer.map !== mon.map) return;

  // EXP is shared with nearby party members; quest kills count for everyone sharing.
  const group = w.partyMembers(killer).filter(m => m.map === mon.map && !m.dead && Math.hypot(m.x - killer.x, m.y - killer.y) < 1200);
  const n = group.length, bonus = n > 1 ? (1 + 0.15 * (n - 1)) / n : 1;
  for (const m of group) {
    const diff = m.lv - D.lv, f = diff > 5 ? Math.max(0.1, 1 - (diff - 5) * 0.12) : Math.min(1.3, 1 - Math.min(0, diff) * 0.04);
    P.addExp(w, m, D.exp * f * bonus);
    for (const qid in m.quests) {
      const q = m.quests[qid], Q = GD.QUESTS[qid];
      if (q.st === 'active' && Q.goal.mob === mon.key && q.n < Q.goal.n) {
        q.n++; m.dirty = true;
        if (q.n >= Q.goal.n) w.sys(m, `Quest "${Q.name}" complete! Return to ${GD.NPCS[Q.giver].name}.`, 'sys');
      }
    }
  }
  // Loot goes straight to the killer's inventory (auto-loot).
  const z = ri(D.zeny[0], D.zeny[1]); killer.zeny += z; killer.dirty = true;
  const got = [`${z}z`], luck = 1 + killer.d.s.luk * 0.002;
  for (const [id, ch] of D.drops) {
    if (Math.random() < ch * luck) {
      if (P.give(killer, id, 1)) got.push(GD.ITEMS[id].name); else w.sys(killer, 'Inventory full! ' + GD.ITEMS[id].name + ' was lost.');
    }
  }
  w.ev(mon.map, { t: 'loot', id: killer.id, text: got.join(', ') });
  w.sys(killer, 'Obtained: ' + got.join(', '), 'loot');
}

function monsterHit(w, mon, p, mult = 1) {
  const r = physRoll(mon, p, mult);
  if (r.miss) return dmgEvent(w, p, 0, { kind: 'miss' });
  hurtPlayer(w, p, r.dmg);
}

/* ------------------------------------------------------------------ players */
function hurtPlayer(w, p, dmg) {
  if (p.dead) return;
  p.hp -= dmg; p.lastHit = Date.now(); dmgEvent(w, p, dmg, { kind: 'pd' });
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.target = null; p.pending = null; p.path = null; p.hidden = 0; p.dirty = true;
    w.ev(p.map, { t: 'dead', id: p.id }); w.sys(p, 'You have been defeated.'); p.sock.emit('dead');
  }
}

function breakHide(p) { if (p.hidden) { p.hidden = 0; P.recalc(p); } }

/** Basic attack against monster t. */
function autoAttack(w, p, t, now) {
  const C = GD.CLASSES[p.cls], hits = Math.random() < 0.08 * GD.skillLv(p, 'doubleatk') ? 2 : 1;
  p.nextAtk = now + p.d.aspd; p.anim = 'a'; p.animUntil = now + 280; p.dir = t.x < p.x ? -1 : 1; breakHide(p);
  const ranged = p.d.range > 80;
  for (let i = 0; i < hits; i++) {
    const dl = i * 120;
    if (ranged) w.ev(p.map, { t: 'proj', x: p.x, y: p.y - 14, tx: t.x, ty: t.y - 10, c: C.weapon === 'bow' ? '#e8d3a8' : '#c9a8ff', s: C.weapon === 'bow' ? 'arrow' : 'orb', dl });
    else w.ev(p.map, { t: 'hit', x: t.x, y: t.y - 8, c: '#ffffff', dl });
    const r = C.basic === 'magic' ? magRoll(p, t, 0.55) : physRoll(p, t, 1);
    if (r.miss) dmgEvent(w, t, 0, { kind: 'miss', delay: dl }); else hurtMon(w, t, p, r.dmg, { crit: r.crit, delay: dl + (ranged ? 120 : 0) });
    if (t.dead) break;
  }
}

/* ------------------------------------------------------------------- skills */
function cast(w, p, sid, tid) {
  const S = GD.SKILLS[sid], now = Date.now();
  if (!S || S.cls !== p.cls || S.kind === 'passive' || p.dead) return;
  const l = p.skills[sid] | 0; if (l < 1) return;
  if (now < (p.cds[sid] || 0)) return;
  const cost = S.sp(l);
  if (p.sp < cost) return w.sys(p, 'Not enough SP.');
  if (S.zeny && p.zeny < S.zeny(l)) return w.sys(p, 'Not enough Zeny.');

  // --- resolve the target
  let t = p;
  if (S.target === 'enemy') {
    t = w.monById(p.map, tid);
    if (!t || t.dead) t = w.nearestMon(p, 320);
    if (!t) return w.sys(p, 'No target.');
    if (reach(p, t) > S.range + 6) { p.pending = { id: sid, tid: t.id }; p.target = null; return; }   // walk into range first
  } else if (S.target === 'ally') {
    const a = tid && w.players.get(tid);
    if (a && a.map === p.map && !a.dead && Math.hypot(a.x - p.x, a.y - p.y) <= S.range + 20) t = a;
  }

  // --- pay & animate
  p.sp -= cost; if (S.zeny) p.zeny -= S.zeny(l);
  p.cds[sid] = now + S.cd; p.dirty = true;
  if (S.kind !== 'hide') breakHide(p);
  p.anim = 'c'; p.animUntil = now + 420; if (t !== p) p.dir = t.x < p.x ? -1 : 1;
  w.ev(p.map, { t: 'cast', id: p.id });
  p.sock.emit('cd', { id: sid, ms: S.cd });
  const col = GD.EL[S.el || 'none'];

  switch (S.kind) {
    case 'hit': {
      const hits = S.hits ? S.hits(l) : 1;
      for (let i = 0; i < hits && !t.dead; i++) {
        const dl = i * 130;
        if (S.magic || S.ranged) w.ev(p.map, { t: 'proj', x: p.x, y: p.y - 14, tx: t.x, ty: t.y - 10, c: col, s: S.proj || 'orb', dl });
        else w.ev(p.map, { t: 'hit', x: t.x, y: t.y - 8, c: col, big: 1, dl });
        const r = S.magic ? magRoll(p, t, S.mult(l)) : physRoll(p, t, S.mult(l), true);
        hurtMon(w, t, p, r.dmg, { crit: r.crit, delay: dl + 160 });
      }
      if (S.slow && !t.dead) { t.slowUntil = now + S.slow.ms; t.slowF = S.slow.f; }
      if (S.poison && !t.dead) t.poison = { until: now + S.poison.ms(l), next: now + 1000, dmg: Math.max(1, Math.round(p.d.atk * 0.3)), by: p.id };
      break;
    }
    case 'aoe': {
      const c = S.center === 'target' ? t : p, rad = S.radius(l), hits = S.hits ? S.hits(l) : 1;
      w.ev(p.map, { t: 'ring', x: c.x, y: c.y, r: rad, c: col, k: S.fx || '' });
      for (const m of w.maps[p.map].mons) {
        if (m.dead || Math.hypot(m.x - c.x, m.y - c.y) > rad + m.def.size / 3) continue;
        for (let i = 0; i < hits && !m.dead; i++) {
          const r = S.magic ? magRoll(p, m, S.mult(l)) : physRoll(p, m, S.mult(l), true);
          hurtMon(w, m, p, r.dmg, { crit: r.crit, delay: 100 + i * 160 });
        }
      }
      break;
    }
    case 'buff': {
      t.buffs[sid] = Object.assign({ until: now + S.dur(l) }, S.mods(l));
      P.recalc(t, now);
      w.ev(p.map, { t: 'fx', k: 'buff', x: t.x, y: t.y, c: '#8fd3ff' });
      if (t !== p) w.sys(t, `${p.name} cast ${S.name} on you.`);
      break;
    }
    case 'heal': {
      const amt = Math.floor((p.lv * 2 + p.d.s.int * 3 + 25) * S.heal(l));
      t.hp = Math.min(t.d.maxHp, t.hp + amt); t.dirty = true;
      dmgEvent(w, t, amt, { kind: 'h' });
      w.ev(p.map, { t: 'fx', k: 'heal', x: t.x, y: t.y, c: '#7dffa0' });
      break;
    }
    case 'taunt': {
      w.ev(p.map, { t: 'ring', x: p.x, y: p.y, r: S.radius(l), c: '#ff5a5a', k: '' });
      for (const m of w.maps[p.map].mons)
        if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) <= S.radius(l)) { m.target = p.id; m.lastChase = now; }
      break;
    }
    case 'steal': {
      const pool = t.def.drops.filter(d => d[1] >= 0.02);
      w.ev(p.map, { t: 'hit', x: t.x, y: t.y - 8, c: '#ffe08a', dl: 0 });
      if (t.stolen || !pool.length) { w.sys(p, 'There is nothing to steal.'); break; }
      t.stolen = true; if (!t.target) t.target = p.id; t.lastChase = now;
      if (Math.random() < S.chance(l) + p.d.s.luk * 0.004) {
        const id = pool[(Math.random() * pool.length) | 0][0];
        if (P.give(p, id, 1)) { w.sys(p, 'You stole ' + GD.ITEMS[id].name + '!', 'loot'); w.ev(p.map, { t: 'loot', id: p.id, text: 'Stole ' + GD.ITEMS[id].name }); }
      } else w.sys(p, 'Steal failed.');
      break;
    }
    case 'hide': {
      p.hidden = now + S.dur(l); P.recalc(p, now);
      w.ev(p.map, { t: 'fx', k: 'buff', x: p.x, y: p.y, c: '#b0b0d0' });
      break;
    }
  }
}

module.exports = { physRoll, magRoll, dmgEvent, hurtMon, killMon, monsterHit, hurtPlayer, autoAttack, cast, reach, breakHide, rnd, ri };
