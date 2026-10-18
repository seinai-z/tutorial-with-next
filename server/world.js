/* server/world.js — the authoritative game world.
 * Runs a 20 Hz simulation (players, monsters, combat) and sends 10 Hz snapshots to clients. */
const GD = require('../shared/data');
const nav = require('./nav');
const P = require('./player');
const C = require('./combat');
const TILE = GD.TILE;
const TICK_MS = 50, PARTY_MAX = 6;
let monSeq = 1;

class World {
  constructor(io, store) {
    this.io = io; this.store = store;
    this.players = new Map();          // socket id -> player
    this.parties = new Map();          // party id  -> { id, leader, members:[socket ids] }
    this.partySeq = 1; this.tickN = 0;
    this.t0 = Date.now(); this.last = Date.now();
    this.maps = {};
    for (const id in GD.MAPS) this.maps[id] = this.makeMap(id);
  }

  start() {
    setInterval(() => this.tick(), TICK_MS);
    setInterval(() => this.saveAll(), 30000);
  }

  /* ---------------------------------------------------------------- set-up */
  makeMap(id) {
    const g = GD.getMap(id), def = g.def, m = { id, g, def, players: new Set(), mons: [], events: [] }, sp = def.spawn;
    for (const s of def.mobs) for (let i = 0; i < s.n; i++) {
      let pos;
      if (s.boss) { const br = g.rooms[g.rooms.length - 1]; pos = nav.nearestWalkable(g, br.x + (br.w >> 1), br.y + (br.h >> 1)); }
      else pos = nav.randomTile(g, (tx, ty) => {
        if (Math.hypot(tx - sp[0], ty - sp[1]) < 9 || (s.minX && tx < s.minX)) return false;   // keep the arrival area free of strong monsters
        for (const pt of def.portals) if (Math.hypot(tx - pt.r[0] - pt.r[2] / 2, ty - pt.r[1] - pt.r[3] / 2) < 6) return false;
        if (def.kind === 'dungeon') { const r0 = g.rooms[0]; if (tx >= r0.x - 1 && tx <= r0.x + r0.w && ty >= r0.y - 1 && ty <= r0.y + r0.h) return false; }
        return true;
      });
      if (pos) m.mons.push(this.makeMon(s.m, id, pos));
    }
    return m;
  }

  makeMon(key, mapId, tile) {
    const D = GD.MONSTERS[key], x = (tile.x + .5) * TILE, y = (tile.y + .5) * TILE;
    return { id: 'm' + monSeq++, isMon: true, key, def: D, map: mapId, x, y, hx: x, hy: y, hp: D.hp, dead: false, respawnAt: 0, dir: 1,
      target: null, path: null, nextAtk: 0, nextThink: 0, nextPath: 0, wanderAt: 0, wp: null, returning: false, retBy: 0, moving: false,
      anim: 'i', animUntil: 0, dmgBy: {}, lastChase: 0, slowUntil: 0, slowF: 1, poison: null, stolen: false, nextAoe: 0,
      d: { atk: D.atk, def: D.def, mdef: D.def, hit: 30 + D.lv * 2, flee: 4 + D.lv * 2, red: 0 } };
  }

