/* public/js/ui.js — the DOM user interface: windows, hotbar, chat, shops, quests, party, minimap.
 * Rendering is plain template strings; clicks use event delegation (data-* attributes). */
const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const WINS = ['status', 'inv', 'equip', 'skills', 'party', 'quest'];
  const flags = { typing: false, dialogNpc: null };
  const keys = new Set();                        // held movement keys
  let hot = new Array(9).fill(null), hotName = null, z = 20, selItem = null, filter = 'all', shopTab = 'buy', dlg = null;
  let hover = null, mm = { canvas: null, s: 1, g: null }, opened = 0, lastBuff = 0, buffsAt = 0, shadeKey = '';

  /* --------------------------------------------------------------- windows */
  const small = () => innerWidth < 760 || innerHeight < 560;
  function place(w) {
    if (small()) { w.style.left = '4px'; w.style.top = '52px'; w.style.width = 'calc(100vw - 8px)'; return; }
    const wd = w.id === 'win-inv' ? 300 : w.id === 'win-npc' ? 380 : 330, n = opened % 5; opened++;
    w.style.width = wd + 'px'; w.style.left = Math.max(8, innerWidth - wd - 14 - n * 36) + 'px'; w.style.top = (196 + n * 30) + 'px';
  }
  const front = w => { w.style.zIndex = ++z; };
  function draggable(w) {
    const t = w.querySelector('.win-title'); if (!t) return;
    w.addEventListener('pointerdown', () => front(w), true);
    t.addEventListener('pointerdown', e => {
      if (e.target.closest('.x')) return;
      const r = w.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top; t.setPointerCapture(e.pointerId);
      const mv = ev => { w.style.left = clamp(ev.clientX - ox, 0, innerWidth - 60) + 'px'; w.style.top = clamp(ev.clientY - oy, 0, innerHeight - 30) + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; };
      const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); };
      t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up);
    });
  }
  function toggle(name, force) {
    const w = $('win-' + name); const show = force !== undefined ? force : w.hidden;
    if (show) { if (!w.style.left) place(w); w.hidden = false; front(w); render(name); } else w.hidden = true;
    if (name === 'npc' && !show) { flags.dialogNpc = null; dlg = null; }
  }
  const render = name => ({ status: renderStatus, inv: renderInv, equip: renderEquip, skills: renderSkills, party: renderParty, quest: renderQuests })[name]?.();
  const isOpen = name => !$('win-' + name).hidden;

  /* ------------------------------------------------------------------ init */
  function init() {
    document.querySelectorAll('#ui .win').forEach(draggable);
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { const w = b.closest('.win'); w.hidden = true; if (w.id === 'win-npc') { flags.dialogNpc = null; dlg = null; } });
    document.querySelectorAll('[data-win]').forEach(b => b.onclick = () => { Sound.init(); Sound.sfx('click'); toggle(b.dataset.win); });
    $('btn-sound').onclick = () => { Sound.init(); toast(Sound.toggle() ? 'Sound on' : 'Sound off'); };
    $('btn-auto').onclick = () => Game.targetNearest();
    $('btn-respawn').onclick = () => Net.emit('respawn');
    $('inv-yes').onclick = () => { Net.emit('party', { act: 'accept' }); $('invite').hidden = true; };
    $('inv-no').onclick = () => { Net.emit('party', { act: 'decline' }); $('invite').hidden = true; };
    buildHotbar(); bindChat(); bindKeys(); bindWindows();
    $('chat-log').addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  }

  /** Delegated click handlers for every window body. */
  function bindWindows() {
    $('status-body').onclick = e => { const b = e.target.closest('[data-stat]'); if (b) Net.emit('stat', { k: b.dataset.stat }); };
    $('inv-body').onclick = e => {
      const s = e.target.closest('[data-item]'); if (s) { selItem = s.dataset.item; renderInv(); return; }
      const b = e.target.closest('[data-act]'); if (!b || !selItem) return;
      if (b.dataset.act === 'use') useItem(selItem); else if (b.dataset.act === 'drop') { Net.emit('discard', { id: selItem, qty: 1 }); }
    };
    $('inv-body').ondblclick = e => { const s = e.target.closest('[data-item]'); if (s) useItem(s.dataset.item); };
    $('equip-body').onclick = e => { const s = e.target.closest('[data-slot]'); if (s) Net.emit('unequip', { slot: s.dataset.slot }); };
    $('skills-body').onclick = e => {
      const l = e.target.closest('[data-learn]'); if (l) { Net.emit('learn', { id: l.dataset.learn }); return; }
      const u = e.target.closest('[data-use]'); if (u) useSkill(u.dataset.use);
    };
    $('party-body').onclick = e => {
      const b = e.target.closest('[data-pa]'), k = e.target.closest('[data-kick]');
      if (k) Net.emit('party', { act: 'kick', name: k.dataset.kick });
      else if (b) Net.emit('party', { act: b.dataset.pa, name: ($('pa-name') || {}).value || '' });
    };
    $('target').onclick = e => { const b = e.target.closest('[data-invite]'); if (b) Net.emit('party', { act: 'invite', name: b.dataset.invite }); };
    $('npc-body').onclick = e => {
      const t = e.target.closest('[data-tab]'); if (t) { shopTab = t.dataset.tab; renderDialog(); return; }
      const by = e.target.closest('[data-buy]'); if (by) return Net.emit('buy', { npc: dlg.id, id: by.dataset.buy, qty: +by.dataset.n || 1 });
      const sl = e.target.closest('[data-sell]'); if (sl) return Net.emit('sell', { npc: dlg.id, id: sl.dataset.sell, qty: sl.dataset.all ? 999 : 1 });
      const q = e.target.closest('[data-quest]'); if (q) return Net.emit('quest', { npc: dlg.id, qid: q.dataset.quest, act: q.dataset.act });
      const w = e.target.closest('[data-warp]'); if (w) { Net.emit('warp', { npc: dlg.id, map: w.dataset.warp }); toggle('npc', false); return; }
      if (e.target.closest('[data-heal]')) Net.emit('heal', { npc: dlg.id });
    };
    // hover (for Shift+number hotkey assignment) on inventory items and skills
    const hv = e => { const i = e.target.closest('[data-item]'), s = e.target.closest('[data-use]'); hover = i ? { k: 'item', id: i.dataset.item } : s ? { k: 'skill', id: s.dataset.use } : null; };
    $('inv-body').onmouseover = hv; $('skills-body').onmouseover = hv; $('inv-body').onmouseleave = $('skills-body').onmouseleave = () => { hover = null; };
  }

  /* ----------------------------------------------------------- basic info */
  function setMe(m) {
    const first = !State.me; State.me = m; State.hp = m.hp; State.sp = m.sp; buffsAt = Date.now();
    if (first || hotName !== m.name) { initHotbar(); $('b-face').getContext('2d').drawImage(Sprites.portrait(Sprites.LOOK[m.cls], 3), 0, 0); }
    renderBasic(); autoFillHotbar();
    WINS.forEach(n => isOpen(n) && render(n));
    if (dlg) renderDialog(); renderHotbar(); renderTrack(); updateBars();
  }
  function renderBasic() {
    const m = State.me; if (!m) return;
    $('b-name').textContent = m.name; $('b-class').textContent = `${GD.CLASSES[m.cls].name}  Lv. ${m.lv}`; $('b-zeny').textContent = m.zeny.toLocaleString();
    const pct = m.lv >= GD.MAX_LV ? 100 : m.exp / m.next * 100;
    $('b-exp').style.width = pct + '%'; $('b-exp-t').textContent = m.lv >= GD.MAX_LV ? 'MAX' : `EXP ${pct.toFixed(1)}%`;
  }
  function updateBars() {
    const m = State.me; if (!m) return; const mh = m.d.maxHp, ms = m.d.maxSp, f = State.hp / mh;
    $('b-hp').style.width = clamp(f * 100, 0, 100) + '%'; $('b-hp-t').textContent = `HP ${Math.ceil(State.hp)} / ${mh}`;
    $('b-hp').parentNode.className = 'bar hp' + (f < .25 ? ' low' : f < .5 ? ' mid' : '');
    $('b-sp').style.width = clamp(State.sp / ms * 100, 0, 100) + '%'; $('b-sp-t').textContent = `SP ${Math.floor(State.sp)} / ${ms}`;
  }
  function renderBuffs() {
    const m = State.me; if (!m) return; const el = Date.now() - buffsAt;
    $('b-buffs').innerHTML = (m.buffs || []).filter(b => b.ms - el > 0).map(b => `<span>${GD.SKILLS[b.id] ? GD.SKILLS[b.id].icon : '?'} ${Math.ceil((b.ms - el) / 1000)}s</span>`).join('') + (m.hidden ? '<span>👻 hidden</span>' : '');
  }

  /* ---------------------------------------------------------------- status */
  function renderStatus() {
    const m = State.me, d = m.d; let h = `<div class="small muted">Status points: <b style="color:#b3261e">${m.pts}</b></div>`;
    for (const k of GD.STATS) {
      const base = m.stats[k], bonus = d.s[k] - base;
      h += `<div class="stat-row"><b>${k.toUpperCase()}</b><span class="v">${base}${bonus ? ` <span class="bonus">+${bonus}</span>` : ''}</span><button class="btn sm" data-stat="${k}" ${m.pts < 1 || base >= 99 ? 'disabled' : ''}>+</button></div>`;
    }
    h += `<div class="sect">Combat</div><div class="kv"><span>ATK</span><b>${d.atk}</b><span>MATK</span><b>${d.matk}</b><span>DEF</span><b>${d.def}</b><span>MDEF</span><b>${d.mdef}</b>` +
      `<span>HIT</span><b>${d.hit}</b><span>FLEE</span><b>${d.flee}</b><span>CRIT</span><b>${d.crit.toFixed(1)}%</b><span>Attack speed</span><b>${(1000 / d.aspd).toFixed(2)}/s</b>` +
      `<span>Move speed</span><b>${d.spd}</b><span>Range</span><b>${d.range}px</b><span>Max HP / SP</span><b>${d.maxHp} / ${d.maxSp}</b></div>`;
    $('status-body').innerHTML = h;
  }

  /* ------------------------------------------------------------- inventory */
  function renderInv() {
    const m = State.me; let h = '<div class="grid-inv">';
    for (let i = 0; i < 48; i++) {
      const s = m.inv[i];
      h += s ? `<div class="slot ${selItem === s.id ? 'sel' : ''}" data-item="${s.id}"><img src="${Sprites.itemIcon(s.id)}" alt="">${s.qty > 1 ? `<span class="qty">${s.qty}</span>` : ''}</div>` : '<div class="slot empty"></div>';
    }
    $('inv-body').innerHTML = h + '</div><div class="item-info" id="inv-info"></div>';
    const it = GD.ITEMS[selItem], has = it && m.inv.some(s => s.id === selItem), el = $('inv-info');
    if (!has) { selItem = null; el.innerHTML = '<span class="muted">Select an item. Double-click to use/equip.<br>Hover + <b>Shift+1-9</b> puts it on the hotbar.</span>'; return; }
    const cant = it.type === 'equip' && (m.lv < it.lv ? `Requires Lv ${it.lv}` : !GD.canEquip(m.cls, it) ? 'Your class cannot use this' : '');
    el.innerHTML = `<b>${esc(it.name)}</b> <span class="small muted">${it.type}</span><div class="small">${esc(it.desc || '')}${it.lv > 1 ? ` &middot; Lv ${it.lv}+` : ''}</div>` +
      `<div class="small muted">Sells for ${GD.sellPrice(m, it)}z</div><div class="btn-row">${it.type === 'use' ? '<button class="btn sm" data-act="use">Use</button>' : ''}` +
      `${it.type === 'equip' ? `<button class="btn sm" data-act="use" ${cant ? 'disabled' : ''}>Equip</button>` : ''}<button class="btn sm" data-act="drop">Discard 1</button></div>${cant ? `<div class="small err">${cant}</div>` : ''}`;
  }
  function useItem(id) { const it = GD.ITEMS[id]; if (!it) return; if (it.type === 'use') Net.emit('use', { id }); else if (it.type === 'equip') Net.emit('equip', { id }); }

  function renderEquip() {
    const m = State.me, d = m.d, slots = [['weapon', 'Weapon'], ['armor', 'Armor'], ['acc', 'Accessory']];
    const face = Sprites.portrait(Sprites.LOOK[m.cls], 3).toDataURL();
    $('equip-body').innerHTML = `<div class="equip-grid"><div><img src="${face}" style="width:78px;image-rendering:pixelated;border-radius:3px;background:#b7d5f5"><div class="small muted">${GD.CLASSES[m.cls].name}<br>uses ${GD.CLASSES[m.cls].weapon}s</div></div><div class="equip-slots">` +
      slots.map(([s, n]) => { const it = GD.ITEMS[m.eq[s]]; return `<div class="eq-slot" data-slot="${s}" title="Click to unequip">${it ? `<img src="${Sprites.itemIcon(m.eq[s])}">` : ''}<div><b>${n}</b><div class="small">${it ? esc(it.name) : '<span class="muted">empty</span>'}</div></div></div>`; }).join('') +
      `</div></div><div class="sect">Bonuses</div><div class="kv"><span>ATK</span><b>${d.atk}</b><span>MATK</span><b>${d.matk}</b><span>DEF</span><b>${d.def}</b><span>MDEF</span><b>${d.mdef}</b></div>`;
  }

  /* ---------------------------------------------------------------- skills */
  const reqOk = (m, S) => Object.entries(S.req || {}).every(([k, v]) => (m.skills[k] | 0) >= v);
  function renderSkills() {
    const m = State.me; let h = `<div class="small">Skill points: <b style="color:#b3261e">${m.spts}</b> &nbsp;<span class="muted">Click an icon to cast. Hover + Shift+1-9 to set hotkey.</span></div>`;
    for (const sid of GD.CLASSES[m.cls].skills) {
      const S = GD.SKILLS[sid], lv = m.skills[sid] | 0, ok = reqOk(m, S), can = m.spts > 0 && lv < S.max && ok;
      const req = Object.entries(S.req || {}).map(([k, v]) => `${GD.SKILLS[k].name} Lv ${v}`).join(', ');
      h += `<div class="list-row skill-row ${lv ? '' : 'locked'}"><div class="skill-ico" data-use="${sid}" title="${S.kind === 'passive' ? 'Passive' : 'Cast'}">${S.icon}</div><div class="grow"><b>${S.name}</b> <span class="small">Lv ${lv}/${S.max}</span>` +
        `<div class="small muted">${S.desc}${S.kind === 'passive' ? ' (passive)' : ''}</div><div class="small">${GD.skillInfo(S, Math.max(1, lv))}</div>${!ok ? `<div class="small err">Requires ${req}</div>` : ''}</div>` +
        `<button class="btn sm" data-learn="${sid}" ${can ? '' : 'disabled'}>+</button></div>`;
    }
    $('skills-body').innerHTML = h;
  }
  function useSkill(sid) {
    const S = GD.SKILLS[sid], m = State.me; if (!S || S.kind === 'passive') return;
    if (!(m.skills[sid] | 0)) return toast('You have not learned ' + S.name + '.');
    if ((State.cds[sid] || 0) > Date.now()) return;
    const t = State.target; let tid = null;
    if (S.target === 'enemy' && t && t.kind === 'm') tid = t.id; else if (S.target === 'ally') tid = t && t.kind === 'p' ? t.id : null;
    Net.emit('skill', { id: sid, tid });
  }

  /* ----------------------------------------------------------------- hotbar */
  function buildHotbar() {
    const hb = $('hotbar'); hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div'); d.className = 'slot empty'; d.dataset.i = i; d.innerHTML = `<span class="key">${i + 1}</span>`;
      d.onclick = () => { Sound.init(); useSlot(i); }; d.oncontextmenu = e => { e.preventDefault(); hot[i] = null; saveHot(); renderHotbar(); };
      hb.appendChild(d);
    }
  }
  function initHotbar() {
    hotName = State.me.name; let saved = null;
    try { saved = JSON.parse(localStorage.getItem('po_hot_' + hotName)); } catch (e) { /* ignore */ }
    hot = Array.isArray(saved) && saved.length === 9 ? saved : new Array(9).fill(null);
    if (!saved) { hot[6] = { k: 'item', id: 'red' }; hot[7] = { k: 'item', id: 'blue' }; hot[8] = { k: 'item', id: 'flywing' }; }
  }
  const saveHot = () => { try { localStorage.setItem('po_hot_' + hotName, JSON.stringify(hot)); } catch (e) { /* ignore */ } };
  function autoFillHotbar() {                       // newly learned active skills go to the first free slot
    const m = State.me; let changed = false;
    for (const sid of GD.CLASSES[m.cls].skills) {
      const S = GD.SKILLS[sid]; if (S.kind === 'passive' || !(m.skills[sid] | 0) || hot.some(h => h && h.k === 'skill' && h.id === sid)) continue;
      const i = hot.indexOf(null); if (i >= 0) { hot[i] = { k: 'skill', id: sid }; changed = true; }
    }
    if (changed) saveHot();
  }
  function renderHotbar() {
    const m = State.me; if (!m) return;
    document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
      const h = hot[i]; let inner = `<span class="key">${i + 1}</span>`, dim = false;
      if (h && h.k === 'skill') { const S = GD.SKILLS[h.id], lv = m.skills[h.id] | 0; inner += `<span class="ico">${S.icon}</span>`; dim = !lv; el.title = `${S.name} Lv ${lv}`; }
      else if (h && h.k === 'item') { const n = m.inv.reduce((a, s) => a + (s.id === h.id ? s.qty : 0), 0); inner += `<img src="${Sprites.itemIcon(h.id)}"><span class="qty">${n}</span>`; dim = !n; el.title = GD.ITEMS[h.id].name; }
      el.innerHTML = inner + '<div class="cd"></div>'; el.className = 'slot' + (h ? '' : ' empty') + (dim ? ' dim' : ''); el.dataset.sid = h && h.k === 'skill' ? h.id : '';
    });
  }
  function useSlot(i) {
    const h = hot[i]; if (!h) return; Sound.init();
    if (h.k === 'skill') useSkill(h.id); else if (h.k === 'item') useItem(h.id);
  }
  function updateCooldowns() {                       // called ~10x/s from the game loop
    const now = Date.now();
    document.querySelectorAll('#hotbar .slot').forEach(el => {
      const sid = el.dataset.sid, cd = el.querySelector('.cd'); if (!cd) return;
      const end = sid ? State.cds[sid] || 0 : 0, tot = sid ? GD.SKILLS[sid].cd : 1;
      cd.style.height = end > now ? Math.min(100, (end - now) / tot * 100) + '%' : '0';
    });
    if (now - lastBuff > 1000) { lastBuff = now; renderBuffs(); }
  }

  /* ------------------------------------------------------------------ party */
  function renderParty() {
    const p = State.party, m = State.me; let h = '';
    if (!p) h = '<p>You are not in a party.</p><div class="btn-row"><button class="btn" data-pa="create">Create party</button></div>';
    else {
      h = `<div class="small muted">Leader: ${esc(p.leader)}</div>`;
      for (const e of p.members) {
        const f = clamp(e.hp / e.mhp * 100, 0, 100);
        h += `<div class="pm"><b>${esc(e.name)}</b> ${e.name === p.leader ? '★' : ''} <span class="small">${GD.CLASSES[e.cls].name} Lv ${e.lv}${e.map !== State.mapId ? ' (' + esc(GD.MAPS[e.map].name) + ')' : ''}</span>` +
          `${p.leader === m.name && e.name !== m.name ? ` <button class="btn sm" data-kick="${esc(e.name)}">Kick</button>` : ''}<div class="bar hp"><i style="width:${f}%"></i><b>${Math.ceil(e.hp)} / ${e.mhp}</b></div></div>`;
      }
    }
    h += `<div class="btn-row"><input class="txt" id="pa-name" placeholder="Player name" maxlength="16"><button class="btn" data-pa="invite">Invite</button>${p ? '<button class="btn" data-pa="leave">Leave</button>' : ''}</div>` +
      '<div class="small muted" style="margin-top:6px">Nearby members share EXP (+15% each). Party chat: <b>/p message</b>. You can also select a player by clicking them.</div>';
    const keep = $('pa-name') ? $('pa-name').value : ''; $('party-body').innerHTML = h; if ($('pa-name')) $('pa-name').value = keep;
  }
  function setParty(p) { State.party = p; if (isOpen('party')) renderParty(); }
  function showInvite(from) { $('invite-text').textContent = `${from} invites you to join their party.`; $('invite').hidden = false; front($('invite')); toast('Party invitation from ' + from); }

  /* ----------------------------------------------------------------- quests */
  function renderQuests() {
    const m = State.me; let h = '';
    const ids = Object.keys(m.quests).sort((a, b) => (m.quests[a].st === 'done') - (m.quests[b].st === 'done'));
    for (const id of ids) {
      const q = m.quests[id], Q = GD.QUESTS[id], ready = q.st === 'active' && q.n >= Q.goal.n;
      h += `<div class="q-box"><b>${esc(Q.name)}</b> <span class="small ${q.st === 'done' ? 'muted' : ready ? 'zeny' : ''}">${q.st === 'done' ? '(completed)' : ready ? '(ready to turn in!)' : ''}</span>` +
        `<div class="small">${esc(Q.text)}</div>${q.st === 'done' ? '' : `<div class="small"><b>${GD.MONSTERS[Q.goal.mob].name}</b> ${Math.min(q.n, Q.goal.n)} / ${Q.goal.n} &middot; turn in to ${esc(GD.NPCS[Q.giver].name)}</div>`}</div>`;
    }
    $('quest-body').innerHTML = h || '<p class="muted">No quests yet. Talk to the Guard Captain in Prontera (look for the yellow “!”).</p>';
  }
  function renderTrack() {
    const m = State.me; if (!m) return;
    $('quest-track').innerHTML = Object.keys(m.quests).filter(id => m.quests[id].st === 'active').map(id => {
      const Q = GD.QUESTS[id], q = m.quests[id]; return `<div><b>${esc(Q.name)}</b><br>${GD.MONSTERS[Q.goal.mob].name} ${Math.min(q.n, Q.goal.n)}/${Q.goal.n}${q.n >= Q.goal.n ? ' ✔' : ''}</div>`;
    }).join('');
  }

  /* ------------------------------------------------------------ NPC dialog */
  function dialog(d) {
    dlg = d; flags.dialogNpc = d.id; shopTab = 'buy'; $('npc-title').textContent = d.name; toggle('npc', true); renderDialog();
  }
  function renderDialog() {
    if (!dlg || $('win-npc').hidden) return; const d = dlg, m = State.me; let h = `<div class="npc-say">“${esc(d.say)}”</div>`;
    if (d.kind === 'shop') {
      h += `<div class="tab-row"><button class="btn ${shopTab === 'buy' ? 'on' : ''}" data-tab="buy">Buy</button><button class="btn ${shopTab === 'sell' ? 'on' : ''}" data-tab="sell">Sell</button></div>`;
      if (shopTab === 'buy') for (const s of d.shop) {
        const it = GD.ITEMS[s.id], price = GD.buyPrice(m, it);
        h += `<div class="list-row"><img src="${Sprites.itemIcon(s.id)}"><div class="grow"><b>${esc(it.name)}</b><div class="small muted">${esc(it.desc || '')}${it.lv > 1 ? ' Lv ' + it.lv + '+' : ''}</div></div><span class="zeny">${price}</span>` +
          `<button class="btn sm" data-buy="${s.id}" ${m.zeny < price ? 'disabled' : ''}>Buy</button>${it.type !== 'equip' ? `<button class="btn sm" data-buy="${s.id}" data-n="10" ${m.zeny < price * 10 ? 'disabled' : ''}>x10</button>` : ''}</div>`;
      } else {
        const tot = new Map(); m.inv.forEach(s => tot.set(s.id, (tot.get(s.id) || 0) + s.qty));
        if (!tot.size) h += '<p class="muted">Your inventory is empty.</p>';
        for (const [id, n] of tot) { const it = GD.ITEMS[id]; h += `<div class="list-row"><img src="${Sprites.itemIcon(id)}"><div class="grow"><b>${esc(it.name)}</b> <span class="small muted">x${n}</span></div><span class="zeny">${GD.sellPrice(m, it)}</span><button class="btn sm" data-sell="${id}">Sell</button><button class="btn sm" data-sell="${id}" data-all="1">All</button></div>`; }
      }
    } else if (d.kind === 'quest') {
      for (const q of d.quests) {
        const r = q.reward, rw = `${r.exp} EXP, ${r.zeny}z${(r.items || []).map(([id, n]) => `, ${n}x ${GD.ITEMS[id].name}`).join('')}`;
        h += `<div class="q-box"><b>${esc(q.name)}</b> <span class="small muted">(Lv ${q.minLv}+)</span>`;
        if (q.st === 'locked') h += `<div class="small muted">Not available yet (need Lv ${q.minLv}${q.minLv ? ' and previous quests' : ''}).</div>`;
        else if (q.st === 'done') h += '<div class="small muted">Completed.</div>';
        else {
          h += `<div class="small">${esc(q.st === 'ready' ? q.done : q.text)}</div><div class="small muted">Goal: ${q.goal.n}x ${esc(q.goal.mob)} &middot; Reward: ${esc(rw)}</div>`;
          if (q.st === 'avail') h += `<div class="btn-row"><button class="btn sm" data-quest="${q.id}" data-act="accept">Accept</button></div>`;
          else if (q.st === 'active') h += `<div class="small"><b>In progress: ${q.n}/${q.goal.n}</b></div>`;
          else h += `<div class="btn-row"><button class="btn sm" data-quest="${q.id}" data-act="turnin">Turn in</button></div>`;
        }
        h += '</div>';
      }
    } else if (d.kind === 'warp') {
      for (const x of d.dests) h += `<div class="list-row"><div class="grow"><b>${esc(x.name)}</b></div><span class="zeny">${x.cost || 'Free'}</span><button class="btn sm" data-warp="${x.map}" ${m.zeny < x.cost ? 'disabled' : ''}>Go</button></div>`;
    } else if (d.kind === 'heal') h += '<div class="btn-row"><button class="btn" data-heal="1">Restore my HP and SP (free)</button></div>';
    $('npc-body').innerHTML = h;
  }

  /* ------------------------------------------------------------------- chat */
  const CH_FILTER = { all: null, local: ['local', 'whisper'], global: ['global'], party: ['party'], sys: ['sys', 'loot'] };
  function bindChat() {
    const inp = $('chat-in');
    inp.onfocus = () => { flags.typing = true; keys.clear(); Net.emit('input', { dx: 0, dy: 0 }); }; inp.onblur = () => { flags.typing = false; };
    document.querySelectorAll('#chat-tabs button').forEach(b => b.onclick = () => {
      filter = b.dataset.f; document.querySelectorAll('#chat-tabs button').forEach(x => x.classList.toggle('on', x === b)); applyFilter();
      if (filter === 'global' || filter === 'party') $('chat-ch').value = filter; else if (filter === 'local') $('chat-ch').value = 'local';
    });
  }
  function sendChat() {
    const inp = $('chat-in'), v = inp.value.trim(); if (v) Net.emit('chat', { ch: $('chat-ch').value, msg: v });
    inp.value = ''; inp.blur();
  }
  const visible = ch => !CH_FILTER[filter] || CH_FILTER[filter].includes(ch);
  function applyFilter() { document.querySelectorAll('#chat-log div').forEach(d => { d.hidden = !visible(d.dataset.ch); }); $('chat-log').scrollTop = 1e9; }
  function chat(m) {
    const log = $('chat-log'), d = document.createElement('div'); d.className = 'c-' + m.ch; d.dataset.ch = m.ch;
    const pre = { global: '[Global] ', party: '[Party] ', whisper: '[Whisper] ' }[m.ch] || '';
    d.textContent = m.from ? `${pre}${m.from}: ${m.msg}` : m.msg; d.hidden = !visible(m.ch);
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30; log.appendChild(d);
    while (log.children.length > 150) log.removeChild(log.firstChild);
    if (stick) log.scrollTop = 1e9;
  }
  function toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('toast').appendChild(d); setTimeout(() => d.remove(), 3000); }

  /* ----------------------------------------------------------------- keyboard */
  function bindKeys() {
    window.addEventListener('keydown', e => {
      const el = e.target, tag = el.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') {
        if (el.id === 'chat-in' && e.key === 'Enter') { sendChat(); e.preventDefault(); } else if (e.key === 'Escape') el.blur();
        return;
      }
      if (!State.me) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Enter') { $('chat-in').focus(); e.preventDefault(); return; }
      const fk = /^F([1-9])$/.exec(e.key), dg = /^Digit([1-9])$/.exec(e.code);
      if ((fk || dg) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); const i = (+(fk ? fk[1] : dg[1])) - 1;
        if (e.shiftKey && dg && hover) { hot[i] = hover; saveHot(); renderHotbar(); toast('Hotkey ' + (i + 1) + ' set'); } else useSlot(i);
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (k) {
        case 'i': toggle('inv'); break; case 'c': toggle('status'); break; case 'e': toggle('equip'); break; case 'k': toggle('skills'); break;
        case 'p': toggle('party'); break; case 'l': toggle('quest'); break; case 'm': $('btn-sound').click(); break;
        case 'tab': e.preventDefault(); Game.targetNearest(); break;
        case 'escape': if (!$('win-npc').hidden) toggle('npc', false); else clearTarget(); break;
      }
    });
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());
  }
  function moveVec() {
    if (flags.typing) return { dx: 0, dy: 0 };
    const h = k => keys.has(k); return { dx: (h('d') || h('arrowright') ? 1 : 0) - (h('a') || h('arrowleft') ? 1 : 0), dy: (h('s') || h('arrowdown') ? 1 : 0) - (h('w') || h('arrowup') ? 1 : 0) };
  }

  /* ----------------------------------------------------------------- target */
  let tKey = '';
  function clearTarget() { if (State.target && State.target.kind === 'm') Net.emit('target', { id: null }); State.target = null; showTarget(null); }
  /** info = { kind, id, name, sub, hp, mh } or null. Rebuilds only when the target changes. */
  function showTarget(info) {
    const el = $('target'); if (!info) { el.hidden = true; tKey = ''; return; }
    const key = info.kind + info.id; el.hidden = false;
    if (key !== tKey) {
      tKey = key;
      el.innerHTML = `<div class="t-name">${esc(info.name)}</div><div class="small">${esc(info.sub)}</div><div class="bar hp"><i></i><b></b></div>` +
        (info.kind === 'p' ? `<button class="btn sm" data-invite="${esc(info.name)}">Invite to party</button>` : '');
    }
    const f = clamp(info.hp / info.mh * 100, 0, 100); el.querySelector('.bar i').style.width = f + '%'; el.querySelector('.bar b').textContent = `${Math.ceil(info.hp)} / ${info.mh}`;
  }

  /* ---------------------------------------------------------------- minimap */
  function setMap(g) {
    mm.g = g; mm.s = Math.max(1, Math.floor(140 / Math.max(g.w, g.h)));
    const c = document.createElement('canvas'); c.width = g.w * mm.s; c.height = g.h * mm.s; const x = c.getContext('2d');
    const col = ['#4c9a38', '#c8b690', '#3b82c4', '#25692a', '#a0522d', '#5a5470', '#1c1a24', '#8a8a99'];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { x.fillStyle = col[g.tiles[j * g.w + i]]; x.fillRect(i * mm.s, j * mm.s, mm.s, mm.s); }
    mm.canvas = c; $('mm-name').textContent = g.def.name; toggle('npc', false);
  }
  function drawMinimap() {
    if (!mm.canvas) return; const c = $('mm'), x = c.getContext('2d'), s = mm.s, T = GD.TILE;
    const ox = Math.floor((140 - mm.canvas.width) / 2), oy = Math.floor((140 - mm.canvas.height) / 2);
    x.fillStyle = '#000'; x.fillRect(0, 0, 140, 140); x.drawImage(mm.canvas, ox, oy);
    const dot = (px, py, col, r = 2) => { x.fillStyle = col; x.fillRect(ox + px / T * s - r / 2, oy + py / T * s - r / 2, r, r); };
    for (const p of mm.g.def.portals) dot((p.r[0] + p.r[2] / 2) * T, (p.r[1] + p.r[3] / 2) * T, '#c18cff', 4);
    for (const id in GD.NPCS) { const n = GD.NPCS[id]; if (n.map === mm.g.id) dot((n.t[0] + .5) * T, (n.t[1] + .5) * T, '#ffe14d', 3); }
    for (const m of State.snap.m) dot(m.x, m.y, m.k === 'baphomet' ? '#ff00ff' : '#ff4040', m.k === 'baphomet' ? 5 : 3);
    for (const p of State.snap.p) if (p.id !== State.id) dot(p.x, p.y, State.party && p.pt && p.pt === State.party.id ? '#4dd8ff' : '#ffffff', 3);
    dot(State.pos.x, State.pos.y, (Date.now() >> 8) & 1 ? '#7dff7d' : '#ffffff', 4);
    $('mm-pos').textContent = `${Math.floor(State.pos.x / T)}, ${Math.floor(State.pos.y / T)}`;
  }

  /* ------------------------------------------------------- day/night & misc */
  function setShade(tod, kind, sx, sy) {
    const el = $('shade');
    if (kind === 'dungeon') {
      const key = 'd' + Math.round(sx / 4) + Math.round(sy / 4); if (key === shadeKey) return; shadeKey = key; el.style.mixBlendMode = 'normal';
      el.style.background = `radial-gradient(circle at ${sx}px ${sy}px, rgba(0,0,0,0) 80px, rgba(8,4,18,.5) 200px, rgba(8,4,18,.92) 430px)`; return;
    }
    const l = (Math.sin((tod - 0.25) * 2 * Math.PI) + 1) / 2, night = clamp((0.55 - l) / 0.5, 0, 1), warm = Math.max(0, 1 - Math.abs(l - 0.5) / 0.18) * 0.55;
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t); let c = mix([255, 255, 255], [255, 190, 140], warm); c = mix(c, [62, 76, 150], night);
    const css = `rgb(${c.map(Math.round).join(',')})`; if (css === shadeKey) return; shadeKey = css; el.style.mixBlendMode = 'multiply'; el.style.background = css;
  }
  const showDeath = () => { State.dead = true; $('death').hidden = false; };
  const hideDeath = () => { State.dead = false; $('death').hidden = true; };

  return { init, flags, setMe, updateBars, chat, toast, dialog, setParty, showInvite, showDeath, hideDeath, setMap, drawMinimap, setShade, moveVec,
    showTarget, clearTarget, updateCooldowns, renderHotbar, renderTrack, toggle, isOpen, esc };
})();
