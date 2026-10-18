/* server/actions.js — client-requested actions that are not movement/combat:
 * NPC dialogs, shops, quests, inventory, stat & skill points. Every action is validated server-side. */
const GD = require('../shared/data');
const P = require('./player');
const nav = require('./nav');
const NEAR = 170;                                              // max distance (px) to talk to an NPC
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(+v) || lo));

function npcNear(p, id) {
  const N = GD.NPCS[id]; if (!N || N.map !== p.map || p.dead) return null;
  return Math.hypot((N.t[0] + .5) * GD.TILE - p.x, (N.t[1] + .5) * GD.TILE - p.y) <= NEAR ? N : null;
}

function questView(p, qid) {
  const Q = GD.QUESTS[qid], s = p.quests[qid]; let st;
  if (s) st = s.st === 'done' ? 'done' : (s.n >= Q.goal.n ? 'ready' : 'active');
  else st = (p.lv < Q.minLv || (Q.prereq && !(p.quests[Q.prereq] && p.quests[Q.prereq].st === 'done'))) ? 'locked' : 'avail';
  return { id: qid, name: Q.name, text: Q.text, done: Q.done, st, n: s ? s.n : 0, goal: { mob: GD.MONSTERS[Q.goal.mob].name, n: Q.goal.n }, minLv: Q.minLv, reward: Q.reward };
}