  /* --------------------------------------------------------------- helpers */
  ev(mapId, e) { const m = this.maps[mapId]; if (m && m.events.length < 400) m.events.push(e); }
  sys(p, msg, ch = 'sys') { if (p.sock) p.sock.emit('chat', { ch, msg }); }
  announce(msg) { this.io.emit('chat', { ch: 'sys', msg }); }
  monById(mapId, id) { return id ? this.maps[mapId].mons.find(m => m.id === id) : null; }
  nearestMon(p, r) {
    let best = null, bd = r;
    for (const m of this.maps[p.map].mons) { if (m.dead) continue; const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  findByName(name) { name = String(name || '').toLowerCase(); for (const p of this.players.values()) if (p.name.toLowerCase() === name) return p; return null; }
  partyMembers(p) {
    const pt = p.party && this.parties.get(p.party);
    return pt ? pt.members.map(id => this.players.get(id)).filter(Boolean) : [p];
  }

  addPlayer(p) {
    const m = this.maps[p.map];
    if (!nav.canStand(m.g, p.x, p.y)) { const s = m.def.spawn; p.x = (s[0] + .5) * TILE; p.y = (s[1] + .5) * TILE; }
    this.players.set(p.id, p); m.players.add(p);
  }
  removePlayer(p) {
    this.leaveParty(p); this.savePlayer(p);
    this.maps[p.map].players.delete(p); this.players.delete(p.id);
  }
  savePlayer(p) {
    const rec = P.serialize(p);
    if (p.dead) { const s = GD.MAPS.prontera.spawn; Object.assign(rec, { map: 'prontera', x: (s[0] + .5) * TILE, y: (s[1] + .5) * TILE }); }
    this.store.set(p.name, { pw: p.pw, char: rec });
  }
  saveAll() { for (const p of this.players.values()) this.savePlayer(p); this.store.save(); }

  warp(p, mapId, tx, ty) {
    if (!this.maps[mapId]) return;
    this.maps[p.map].players.delete(p);
    p.map = mapId; p.x = (tx + .5) * TILE; p.y = (ty + .5) * TILE;
    p.path = null; p.target = null; p.pending = null; p.noPortal = Date.now() + 1500;
    this.maps[mapId].players.add(p);
    p.sock.emit('map', { id: mapId });
  }
  respawn(p) {
    if (!p.dead) return;
    p.dead = false; p.buffs = {}; P.recalc(p); p.hp = Math.ceil(p.d.maxHp / 2); p.sp = Math.ceil(p.d.maxSp / 2);
    const s = GD.MAPS.prontera.spawn; this.warp(p, 'prontera', s[0], s[1]); p.noPortal = 0;
  }

  /* ----------------------------------------------------------- player cmds */
  cmdMove(p, x, y) {
    if (p.dead) return;
    p.input.dx = p.input.dy = 0; p.target = null; p.pending = null;
    this.pathTo(this.maps[p.map], p, x, y, Date.now());
  }
  cmdInput(p, dx, dy) {
    p.input.dx = Math.max(-1, Math.min(1, +dx || 0)); p.input.dy = Math.max(-1, Math.min(1, +dy || 0));
    if (p.input.dx || p.input.dy) { p.path = null; p.target = null; p.pending = null; }
  }
  cmdTarget(p, id) {
    const m = this.monById(p.map, id);
    p.target = m && !m.dead ? m.id : null; p.pending = null; if (p.target) p.input.dx = p.input.dy = 0;
  }
  pathTo(m, p, x, y, now) {
    p.lastPath = now;
    const pth = nav.pathPx(m.g, p.x, p.y, x, y);
    p.path = pth || (nav.canStand(m.g, x, y) ? [{ x, y }] : null);
  }

  /* ------------------------------------------------------------------ tick */
  tick() {
    const now = Date.now(); this.tickN++;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    for (const m of Object.values(this.maps)) {
      if (!m.players.size) continue;                     // empty maps are frozen to save CPU
      for (const p of m.players) this.updatePlayer(p, m, now, dt);
      for (const mon of m.mons) this.updateMonster(mon, m, now, dt);
    }
    if (this.tickN % 2 === 0) this.broadcast(now);
    if (this.tickN % 20 === 0) for (const pt of this.parties.values()) this.pushParty(pt);
  }

  updatePlayer(p, m, now, dt) {
    if (p.dead) { p.moving = false; return; }
    // buff expiry
    let changed = false;
    for (const k in p.buffs) if (p.buffs[k].until <= now) { delete p.buffs[k]; changed = true; }
    if (p.hidden && p.hidden <= now) { p.hidden = 0; changed = true; }
    if (changed) P.recalc(p, now);

    // movement (keyboard vector or click path)
    let moving = false; const inp = p.input;
    if (inp.dx || inp.dy) {
      const l = Math.hypot(inp.dx, inp.dy), mv = p.d.spd * dt / l;
      moving = nav.slide(m.g, p, inp.dx * mv, inp.dy * mv);
    } else if (p.path && p.path.length) moving = nav.follow(m.g, p, p.d.spd, dt);

    // pending skill: walk into range, then cast
    if (p.pending) {
      const t = this.monById(p.map, p.pending.tid), S = GD.SKILLS[p.pending.id];
      if (!t || t.dead || inp.dx || inp.dy) p.pending = null;
      else if (C.reach(p, t) <= S.range) { const pd = p.pending; p.pending = null; p.path = null; C.cast(this, p, pd.id, pd.tid); }
      else if (now - p.lastPath > 300) this.pathTo(m, p, t.x, t.y, now);
    } else if (p.target) {                               // auto-attack
      const t = this.monById(p.map, p.target);
      if (!t || t.dead) p.target = null;
      else if (C.reach(p, t) <= p.d.range) {
        p.path = null;
        if (now >= p.nextAtk && now >= p.animUntil - 150) C.autoAttack(this, p, t, now);
      } else if (!(inp.dx || inp.dy) && now - p.lastPath > 350) this.pathTo(m, p, t.x, t.y, now);
    }
    p.moving = moving;

    // regeneration (only out of combat)
    if (now >= p.nextRegen) {
      p.nextRegen = now + 4000;
      if (now - p.lastHit > 4000 && p.hp < p.d.maxHp) p.hp = Math.min(p.d.maxHp, p.hp + Math.max(1, Math.floor(p.d.maxHp * 0.015 + p.d.s.vit / 5)));
      if (p.sp < p.d.maxSp) p.sp = Math.min(p.d.maxSp, p.sp + 1 + Math.floor(p.d.s.int / 8) + GD.skillLv(p, 'sprec') * 2);
    }
    // portals
    if (now > p.noPortal) for (const pt of m.def.portals) {
      const [rx, ry, rw, rh] = pt.r;
      if (p.x >= rx * TILE && p.x < (rx + rw) * TILE && p.y >= ry * TILE && p.y < (ry + rh) * TILE) { this.warp(p, pt.to, pt.at[0], pt.at[1]); break; }
    }
  }

  updateMonster(mon, m, now, dt) {
    const D = mon.def, g = m.g;
    if (mon.dead) {
      if (now >= mon.respawnAt) {
        Object.assign(mon, { dead: false, hp: D.hp, x: mon.hx, y: mon.hy, target: null, path: null, dmgBy: {}, stolen: false, poison: null, returning: false, wp: null });
      }
      return;
    }
    if (mon.poison) {
      if (now >= mon.poison.next) { mon.poison.next += 1000; C.hurtMon(this, mon, this.players.get(mon.poison.by) || null, mon.poison.dmg, { dot: true }); if (mon.dead) return; }
      if (mon.poison && now >= mon.poison.until) mon.poison = null;
    }
    const sp = D.spd * (now < mon.slowUntil ? mon.slowF : 1);
    let t = mon.target ? this.players.get(mon.target) : null;
    if (t && (t.dead || t.map !== m.id || t.hidden > now)) { t = null; mon.target = null; }
    if (!t && D.aggro && !mon.returning && now >= mon.nextThink) {          // aggro: look for the nearest visible player
      mon.nextThink = now + 400; let best = null, bd = D.sight;
      for (const p of m.players) { if (p.dead || p.hidden > now) continue; const d = Math.hypot(p.x - mon.x, p.y - mon.y); if (d < bd) { bd = d; best = p; } }
      if (best) { t = best; mon.target = best.id; mon.lastChase = now; }
    }
    let moving = false;
    if (t) {
      mon.returning = false;
      const dx = t.x - mon.x, dy = t.y - mon.y, dist = Math.hypot(dx, dy) || 1;
      if (Math.hypot(mon.hx - mon.x, mon.hy - mon.y) > TILE * 18 || now - mon.lastChase > 10000) {   // leash: give up and go home
        mon.target = null; mon.returning = true; mon.retBy = now + 15000; mon.path = null;
      } else if (dist <= D.range + 6) {                                                           // in range: attack
        mon.dir = dx < 0 ? -1 : 1; mon.lastChase = now;
        if (now >= mon.nextAtk) { mon.nextAtk = now + D.aspd; mon.anim = 'a'; mon.animUntil = now + 300; C.monsterHit(this, mon, t); }
        if (D.aoe && now >= mon.nextAoe) {                                                         // boss slam
          mon.nextAoe = now + D.aoe.every; this.ev(m.id, { t: 'ring', x: mon.x, y: mon.y, r: D.aoe.radius, c: '#ff4040', k: 'boss' });
          for (const p of m.players) if (!p.dead && Math.hypot(p.x - mon.x, p.y - mon.y) <= D.aoe.radius) C.hurtPlayer(this, p, C.physRoll(mon, p, D.aoe.mult, true).dmg);
        }
      } else if (dist < 110) { mon.path = null; moving = nav.slide(g, mon, dx / dist * sp * dt, dy / dist * sp * dt); }
      else {                                                                                       // chase via A*
        if (!mon.path || !mon.path.length || now >= mon.nextPath) { mon.nextPath = now + 600; mon.path = nav.pathPx(g, mon.x, mon.y, t.x, t.y); }
        moving = mon.path && mon.path.length ? nav.follow(g, mon, sp, dt) : nav.slide(g, mon, dx / dist * sp * dt, dy / dist * sp * dt);
      }
    } else if (mon.returning) {
      const dx = mon.hx - mon.x, dy = mon.hy - mon.y, d = Math.hypot(dx, dy) || 1;
      if (d < 10 || now > mon.retBy) { mon.returning = false; mon.x = mon.hx; mon.y = mon.hy; mon.hp = D.hp; mon.dmgBy = {}; }
      else {
        if (!mon.path || !mon.path.length || now >= mon.nextPath) { mon.nextPath = now + 800; mon.path = nav.pathPx(g, mon.x, mon.y, mon.hx, mon.hy); }
        moving = mon.path && mon.path.length ? nav.follow(g, mon, sp * 1.4, dt) : nav.slide(g, mon, dx / d * sp * dt, dy / d * sp * dt);
      }
    } else {                                                                                       // patrol around home
      if (mon.hp < D.hp && now - mon.lastChase > 6000) mon.hp = Math.min(D.hp, mon.hp + D.hp * 0.01 * dt);
      if (!mon.wp && now >= mon.wanderAt) {
        const tx = Math.floor(mon.hx / TILE) + C.ri(-4, 4), ty = Math.floor(mon.hy / TILE) + C.ri(-4, 4);
        if (!GD.solidAt(g, tx, ty)) mon.wp = { x: (tx + .5) * TILE, y: (ty + .5) * TILE }; else mon.wanderAt = now + 800;
      }
      if (mon.wp) {
        const dx = mon.wp.x - mon.x, dy = mon.wp.y - mon.y, d = Math.hypot(dx, dy) || 1;
        if (d < 6) { mon.wp = null; mon.wanderAt = now + 2000 + Math.random() * 4000; }
        else { moving = nav.slide(g, mon, dx / d * sp * 0.5 * dt, dy / d * sp * 0.5 * dt); if (!moving) { mon.wp = null; mon.wanderAt = now + 1500; } }
      }
    }
    mon.moving = moving;
  }

  /* ------------------------------------------------------------- snapshots */
  broadcast(now) {
    const tod = ((now - this.t0) / 600000 + 0.3) % 1;          // 10 real minutes = 1 in-game day
    const an = e => e.dead ? 'x' : (now < e.animUntil ? e.anim : (e.moving ? 'w' : 'i'));
    for (const m of Object.values(this.maps)) {
      if (!m.players.size) continue;
      const pl = [...m.players], mons = m.mons.filter(x => !x.dead), evs = m.events; m.events = [];
      for (const p of pl) {
        const near = e => Math.abs(e.x - p.x) < 820 && Math.abs(e.y - p.y) < 620;
        const players = pl.filter(e => near(e) && (!e.hidden || e.hidden <= now || e === p || (e.party && e.party === p.party)))
          .map(e => ({ id: e.id, n: e.name, c: e.cls, lv: e.lv, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, mh: e.d.maxHp, d: e.dir, a: an(e),
            h: e.hidden > now ? 1 : 0, pt: e.party || 0 }));
        const mo = mons.filter(near).map(e => ({ id: e.id, k: e.key, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, mh: e.def.hp, d: e.dir, a: an(e),
          sl: now < e.slowUntil ? 1 : 0, po: e.poison ? 1 : 0 }));
        const ev = evs.filter(e => e.x === undefined || (Math.abs(e.x - p.x) < 900 && Math.abs(e.y - p.y) < 700));
        p.sock.emit('snap', { tod, me: { hp: p.hp, sp: p.sp }, p: players, m: mo, ev });
        if (p.dirty) { p.dirty = false; p.sock.emit('self', P.profile(p, now)); }
      }
    }
  }

  /* ----------------------------------------------------------------- party */
  pushParty(pt) {
    const mem = pt.members.map(id => this.players.get(id)).filter(Boolean);
    const info = { id: pt.id, leader: pt.leader, members: mem.map(e => ({ id: e.id, name: e.name, cls: e.cls, lv: e.lv, hp: e.hp, mhp: e.d.maxHp, map: e.map })) };
    for (const e of mem) e.sock.emit('party', info);
  }
  leaveParty(p) {
    const pt = p.party && this.parties.get(p.party); p.party = null;
    p.sock && p.sock.emit('party', null);
    if (!pt) return;
    pt.members = pt.members.filter(id => id !== p.id);
    if (pt.members.length < 2) { for (const id of pt.members) { const o = this.players.get(id); if (o) { o.party = null; o.sock.emit('party', null); this.sys(o, 'Your party was disbanded.', 'party'); } } this.parties.delete(pt.id); return; }
    if (pt.leader === p.name) pt.leader = this.players.get(pt.members[0]).name;
    for (const id of pt.members) this.sys(this.players.get(id), `${p.name} left the party.`, 'party');
    this.pushParty(pt);
  }
  party(p, act, name) {
    const pt = p.party && this.parties.get(p.party);
    if (act === 'create') {
      if (pt) return this.sys(p, 'You are already in a party.');
      const np = { id: 'P' + this.partySeq++, leader: p.name, members: [p.id] }; this.parties.set(np.id, np); p.party = np.id;
      this.sys(p, 'Party created. Invite players with /invite <name>.', 'party'); this.pushParty(np);
    } else if (act === 'invite') {
      const t = this.findByName(name);
      if (!t || t === p) return this.sys(p, 'Player not found.');
      if (t.party) return this.sys(p, `${t.name} is already in a party.`);
      if (pt && pt.leader !== p.name) return this.sys(p, 'Only the party leader can invite.');
      if (pt && pt.members.length >= PARTY_MAX) return this.sys(p, 'The party is full.');
      if (!p.party) this.party(p, 'create');
      t.invite = { pid: p.party, from: p.name, until: Date.now() + 30000 };
      t.sock.emit('invite', { from: p.name }); this.sys(p, `Invited ${t.name}.`, 'party');
    } else if (act === 'accept' || act === 'decline') {
      const inv = p.invite; p.invite = null;
      if (act === 'decline' || !inv || inv.until < Date.now()) return;
      const dest = this.parties.get(inv.pid);
      if (!dest || dest.members.length >= PARTY_MAX || p.party) return this.sys(p, 'Cannot join that party.');
      dest.members.push(p.id); p.party = dest.id;
      for (const id of dest.members) this.sys(this.players.get(id), `${p.name} joined the party.`, 'party');
      this.pushParty(dest);
    } else if (act === 'leave') this.leaveParty(p);
    else if (act === 'kick') {
      if (!pt || pt.leader !== p.name) return this.sys(p, 'Only the leader can kick.');
      const t = this.findByName(name); if (t && t !== p && t.party === p.party) { this.sys(t, 'You were removed from the party.', 'party'); this.leaveParty(t); }
    }
  }

  /** Optional testing commands. Enable with:  ALLOW_CHEATS=1 npm start */
  cheat(p, cmd, arg) {
    if (!process.env.ALLOW_CHEATS) return this.sys(p, 'Unknown command.');
    if (cmd === 'level') { const n = Math.max(1, Math.min(GD.MAX_LV, parseInt(arg) || 1)); if (n > p.lv) { p.pts += 4 * (n - p.lv); p.spts += n - p.lv; } p.lv = n; p.exp = 0; P.recalc(p); p.hp = p.d.maxHp; p.sp = p.d.maxSp; this.sys(p, 'Level set to ' + n); }
    else if (cmd === 'zeny') { p.zeny += parseInt(arg) || 0; p.dirty = true; }
    else if (cmd === 'warp' && GD.MAPS[arg]) { const s = GD.MAPS[arg].spawn; this.warp(p, arg, s[0], s[1]); }
  }

  /* ------------------------------------------------------------------ chat */
  chat(p, ch, msg) {
    msg = String(msg || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120); if (!msg) return;
    const now = Date.now(); if (now < (p.chatAt || 0)) return; p.chatAt = now + 400;
    if (msg[0] === '/') {                                  // slash commands
      const [cmd, ...rest] = msg.slice(1).split(' '), arg = rest.join(' ').trim();
      switch (cmd.toLowerCase()) {
        case 'g': return this.chat(p, 'global', arg);
        case 'p': return this.chat(p, 'party', arg);
        case 'l': return this.chat(p, 'local', arg);
        case 'w': { const [to, ...m] = arg.split(' '), t = this.findByName(to);
          if (!t) return this.sys(p, 'Player not found.'); const text = m.join(' ').trim(); if (!text) return;
          t.sock.emit('chat', { ch: 'whisper', from: p.name, msg: text }); return p.sock.emit('chat', { ch: 'whisper', from: `To ${t.name}`, msg: text }); }
        case 'level': case 'zeny': case 'warp': return this.cheat(p, cmd.toLowerCase(), arg);
        case 'invite': return this.party(p, 'invite', arg);
        case 'leave': return this.party(p, 'leave');
        case 'who': return this.sys(p, `Online (${this.players.size}): ` + [...this.players.values()].map(e => e.name).join(', '));
        default: return this.sys(p, 'Commands: /g /p /l /w name msg, /invite name, /leave, /who');
      }
    }
    if (ch === 'global') this.io.emit('chat', { ch: 'global', from: p.name, msg });
    else if (ch === 'party') {
      if (!p.party) return this.sys(p, 'You are not in a party.');
      for (const e of this.partyMembers(p)) e.sock.emit('chat', { ch: 'party', from: p.name, msg });
    } else {
      for (const e of this.maps[p.map].players) e.sock.emit('chat', { ch: 'local', from: p.name, msg });
      this.ev(p.map, { t: 'say', id: p.id, msg });
    }
  }
}

module.exports = World;
