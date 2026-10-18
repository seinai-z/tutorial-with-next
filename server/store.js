/* server/store.js — tiny JSON-file persistence for characters (swap for a real DB in production) */
const fs = require('fs'), path = require('path');

class Store {
  constructor(file) {
    this.file = file; this.data = {};
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run */ }
  }
  get(name) { return this.data[name.toLowerCase()]; }
  set(name, rec) { this.data[name.toLowerCase()] = rec; }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data)); fs.renameSync(tmp, this.file);
    } catch (e) { console.error('Save failed:', e.message); }
  }
}
module.exports = Store;
