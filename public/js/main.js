/* public/js/main.js — boot: login / character creation screen, then wire server events to the UI & game. */
(function () {
  const $ = id => document.getElementById(id);
  let cls = null;

  /* ---- login screen with class cards ---- */
  function buildLogin() {
    const grid = $('lg-classes');
    for (const id in GD.CLASSES) {
      const C = GD.CLASSES[id], card = document.createElement('div'); card.className = 'class-card';
      const cv = Sprites.portrait(Sprites.LOOK[id], 3); card.appendChild(cv); card.insertAdjacentHTML('beforeend', `<b>${C.name}</b>`);
      card.onclick = () => {
        cls = id; document.querySelectorAll('.class-card').forEach(c => c.classList.toggle('on', c === card));
        const sk = C.skills.map(s => GD.SKILLS[s].name).join(', ');
        $('lg-desc').innerHTML = `<b>${C.name}</b>: ${C.blurb}<br><span class="small muted">Skills: ${sk}</span>`;
      };
      grid.appendChild(card);
    }
    grid.firstChild.click();
    const saved = localStorage.getItem('po_name'); if (saved) $('lg-name').value = saved;
    $('lg-go').onclick = login;
    [$('lg-name'), $('lg-pw')].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') login(); }));
  }

  function login() {
    Sound.init();
    const name = $('lg-name').value.trim(), pw = $('lg-pw').value; $('lg-err').textContent = '';
    if (name.length < 3) return ($('lg-err').textContent = 'Please enter a name (3-16 characters).');
    $('lg-go').disabled = true;
    Net.emit('login', { name, pw, cls }, res => {
      $('lg-go').disabled = false;
      if (res && res.err) $('lg-err').textContent = res.err; else localStorage.setItem('po_name', name);
    });
  }

  /* ---- network events ---- */
  function wire() {
    Net.on('hello', d => { $('lg-online').textContent = `${d.online} player(s) online`; });
    Net.on('welcome', d => {
      State.id = d.id; State.mapId = d.map; State.me = null; UI.setMe(d.me);
      $('login').hidden = true; $('ui').hidden = false; Game.start();
      UI.chat({ ch: 'sys', msg: 'Welcome to Prontera Online! Click to move, click monsters to attack, 1-9 for skills. Press Enter to chat (/g global, /p party).' });
    });
    Net.on('self', d => UI.setMe(d));
    Net.on('snap', d => {
      State.snap = d; State.tod = d.tod; State.hp = d.me.hp; State.sp = d.me.sp; UI.updateBars(); Game.onSnap(d);
    });
    Net.on('map', d => { State.mapId = d.id; UI.hideDeath(); Sound.sfx('warp'); Game.loadMap(d.id); });
    Net.on('chat', m => UI.chat(m));
    Net.on('dialog', d => UI.dialog(d));
    Net.on('party', p => UI.setParty(p));
    Net.on('invite', d => UI.showInvite(d.from));
    Net.on('dead', () => UI.showDeath());
    Net.on('cd', d => { State.cds[d.id] = Date.now() + d.ms; });
    Net.on('disconnect', () => { UI.toast('Disconnected from server. Reload the page to reconnect.'); UI.chat({ ch: 'sys', msg: 'Disconnected from server.' }); });
  }

  UI.init(); buildLogin(); Net.connect(); wire();
})();
