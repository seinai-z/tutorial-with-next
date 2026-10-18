/* public/js/state.js — shared client state + a thin Socket.io wrapper. */
const State = {
  id: null,            // my socket id (also my player entity id)
  me: null,            // my full profile (stats, inventory, skills, ...) from the server 'self' event
  mapId: null, hp: 1, sp: 0, tod: 0.4, pos: { x: 0, y: 0 },
  snap: { p: [], m: [] },   // latest world snapshot
  party: null, target: null, // target: { kind:'m'|'p', id }
  cds: {},                   // skill id -> cooldown end timestamp
  dead: false,
};
const Net = {
  sock: null,
  connect() { this.sock = io(); return this.sock; },
  emit(ev, d, cb) { if (this.sock) this.sock.emit(ev, d || {}, cb); },
  on(ev, fn) { this.sock.on(ev, fn); },
};
