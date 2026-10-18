/* server/index.js — HTTP + Socket.io bootstrap. Run with:  npm start  */
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const GD = require('../shared/data');
const Store = require('./store');
const World = require('./world');
const P = require('./player');
const A = require('./actions');
const C = require('./combat');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

// Static files: the game client, shared data (same file the server uses) and Phaser from node_modules.
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/vendor', express.static(path.join(ROOT, 'node_modules/phaser/dist')));
app.use(express.static(path.join(ROOT, 'public')));

const store = new Store(path.join(__dirname, 'data', 'characters.json'));
const world = new World(io, store);
world.start();

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || 0));
const str = (v, n = 40) => String(v == null ? '' : v).slice(0, n);

io.on('connection', sock => {
  let me = null;
  sock.emit('hello', { online: world.players.size });

  /** Register a handler: requires login (except 'login'), rate-limited, exceptions contained. */
  const on = (ev, fn) => sock.on(ev, (d, ack) => {
    try {
      if (ev !== 'login') {
        if (!me) return;
        const now = Date.now(); me.tokens = Math.min(40, me.tokens + (now - me.lastTok) / 1000 * 25); me.lastTok = now;
        if (me.tokens < 1) return; me.tokens--;
      }
      fn(d && typeof d === 'object' ? d : {}, typeof ack === 'function' ? ack : () => {});
    } catch (e) { console.error(`[${ev}]`, e); }
  });

  on('login', (d, ack) => {
    if (me) return;
    const name = str(d.name, 16).trim(), pw = str(d.pw);
    if (!/^[A-Za-z0-9_ ]{3,16}$/.test(name)) return ack({ err: 'Name: 3-16 letters, numbers, spaces or _' });
    if (world.findByName(name)) return ack({ err: 'That character is already online.' });
    let rec = store.get(name);
    if (rec) {
      if (hash(pw, rec.pw.salt) !== rec.pw.hash) return ack({ err: 'Wrong password.' });
    } else {
      if (!GD.CLASSES[d.cls]) return ack({ err: 'Please choose a class.' });
      const salt = crypto.randomBytes(8).toString('hex');
      rec = { pw: { salt, hash: hash(pw, salt) }, char: P.newCharacter(name, d.cls) };
    }
    me = P.hydrate(sock, rec.char, Date.now()); me.pw = rec.pw;
    world.addPlayer(me); world.savePlayer(me);
    ack({ ok: true });
    sock.emit('welcome', { me: P.profile(me, Date.now()), map: me.map, id: me.id });
    world.announce(`${me.name} has entered the world.`);
  });

  // ---- movement & combat
  on('moveTo', d => world.cmdMove(me, num(d.x, 0, 4096), num(d.y, 0, 4096)));
  on('input', d => world.cmdInput(me, d.dx, d.dy));
  on('target', d => world.cmdTarget(me, str(d.id, 12)));
  on('skill', d => C.cast(world, me, str(d.id, 20), d.tid ? str(d.tid, 40) : null));
  on('respawn', () => world.respawn(me));

  // ---- inventory / character
  on('use', d => A.use(world, me, { id: str(d.id) }));
  on('equip', d => A.equip(world, me, { id: str(d.id) }));
  on('unequip', d => A.unequip(world, me, { slot: str(d.slot, 10) }));
  on('discard', d => A.discard(world, me, { id: str(d.id), qty: d.qty }));
  on('stat', d => A.stat(world, me, { k: str(d.k, 4) }));
  on('learn', d => A.learn(world, me, { id: str(d.id) }));

  // ---- NPCs
  on('npc', d => A.npc(world, me, { id: str(d.id) }));
  on('buy', d => A.buy(world, me, { npc: str(d.npc), id: str(d.id), qty: d.qty }));
  on('sell', d => A.sell(world, me, { npc: str(d.npc), id: str(d.id), qty: d.qty }));
  on('quest', d => A.quest(world, me, { npc: str(d.npc), qid: str(d.qid), act: str(d.act, 8) }));
  on('heal', d => A.heal(world, me, { npc: str(d.npc) }));
  on('warp', d => A.warp(world, me, { npc: str(d.npc), map: str(d.map) }));

  // ---- social
  on('chat', d => world.chat(me, str(d.ch, 8), str(d.msg, 140)));
  on('party', d => world.party(me, str(d.act, 8), str(d.name, 16)));

  sock.on('disconnect', () => {
    if (!me) return;
    world.removePlayer(me); store.save();
    world.announce(`${me.name} has left the world.`);
  });
});

const shutdown = () => { console.log('\nSaving characters...'); world.saveAll(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`Prontera Online running -> http://localhost:${PORT}`));