const A = {
  /** Talk to an NPC: replies with a 'dialog' payload the client renders. */
  npc(w, p, d) {
    const N = npcNear(p, d.id); if (!N) return w.sys(p, 'You are too far away.');
    const out = { id: d.id, name: N.name, kind: N.kind, say: N.say };
    if (N.kind === 'shop') {
      const list = N.shop === 'equip' ? GD.SHOP_EQUIP : N.shop;
      out.shop = list.filter(i => GD.ITEMS[i].type !== 'equip' || GD.canEquip(p.cls, GD.ITEMS[i])).map(i => ({ id: i, price: GD.buyPrice(p, GD.ITEMS[i]) }));
    }
    if (N.kind === 'quest') out.quests = N.quests.map(q => questView(p, q));
    if (N.kind === 'warp') out.dests = N.dests.map(x => ({ map: x.map, name: GD.MAPS[x.map].name, cost: x.cost }));
    p.sock.emit('dialog', out);
  },

  buy(w, p, d) {
    const N = npcNear(p, d.npc); if (!N || N.kind !== 'shop') return;
    const list = N.shop === 'equip' ? GD.SHOP_EQUIP : N.shop, it = GD.ITEMS[d.id];
    if (!it || !list.includes(d.id) || (it.type === 'equip' && !GD.canEquip(p.cls, it))) return;
    const qty = it.type === 'equip' ? 1 : int(d.qty, 1, 99), cost = GD.buyPrice(p, it) * qty;
    if (p.zeny < cost) return w.sys(p, 'Not enough Zeny.');
    if (!P.give(p, d.id, qty)) return w.sys(p, 'Your inventory is full.');
    p.zeny -= cost; p.dirty = true; w.sys(p, `Bought ${qty}x ${it.name} for ${cost}z.`);
  },

  sell(w, p, d) {
    const N = npcNear(p, d.npc); if (!N || N.kind !== 'shop') return;
    const it = GD.ITEMS[d.id], qty = int(d.qty, 1, 999);
    if (!it || !P.take(p, d.id, qty)) return;
    const gain = GD.sellPrice(p, it) * qty; p.zeny += gain; p.dirty = true; w.sys(p, `Sold ${qty}x ${it.name} for ${gain}z.`);
  },

  quest(w, p, d) {
    const N = npcNear(p, d.npc); if (!N || N.kind !== 'quest' || !N.quests.includes(d.qid)) return;
    const v = questView(p, d.qid), Q = GD.QUESTS[d.qid];
    if (d.act === 'accept' && v.st === 'avail') { p.quests[d.qid] = { st: 'active', n: 0 }; p.dirty = true; w.sys(p, `Quest accepted: ${Q.name}`, 'sys'); }
    else if (d.act === 'turnin' && v.st === 'ready') {
      p.quests[d.qid].st = 'done'; p.zeny += Q.reward.zeny || 0;
      for (const [id, n] of Q.reward.items || []) if (!P.give(p, id, n)) w.sys(p, 'Inventory full: lost ' + GD.ITEMS[id].name);
      P.addExp(w, p, Q.reward.exp || 0); p.dirty = true; w.sys(p, `Quest complete: ${Q.name}! +${Q.reward.exp} EXP, +${Q.reward.zeny}z`, 'sys');
    } else return;
    A.npc(w, p, { id: d.npc });                               // refresh the dialog
  },

  heal(w, p, d) {
    const N = npcNear(p, d.npc); if (!N || N.kind !== 'heal') return;
    p.hp = p.d.maxHp; p.sp = p.d.maxSp; p.dirty = true; w.ev(p.map, { t: 'fx', k: 'heal', x: p.x, y: p.y, c: '#7dffa0' }); w.sys(p, 'You feel refreshed.');
  },

  warp(w, p, d) {
    const N = npcNear(p, d.npc); if (!N || N.kind !== 'warp') return;
    const dest = N.dests.find(x => x.map === d.map); if (!dest) return;
    if (p.zeny < dest.cost) return w.sys(p, 'Not enough Zeny.');
    p.zeny -= dest.cost; p.dirty = true; const s = GD.MAPS[dest.map].spawn; w.warp(p, dest.map, s[0], s[1]);
  },

  use(w, p, d) {
    const it = GD.ITEMS[d.id], now = Date.now();
    if (!it || it.type !== 'use' || p.dead || now < p.itemCd || !P.count(p, d.id)) return;
    if (it.heal && p.hp >= p.d.maxHp) return w.sys(p, 'HP is already full.');
    if (it.sp && p.sp >= p.d.maxSp) return w.sys(p, 'SP is already full.');
    p.itemCd = now + 500;
    if (it.heal) { const v = Math.floor(it.heal * (1 + p.d.s.vit / 100)); p.hp = Math.min(p.d.maxHp, p.hp + v); w.ev(p.map, { t: 'dmg', id: p.id, x: p.x, y: p.y, v, c: 0, k: 'h', dl: 0 }); }
    if (it.sp) { const v = Math.floor(it.sp * (1 + p.d.s.int / 100)); p.sp = Math.min(p.d.maxSp, p.sp + v); w.ev(p.map, { t: 'dmg', id: p.id, x: p.x, y: p.y, v, c: 0, k: 'sp', dl: 0 }); }
    if (it.tele === 'rand') {
      const m = w.maps[p.map], pos = nav.randomTile(m.g, (x, y) => !m.def.portals.some(q => x >= q.r[0] - 2 && x < q.r[0] + q.r[2] + 2 && y >= q.r[1] - 2 && y < q.r[1] + q.r[3] + 2));
      if (pos) { w.ev(p.map, { t: 'fx', k: 'buff', x: p.x, y: p.y, c: '#ffffff' }); p.x = (pos.x + .5) * GD.TILE; p.y = (pos.y + .5) * GD.TILE; p.path = null; p.target = null; p.noPortal = now + 1500; p.sock.emit('snapTo'); }
    }
    if (it.tele === 'town') { const s = GD.MAPS.prontera.spawn; w.warp(p, 'prontera', s[0], s[1]); }
    P.take(p, d.id, 1); p.dirty = true;
  },

  equip(w, p, d) {
    const it = GD.ITEMS[d.id];
    if (!it || it.type !== 'equip' || p.dead || !P.count(p, d.id)) return;
    if (p.lv < it.lv) return w.sys(p, `You need level ${it.lv} to equip this.`);
    if (!GD.canEquip(p.cls, it)) return w.sys(p, 'Your class cannot use this.');
    const old = p.eq[it.slot]; P.take(p, d.id, 1); p.eq[it.slot] = d.id; if (old) P.give(p, old, 1);
    P.recalc(p);
  },
  unequip(w, p, d) {
    const id = p.eq[d.slot]; if (!id || !['weapon', 'armor', 'acc'].includes(d.slot)) return;
    if (!P.give(p, id, 1)) return w.sys(p, 'Your inventory is full.');
    p.eq[d.slot] = null; P.recalc(p);
  },
  discard(w, p, d) { if (GD.ITEMS[d.id]) P.take(p, d.id, int(d.qty, 1, 999)); },

  stat(w, p, d) {
    if (!GD.STATS.includes(d.k) || p.pts < 1 || p.stats[d.k] >= 99) return;
    p.stats[d.k]++; p.pts--; P.recalc(p);
  },
  learn(w, p, d) {
    const S = GD.SKILLS[d.id]; if (!S || S.cls !== p.cls || p.spts < 1) return;
    const lv = p.skills[d.id] | 0; if (lv >= S.max) return;
    for (const r in (S.req || {})) if ((p.skills[r] | 0) < S.req[r]) return w.sys(p, 'Prerequisite skill missing.');
    p.skills[d.id] = lv + 1; p.spts--; P.recalc(p);
  },
};

module.exports = A;
