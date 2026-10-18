/* public/js/game.js — the Phaser 3 scene: renders the map, players, monsters, NPCs and effects,
 * and turns mouse/touch/keyboard input into server commands. The server is authoritative;
 * the client only draws what the 10 Hz snapshots say, smoothing movement between them. */
const TXT = (color = '#fff', size = 10, stroke = 3) => ({ fontFamily: 'Tahoma, Verdana, sans-serif', fontSize: size + 'px', color, stroke: '#000', strokeThickness: stroke, resolution: 2 });
const hexNum = c => Phaser.Display.Color.HexStringToColor(c || '#ffffff').color;
const rand = (a, b) => a + Math.random() * (b - a);

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    Game.scene = this; Sprites.build(this);
    this.cam = this.cameras.main; this.world = []; this.npcs = [];
    this.ents = { p: new Map(), m: new Map() };
    this.gfx = this.add.graphics().setDepth(900000);
    this.lastIn = { dx: 0, dy: 0 }; this.hold = false; this.lastMove = 0; this.tUi = 0; this.tMark = 0; this.hoverId = null; this.goNpc = null;
    this.input.mouse.disableContextMenu();
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointerup', () => { this.hold = false; });
    this.scale.on('resize', this.fit, this); this.fit();
    this.loadMap(State.mapId); this.ready = true;
  }
  fit() { this.cam.setZoom(innerWidth < 760 || innerHeight < 520 ? 1.5 : innerWidth > 2300 ? 3 : 2); }
  keep(o) { this.world.push(o); return o; }

  /* ----------------------------------------------------------------- map */
  clearWorld() {
    this.world.forEach(o => o.destroy()); this.world = [];
    this.npcs.forEach(n => { n.spr.destroy(); n.sh.destroy(); n.label.destroy(); n.mark.destroy(); }); this.npcs = [];
    for (const m of [this.ents.p, this.ents.m]) { m.forEach(e => this.destroyEnt(e)); m.clear(); }
  }
  loadMap(id) {
    this.clearWorld(); State.mapId = id; const g = GD.getMap(id); this.g = g;
    const key = 'map_' + id; if (!this.textures.exists(key)) this.textures.addCanvas(key, Sprites.renderMap(g));
    this.keep(this.add.image(0, 0, key).setOrigin(0).setDepth(0));
    this.cam.setBounds(0, 0, g.w * GD.TILE, g.h * GD.TILE); this.cam.stopFollow(); this.followed = false;
    for (const pt of g.def.portals) {                                       // glowing warp portals
      const cx = (pt.r[0] + pt.r[2] / 2) * GD.TILE, cy = (pt.r[1] + pt.r[3] / 2) * GD.TILE, sc = Math.max(pt.r[2], pt.r[3]) * 0.5;
      const sp = this.keep(this.add.image(cx, cy, 'portal').setDepth(2).setAlpha(0.9).setScale(sc));
      this.tweens.add({ targets: sp, angle: 360, duration: 5000, repeat: -1 });
      this.keep(this.add.image(cx, cy, 'glow').setTint(0x9b6bff).setAlpha(0.35).setDepth(2).setScale(sc * 1.1));
      this.keep(this.add.text(cx, cy - sc * 32 - 4, '» ' + GD.MAPS[pt.to].name, TXT('#e3d4ff', 10)).setOrigin(0.5, 1).setDepth(850000));
    }
    for (const id2 in GD.NPCS) {                                            // NPCs
      const n = GD.NPCS[id2]; if (n.map !== id) continue;
      const x = (n.t[0] + 0.5) * GD.TILE, y = (n.t[1] + 0.5) * GD.TILE;
      const spr = this.add.sprite(x, y, 'npc_' + id2, 'i').setOrigin(16 / 36, 0.944).setDepth(y);
      const sh = this.add.image(x, y - 1, 'shadow').setDepth(y - 1);
      const label = this.add.text(x, y - 38, n.name, TXT('#b8ffb8', 10)).setOrigin(0.5, 1).setDepth(850000);
      const mark = this.add.text(x, y - 52, '', TXT('#ffe14d', 16, 4)).setOrigin(0.5, 1).setDepth(850001);
      this.npcs.push({ id: id2, n, x, y, spr, sh, label, mark });
    }
    UI.setMap(g); Sound.music(g.def.kind); this.updateMarkers();
  }
  qState(qid) {
    const m = State.me, Q = GD.QUESTS[qid], s = m.quests[qid];
    if (s) return s.st === 'done' ? 'done' : (s.n >= Q.goal.n ? 'ready' : 'active');
    return (m.lv < Q.minLv || (Q.prereq && !(m.quests[Q.prereq] && m.quests[Q.prereq].st === 'done'))) ? 'locked' : 'avail';
  }
  updateMarkers() {                                                          // "!" / "?" above quest givers
    if (!State.me) return;
    for (const n of this.npcs) {
      let mk = '';
      if (n.n.kind === 'quest') { const st = n.n.quests.map(q => this.qState(q)); mk = st.includes('ready') ? '?' : st.includes('avail') ? '!' : ''; }
      n.mark.setText(mk).setColor(mk === '?' ? '#8dff8d' : '#ffe14d');
    }
  }

  /* ------------------------------------------------------------ entities */
  mkEnt(kind, d) {
    let spr, size, sh;
    if (kind === 'p') { spr = this.add.sprite(d.x, d.y, 'char_' + d.c, 'i').setOrigin(16 / 36, 0.944); size = 34; sh = this.add.image(d.x, d.y, 'shadow'); }
    else { const s = Sprites.monSize(d.k); spr = this.add.sprite(d.x, d.y, 'mob_' + d.k, 'f0').setOrigin(0.5, 0.92); size = s.h; sh = this.add.image(d.x, d.y, 'shadow').setScale(Math.max(0.8, s.w / 26)); }
    const label = this.add.text(d.x, d.y, '', TXT()).setOrigin(0.5, 1).setDepth(850000);
    return { kind, id: d.id, spr, sh, label, tx: d.x, ty: d.y, d, size, bub: null, bubT: 0, lt: '' };
  }
  destroyEnt(e) { e.spr.destroy(); e.sh.destroy(); e.label.destroy(); if (e.bub) e.bub.destroy(); }

  /** Apply a world snapshot from the server. */
  onSnap(d) {
    const seen = new Set();
    for (const pd of d.p) {
      let e = this.ents.p.get(pd.id); if (!e) { e = this.mkEnt('p', pd); this.ents.p.set(pd.id, e); }
      e.tx = pd.x; e.ty = pd.y; e.d = pd; seen.add(pd.id);
      if (pd.id === State.id) {
        State.pos = { x: pd.x, y: pd.y };
        if (!this.followed) { this.cam.centerOn(pd.x, pd.y); this.cam.startFollow(e.spr, true, 0.12, 0.12); this.followed = true; }
      }
    }
    for (const [id, e] of this.ents.p) if (!seen.has(id)) { this.destroyEnt(e); this.ents.p.delete(id); if (State.target && State.target.id === id) UI.clearTarget(); }
    seen.clear();
    for (const md of d.m) {
      let e = this.ents.m.get(md.id); if (!e) { e = this.mkEnt('m', md); this.ents.m.set(md.id, e); }
      e.tx = md.x; e.ty = md.y; e.d = md; seen.add(md.id);
    }
    for (const [id, e] of this.ents.m) if (!seen.has(id)) {                    // died or left view: fade out
      this.ents.m.delete(id); if (State.target && State.target.id === id) UI.clearTarget();
      this.tweens.add({ targets: [e.spr, e.sh, e.label], alpha: 0, duration: 380, onComplete: () => this.destroyEnt(e) });
      this.tweens.add({ targets: e.spr, scaleY: 0.6, y: e.spr.y + 6, duration: 380 });
    }
    for (const ev of d.ev) this.onEvent(ev);
  }

  /* -------------------------------------------------------------- update */
  update(time, delta) {
    if (!this.g) return;
    const k = 1 - Math.exp(-Math.min(0.1, delta / 1000) * 14);
    for (const e of this.ents.p.values()) this.stepPlayer(e, k, time);
    for (const e of this.ents.m.values()) this.stepMon(e, k, time);
    for (const n of this.npcs) n.mark.y = n.y - 52 + Math.sin(time / 260) * 2;

    // keyboard movement vector -> server
    const v = UI.moveVec();
    if (v.dx !== this.lastIn.dx || v.dy !== this.lastIn.dy) {
      this.lastIn = v; Net.emit('input', v);
      if (v.dx || v.dy) { this.goNpc = null; this.hold = false; if (State.target && State.target.kind === 'm') UI.clearTarget(); }
    }
    // hold the mouse/finger down to keep walking toward the pointer
    const ptr = this.input.activePointer;
    if (this.hold && ptr.isDown && time - this.lastMove > 180 && !State.dead) { const w = this.cam.getWorldPoint(ptr.x, ptr.y); this.lastMove = time; Net.emit('moveTo', { x: w.x, y: w.y }); }
    // walk up to an NPC, then talk
    if (this.goNpc) {
      const n = this.npcs.find(q => q.id === this.goNpc);
      if (!n) this.goNpc = null; else if (Math.hypot(n.x - State.pos.x, n.y - State.pos.y) < 90) { Net.emit('npc', { id: n.id }); this.goNpc = null; }
    }
    this.drawBars(time);
    if (time - this.tUi > 100) { this.tUi = time; this.uiTick(time); }
  }

  stepPlayer(e, k, time) {
    const s = e.spr, d = e.d;
    if (Math.hypot(e.tx - s.x, e.ty - s.y) > 160) { s.x = e.tx; s.y = e.ty; } else { s.x += (e.tx - s.x) * k; s.y += (e.ty - s.y) * k; }
    s.setDepth(s.y); e.sh.setPosition(s.x, s.y - 1).setDepth(s.y - 1);
    const f = d.a === 'a' ? 'a' : d.a === 'c' ? 'c' : d.a === 'w' ? ((Math.floor(time / 140) % 2) ? 'w1' : 'w0') : 'i';
    if (s.frame.name !== f) s.setFrame(f);
    s.setFlipX(d.d < 0);
    if (d.a === 'x') s.setAngle(d.d < 0 ? -90 : 90).setAlpha(0.7); else s.setAngle(0).setAlpha(d.h ? 0.4 : 1);
    const me = e.id === State.id, mate = State.party && d.pt && d.pt === State.party.id;
    const txt = d.n + (me ? '' : '');
    if (e.lt !== txt) { e.lt = txt; e.label.setText(txt); }
    e.label.setColor(me ? '#ffffa8' : mate ? '#8de7ff' : '#ffffff').setPosition(s.x, s.y - 38).setVisible(!d.h || me);
    if (e.bub) { if (time > e.bubT) { e.bub.destroy(); e.bub = null; } else e.bub.setPosition(s.x, s.y - 52); }
  }
  stepMon(e, k, time) {
    const s = e.spr, d = e.d;
    if (Math.hypot(e.tx - s.x, e.ty - s.y) > 160) { s.x = e.tx; s.y = e.ty; } else { s.x += (e.tx - s.x) * k; s.y += (e.ty - s.y) * k; }
    s.setDepth(s.y); e.sh.setPosition(s.x, s.y - 1).setDepth(s.y - 1);
    const rate = d.a === 'w' ? 200 : d.a === 'a' ? 90 : 520, f = 'f' + (Math.floor(time / rate) % 2);
    if (s.frame.name !== f) s.setFrame(f);
    s.setFlipX(d.d < 0);
    if (d.sl) s.setTint(0x88ccff); else if (d.po) s.setTint(0xa6ff7a); else if (s.isTinted && time > (e.flashT || 0)) s.clearTint();
    const show = (State.target && State.target.id === e.id) || this.hoverId === e.id || d.hp < d.mh;
    if (show) { const txt = `${GD.MONSTERS[d.k].name}  Lv.${GD.MONSTERS[d.k].lv}`; if (e.lt !== txt) { e.lt = txt; e.label.setText(txt); } e.label.setColor('#ffd0d0').setPosition(s.x, s.y - e.size - 10).setVisible(true); }
    else e.label.setVisible(false);
  }

  /** HP bars, SP bars and the target ring are drawn in one Graphics object. */
  drawBars(time) {
    const g = this.gfx; g.clear();
    for (const e of this.ents.m.values()) {
      const t = State.target && State.target.id === e.id;
      if (t) { g.lineStyle(2, 0xff5a5a, 0.7 + 0.3 * Math.sin(time / 120)); g.strokeEllipse(e.spr.x, e.spr.y - 1, Math.max(30, Sprites.monSize(e.d.k).w), 12); }
      if (t || e.d.hp < e.d.mh) {
        const w = Math.max(28, Sprites.monSize(e.d.k).w), x = e.spr.x - w / 2, y = e.spr.y - e.size - 4, f = Math.max(0, e.d.hp / e.d.mh);
        g.fillStyle(0x000000, 0.75); g.fillRect(x - 1, y - 1, w + 2, 6); g.fillStyle(f > 0.5 ? 0x4fcf5a : f > 0.25 ? 0xf0a020 : 0xe53935, 1); g.fillRect(x, y, w * f, 4);
      }
    }
    for (const e of this.ents.p.values()) {
      const me = e.id === State.id, mate = State.party && e.d.pt && e.d.pt === State.party.id, tp = State.target && State.target.id === e.id;
      if (tp) { g.lineStyle(2, 0x7dd8ff, 0.9); g.strokeEllipse(e.spr.x, e.spr.y - 1, 30, 12); }
      if (!me && !mate && !tp) continue;
      const hp = me ? State.hp : e.d.hp, mh = e.d.mh, x = e.spr.x - 16, y = e.spr.y + 3;
      g.fillStyle(0x000000, 0.8); g.fillRect(x - 1, y - 1, 34, me ? 9 : 6);
      g.fillStyle(0x4fcf5a, 1); g.fillRect(x, y, 32 * Math.max(0, Math.min(1, hp / mh)), 4);
      if (me && State.me) { g.fillStyle(0x3b8be8, 1); g.fillRect(x, y + 5, 32 * Math.max(0, Math.min(1, State.sp / State.me.d.maxSp)), 3); }
    }
  }

  /** ~10 Hz: HUD pieces that need entity data. */
  uiTick(time) {
    UI.drawMinimap(); UI.updateCooldowns();
    const me = this.ents.p.get(State.id);
    if (me) {
      const wv = this.cam.worldView, z = this.cam.zoom;
      UI.setShade(State.tod, this.g.def.kind, (me.spr.x - wv.x) * z, (me.spr.y - 16 - wv.y) * z);
      const n = UI.flags.dialogNpc && this.npcs.find(q => q.id === UI.flags.dialogNpc);
      if (n && Math.hypot(n.x - me.spr.x, n.y - me.spr.y) > 240) UI.toggle('npc', false);
    }
    const t = State.target;                                                      // target panel
    if (t) {
      const e = (t.kind === 'm' ? this.ents.m : this.ents.p).get(t.id), d = e && e.d;
      if (!d) { if (t.kind === 'p') UI.clearTarget(); }
      else if (t.kind === 'm') { const D = GD.MONSTERS[d.k]; UI.showTarget({ kind: 'm', id: t.id, name: D.name, sub: `Lv ${D.lv}${D.boss ? ' - BOSS' : ''}`, hp: d.hp, mh: d.mh }); }
      else UI.showTarget({ kind: 'p', id: t.id, name: d.n, sub: `${GD.CLASSES[d.c].name} Lv ${d.lv}`, hp: d.hp, mh: d.mh });
    }
    // hover cursor
    const p = this.input.activePointer, w = this.cam.getWorldPoint(p.x, p.y), m = this.pickMon(w.x, w.y), n = m ? null : this.pickNpc(w.x, w.y);
    this.hoverId = m ? m.id : null; this.game.canvas.style.cursor = m ? 'crosshair' : n ? 'pointer' : 'default';
    if (time - this.tMark > 600) { this.tMark = time; this.updateMarkers(); }
  }

  /* --------------------------------------------------------------- input */
  pickMon(x, y) {
    let best = null;
    for (const e of this.ents.m.values()) { const b = e.spr.getBounds(); if (Phaser.Geom.Rectangle.Contains(b, x, y) && (!best || e.spr.y > best.spr.y)) best = e; }
    return best;
  }
  pickNpc(x, y) { for (const n of this.npcs) if (Phaser.Geom.Rectangle.Contains(n.spr.getBounds(), x, y)) return n; return null; }
  pickPlayer(x, y) {
    let best = null;
    for (const e of this.ents.p.values()) if (Phaser.Geom.Rectangle.Contains(e.spr.getBounds(), x, y) && (!best || e.spr.y > best.spr.y)) best = e;
    return best;
  }
  onDown(ptr) {
    Sound.init(); if (State.dead) return;
    const w = this.cam.getWorldPoint(ptr.x, ptr.y), m = this.pickMon(w.x, w.y);
    if (m) { this.setTarget('m', m.id); return; }
    const n = this.pickNpc(w.x, w.y);
    if (n) { this.goNpc = n.id; Net.emit('moveTo', { x: n.x, y: n.y + 34 }); return; }
    const o = this.pickPlayer(w.x, w.y);
    if (o && o.id !== State.id) { this.setTarget('p', o.id); return; }
    this.goNpc = null; this.hold = true; this.lastMove = this.time.now;
    if (State.target && State.target.kind === 'm') UI.clearTarget();
    Net.emit('moveTo', { x: w.x, y: w.y });
    const c = this.add.circle(w.x, w.y, 7).setStrokeStyle(2, 0xffffff).setDepth(5);               // click marker
    this.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 350, onComplete: () => c.destroy() });
  }
  setTarget(kind, id) {
    State.target = { kind, id }; if (kind === 'm') Net.emit('target', { id }); Sound.sfx('click');
  }
  targetNearest() {
    let best = null, bd = 420;
    for (const e of this.ents.m.values()) { const d = Math.hypot(e.tx - State.pos.x, e.ty - State.pos.y); if (d < bd) { bd = d; best = e; } }
    if (best) this.setTarget('m', best.id); else UI.toast('No monsters nearby.');
  }

  /* -------------------------------------------------------------- effects */
  later(ms, fn) { if (ms) this.time.delayedCall(ms, fn); else fn(); }
  onEvent(ev) {
    switch (ev.t) {
      case 'dmg': this.later(ev.dl, () => this.floatDmg(ev)); break;
      case 'hit': this.later(ev.dl, () => this.burst(ev.x, ev.y, ev.c, ev.big ? 9 : 5)); break;
      case 'proj': this.later(ev.dl, () => this.proj(ev)); break;
      case 'ring': this.ring(ev); break;
      case 'fx': if (ev.k === 'heal') { this.sparkles(ev.x, ev.y, ev.c); Sound.sfx('heal'); } else { this.buffFx(ev.x, ev.y, ev.c); Sound.sfx('cast'); } break;
      case 'lvup': { this.ring({ x: ev.x, y: ev.y, r: 70, c: '#ffe27a' }); this.sparkles(ev.x, ev.y, '#ffe27a'); this.floatText(ev.x, ev.y - 44, 'LEVEL UP!', '#ffe27a', 16); Sound.sfx('lvup'); break; }
      case 'cast': Sound.sfx('cast'); break;
      case 'die': this.burst(ev.x, ev.y - 10, '#cfcfcf', 8); Sound.sfx('die'); break;
      case 'dead': if (ev.id === State.id) Sound.sfx('die'); break;
      case 'loot': { const e = this.ents.p.get(ev.id); if (e) this.floatText(e.spr.x, e.spr.y - 52, ev.text, '#ffe08a', 10); if (ev.id === State.id) Sound.sfx('pickup'); break; }
      case 'say': { const e = this.ents.p.get(ev.id); if (!e) break; if (e.bub) e.bub.destroy();
        e.bub = this.add.text(e.spr.x, e.spr.y - 52, ev.msg, { fontFamily: 'Tahoma, Verdana, sans-serif', fontSize: '10px', color: '#222', backgroundColor: '#ffffff', padding: { x: 4, y: 2 }, resolution: 2, wordWrap: { width: 150 } }).setOrigin(0.5, 1).setDepth(960000);
        e.bubT = this.time.now + 4500; break; }
    }
  }
  floatText(x, y, txt, col, size) {
    const t = this.add.text(x, y, txt, Object.assign(TXT(col, size), { fontStyle: 'bold' })).setOrigin(0.5, 1).setDepth(950000);
    this.tweens.add({ targets: t, y: y - 26, duration: 1100, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 500, onComplete: () => t.destroy() });
  }
  floatDmg(ev) {
    const e = this.ents.p.get(ev.id) || this.ents.m.get(ev.id), x = e ? e.spr.x : ev.x, y = e ? e.spr.y : ev.y, top = e ? (e.kind === 'p' ? 46 : e.size + 8) : 30;
    let txt = String(ev.v), col = '#ffffff', size = 12;
    switch (ev.k) {
      case 'miss': txt = 'Miss'; col = '#cfd6e8'; size = 10; Sound.sfx('miss'); break;
      case 'h': txt = '+' + ev.v; col = '#6dff8a'; break;
      case 'sp': txt = '+' + ev.v; col = '#6db8ff'; break;
      case 'dot': col = '#a6ff7a'; size = 10; break;
      case 'pd': col = ev.id === State.id ? '#ff5a5a' : '#ffb0b0'; if (ev.id === State.id) Sound.sfx('hurt'); break;
      default: if (ev.c) { col = '#ffcc33'; size = 17; txt = ev.v + '!'; Sound.sfx('crit'); } else Sound.sfx('hit');
    }
    const t = this.add.text(x + rand(-8, 8), y - top, txt, Object.assign(TXT(col, size), { fontStyle: 'bold' })).setOrigin(0.5, 1).setDepth(950000);
    if (ev.c) { t.setScale(1.7); this.tweens.add({ targets: t, scale: 1, duration: 160 }); }
    this.tweens.add({ targets: t, y: t.y - 30, duration: 950, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 550, duration: 400, onComplete: () => t.destroy() });
    if (e && e.kind === 'm' && ev.k === 'md') { e.spr.setTintFill(0xffffff); e.flashT = this.time.now + 80; }
  }
  burst(x, y, c, n) {
    const col = hexNum(c);
    for (let i = 0; i < n; i++) {
      const s = this.add.image(x, y, 'spark').setTint(col).setScale(rand(0.3, 0.6)).setDepth(900001), a = rand(0, 6.28), r = rand(12, 26);
      this.tweens.add({ targets: s, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, scale: 0, duration: 320, onComplete: () => s.destroy() });
    }
  }
  sparkles(x, y, c) {
    const col = hexNum(c);
    for (let i = 0; i < 8; i++) {
      const s = this.add.image(x + rand(-14, 14), y - rand(0, 18), 'spark').setTint(col).setScale(rand(0.3, 0.6)).setDepth(900001);
      this.tweens.add({ targets: s, y: s.y - rand(24, 44), alpha: 0, duration: rand(500, 800), delay: i * 40, onComplete: () => s.destroy() });
    }
  }
  buffFx(x, y, c) {
    const e = this.add.ellipse(x, y - 4, 40, 14).setStrokeStyle(2, hexNum(c)).setDepth(900001);
    this.tweens.add({ targets: e, y: y - 44, scaleX: 1.4, alpha: 0, duration: 650, onComplete: () => e.destroy() });
  }
  proj(ev) {
    let o; const rot = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
    if (ev.s === 'arrow') o = this.add.rectangle(ev.x, ev.y, 13, 2, hexNum(ev.c)).setRotation(rot);
    else o = this.add.image(ev.x, ev.y, 'glow').setTint(hexNum(ev.c)).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55);
    o.setDepth(900001); const dur = Phaser.Math.Clamp(Math.hypot(ev.tx - ev.x, ev.ty - ev.y) / 1.7, 90, 300);
    this.tweens.add({ targets: o, x: ev.tx, y: ev.ty, duration: dur, onComplete: () => { o.destroy(); this.burst(ev.tx, ev.ty, ev.c, 5); } });
  }
  bolt(x, y) {
    const g = this.add.graphics().setDepth(900002); g.lineStyle(3, 0xfff06a, 1); g.beginPath(); let cx = x, cy = y - 170; g.moveTo(cx, cy);
    while (cy < y) { cy = Math.min(y, cy + 22); cx = cy >= y ? x : x + rand(-12, 12); g.lineTo(cx, cy); } g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() }); this.burst(x, y, '#fff06a', 7);
  }
  ring(ev) {
    const col = hexNum(ev.c), boss = ev.k === 'boss';
    const c = this.add.circle(ev.x, ev.y, ev.r, col, 0.16).setStrokeStyle(boss ? 5 : 3, col).setDepth(3).setScale(0.2);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: boss ? 600 : 480, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
    if (boss) { this.cam.shake(220, 0.004); Sound.sfx('boss'); } else Sound.sfx('cast');
    if (ev.k === 'arrows') for (let i = 0; i < 14; i++) {
      const a = rand(0, 6.28), r = rand(0, ev.r * 0.9), ax = ev.x + Math.cos(a) * r, ay = ev.y + Math.sin(a) * r * 0.7;
      const ar = this.add.rectangle(ax, ay - 150, 2, 12, 0xe8d3a8).setDepth(900001);
      this.tweens.add({ targets: ar, y: ay, delay: i * 35, duration: 240, onComplete: () => { ar.destroy(); this.burst(ax, ay, '#e8d3a8', 2); } });
    }
    if (ev.c === GD.EL.wind) for (let i = 0; i < 4; i++) { const a = rand(0, 6.28), r = rand(0, ev.r * 0.8); this.later(i * 120, () => this.bolt(ev.x + Math.cos(a) * r, ev.y + Math.sin(a) * r * 0.7)); }
    if (ev.c === GD.EL.fire && !boss) for (let i = 0; i < 10; i++) { const a = rand(0, 6.28), r = rand(0, ev.r * 0.9); this.burst(ev.x + Math.cos(a) * r, ev.y + Math.sin(a) * r * 0.7, '#ff9a4d', 3); }
  }
}

const Game = {
  scene: null, game: null,
  start() {
    this.game = new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', width: window.innerWidth, height: window.innerHeight, backgroundColor: '#0a0d18', pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE }, input: { keyboard: false }, scene: GameScene, render: { powerPreference: 'high-performance' },
    });
  },
  onSnap(d) { if (this.scene && this.scene.ready) this.scene.onSnap(d); },
  loadMap(id) { if (this.scene && this.scene.ready) this.scene.loadMap(id); },
  targetNearest() { if (this.scene && this.scene.ready) this.scene.targetNearest(); },
};
