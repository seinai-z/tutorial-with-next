/* server/player.js — player model: creation, derived stats, inventory, exp/levels, serialization */
const GD = require('../shared/data');
const MAX_SLOTS = 50, STACK = 999;

function newCharacter(name, cls) {
  const C = GD.CLASSES[cls], sp = GD.MAPS.prontera.spawn;
  return {
    name, cls, lv: 1, exp: 0, zeny: 300, stats: Object.assign({}, C.base), pts: 8, spts: 1, skills: {},
    inv: [{ id: 'red', qty: 5 }, { id: 'flywing', qty: 1 }], eq: { weapon: C.weapon + '0', armor: 'cotton', acc: null },
    quests: {}, map: 'prontera', x: (sp[0] + .5) * GD.TILE, y: (sp[1] + .5) * GD.TILE,
  };
}

/** Build a live player object from a saved record. */
function hydrate(sock, rec, now) {
  const p = {
    id: sock.id, sock, isPlayer: true,
    name: rec.name, cls: rec.cls, lv: rec.lv | 0 || 1, exp: rec.exp | 0, zeny: rec.zeny | 0,
    stats: Object.assign({}, rec.stats), pts: rec.pts | 0, spts: rec.spts | 0, skills: Object.assign({}, rec.skills),
    inv: (rec.inv || []).filter(i => GD.ITEMS[i.id]).map(i => ({ id: i.id, qty: i.qty | 0 })),
    eq: Object.assign({ weapon: null, armor: null, acc: null }, rec.eq), quests: JSON.parse(JSON.stringify(rec.quests || {})),
    map: GD.MAPS[rec.map] ? rec.map : 'prontera', x: rec.x, y: rec.y,
    hp: 1, sp: 0, dir: 1, path: null, input: { dx: 0, dy: 0 }, target: null, pending: null, nextAtk: 0, cds: {}, buffs: {},
    hidden: 0, anim: 'i', animUntil: 0, party: null, dead: false, lastHit: 0, nextRegen: now + 4000, dirty: true, noPortal: 0,
    itemCd: 0, lastPath: 0, invite: null, tokens: 40, lastTok: now,
  };
  recalc(p, now); p.hp = p.d.maxHp; p.sp = p.d.maxSp;
  return p;
}

/** Recompute derived stats and clamp HP/SP. */
function recalc(p, now) {
  p.d = GD.derive(p, now || Date.now());
  if (p.hp > p.d.maxHp) p.hp = p.d.maxHp;
  if (p.sp > p.d.maxSp) p.sp = p.d.maxSp;
  p.dirty = true;
}

const serialize = p => ({ name: p.name, cls: p.cls, lv: p.lv, exp: p.exp, zeny: p.zeny, stats: p.stats, pts: p.pts, spts: p.spts,
  skills: p.skills, inv: p.inv, eq: p.eq, quests: p.quests, map: p.map, x: p.x, y: p.y });

/** Full private state sent to the owning client. */
function profile(p, now) {
  return {
    name: p.name, cls: p.cls, lv: p.lv, exp: p.exp, next: GD.expNext(p.lv), zeny: p.zeny, stats: p.stats, pts: p.pts, spts: p.spts,
    skills: p.skills, inv: p.inv, eq: p.eq, quests: p.quests, d: p.d, hp: p.hp, sp: p.sp,
    buffs: Object.keys(p.buffs).filter(k => p.buffs[k].until > now).map(k => ({ id: k, ms: p.buffs[k].until - now })),
    hidden: p.hidden > now ? 1 : 0,
  };
}

const count = (p, id) => p.inv.reduce((n, i) => n + (i.id === id ? i.qty : 0), 0);

function give(p, id, qty = 1) {
  const it = GD.ITEMS[id]; if (!it || qty < 1) return false;
  if (it.type !== 'equip') {
    const s = p.inv.find(i => i.id === id && i.qty < STACK);
    if (s) { s.qty = Math.min(STACK, s.qty + qty); p.dirty = true; return true; }
  }
  if (p.inv.length >= MAX_SLOTS) return false;
  if (it.type === 'equip') { for (let i = 0; i < qty; i++) { if (p.inv.length >= MAX_SLOTS) return i > 0; p.inv.push({ id, qty: 1 }); } }
  else p.inv.push({ id, qty });
  p.dirty = true; return true;
}

function take(p, id, qty = 1) {
  if (count(p, id) < qty) return false;
  for (let i = 0; i < p.inv.length && qty > 0; i++) {
    const s = p.inv[i]; if (s.id !== id) continue;
    const n = Math.min(s.qty, qty); s.qty -= n; qty -= n;
    if (s.qty <= 0) { p.inv.splice(i, 1); i--; }
  }
  p.dirty = true; return true;
}

/** Add exp, handling level-ups. */
function addExp(w, p, amt) {
  if (p.lv >= GD.MAX_LV) return;
  p.exp += Math.max(0, Math.round(amt)); let up = false;
  while (p.lv < GD.MAX_LV && p.exp >= GD.expNext(p.lv)) { p.exp -= GD.expNext(p.lv); p.lv++; p.pts += 4; p.spts += 1; up = true; }
  if (p.lv >= GD.MAX_LV) p.exp = 0;
  if (up) {
    recalc(p); p.hp = p.d.maxHp; p.sp = p.d.maxSp;
    w.ev(p.map, { t: 'lvup', id: p.id, x: p.x, y: p.y });
    w.sys(p, `Level up! You are now level ${p.lv}. (+4 stat points, +1 skill point)`, 'sys');
  }
  p.dirty = true;
}

module.exports = { newCharacter, hydrate, recalc, serialize, profile, count, give, take, addExp, MAX_SLOTS };
