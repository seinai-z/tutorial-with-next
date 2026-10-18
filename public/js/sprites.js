/* public/js/sprites.js — procedural pixel art: characters, monsters, tiles, item icons.
 * Everything is drawn with canvas at startup, so the game needs no image downloads.
 * To use real art, replace Sprites.build() with scene.load.spritesheet(...) calls. */
const Sprites = (() => {
  const FW = 36, FH = 36;                 // character frame size
  const SKIN = '#ffdcb9', OUT = '#2a1d2e';
  const LOOK = {
    swordsman: { hair: '#e8b948', top: '#c0392b', trim: '#f4d03f', pants: '#5b4636', shoe: '#3b2a20', hat: 'spiky' },
    mage:      { hair: '#9575cd', top: '#3f51b5', trim: '#ffeb3b', pants: '#283593', shoe: '#1a237e', hat: 'wizard', hatc: '#3949ab', robe: true },
    archer:    { hair: '#a0662b', top: '#2e7d32', trim: '#a5d6a7', pants: '#5d4037', shoe: '#3e2723', hat: 'cap', hatc: '#388e3c' },
    acolyte:   { hair: '#cfd8dc', top: '#f5f5f5', trim: '#ffd54f', pants: '#e0e0e0', shoe: '#a1887f', hat: 'hood', robe: true },
    merchant:  { hair: '#d4622a', top: '#8d6e63', trim: '#ffcc80', pants: '#4e342e', shoe: '#3e2723', hat: 'explorer', hatc: '#a1887f' },
    thief:     { hair: '#546e7a', top: '#37474f', trim: '#b71c1c', pants: '#263238', shoe: '#111', hat: 'bandana' },
  };
  const NPC_LOOK = {
    dealer: { top: '#2e7d32', hair: '#6d4c41', hatc: '#8d6e63' }, smith: { top: '#455a64', hair: '#3e2723' },
    captain: { top: '#1565c0', hair: '#b0bec5' }, warper: { top: '#00838f', hatc: '#006064', hair: '#e0f7fa' },
    sister: {}, ranger: { hair: '#d7ccc8' }, peddler: { top: '#6a1b9a', hair: '#212121', hatc: '#ffb300' }, adventurer: { top: '#6d4c41' },
  };

  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

  /** Crisp the alpha channel and add a 1px dark outline (the classic sprite look). */
  function outline(ctx, w, h, col = OUT) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data, a = new Uint8Array(w * h), [r, g, b] = hex(col);
    for (let i = 0; i < w * h; i++) { a[i] = d[i * 4 + 3] > 110 ? 1 : 0; d[i * 4 + 3] = a[i] ? 255 : 0; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (a[i]) continue;
      if ((x > 0 && a[i - 1]) || (x < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) {
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const rect = ctx => (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const ell = (ctx, x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); };
  const poly = (ctx, pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };

  /* ---------------------------------------------------------------- weapons */
  function weapon(R, type, hx, hy, pose) {
    const v = pose === 'fwd' ? [1, -1] : [0, -1], at = (i, c, w = 2) => R(hx + v[0] * i, hy + v[1] * i, w, w, c), tip = i => [hx + v[0] * i, hy + v[1] * i];
    const run = (a, b, c, w) => { for (let i = a; i < b; i++) at(i, c, w); };
    switch (type) {
      case 'sword': run(0, 2, '#7a4b2a'); run(2, 12, '#e6edf0'); { const [x, y] = tip(2); R(x - 2, y - 1, 6, 2, '#f4d03f'); } break;
      case 'knife': run(0, 2, '#5d4037'); run(2, 7, '#e6edf0'); break;
      case 'rod': run(0, 10, '#9a6a3a'); { const [x, y] = tip(10); R(x - 1, y - 1, 4, 4, '#e040fb'); R(x, y, 1, 1, '#fff'); } break;
      case 'mace': run(0, 9, '#8d6e63'); { const [x, y] = tip(9); R(x - 1, y - 2, 5, 5, '#9e9e9e'); R(x, y - 1, 2, 2, '#cfd8dc'); } break;
      case 'axe': run(0, 10, '#8d6e63'); { const [x, y] = tip(8); R(x + 1, y - 2, 5, 5, '#b0bec5'); R(x + 5, y - 2, 1, 5, '#eceff1'); } break;
      case 'bow': for (let i = 0; i < 15; i++) R(hx + 1 + Math.round(3 * Math.sin(Math.PI * i / 14)), hy - 10 + i, 2, 1, '#9a6a3a'); R(hx + 1, hy - 10, 1, 15, '#f0f0f0'); break;
    }
  }

  /** Draw one character frame. f: i (idle) | w0 | w1 | a (attack) | c (cast) */
  function drawChar(ctx, L, wtype, f) {
    ctx.translate(4, 1);
    const R = rect(ctx), walk = f[0] === 'w', bob = f === 'w1' ? -1 : 0, lL = f === 'w0' ? 1 : 0, lR = f === 'w1' ? 1 : 0;
    // legs / robe
    if (L.robe) { R(6, 19 + bob, 12, 12, L.top); R(6, 30 + bob, 12, 1, L.trim); R(8, 31, 3, 2, L.shoe); R(13, 31 - (walk ? lR : 0), 3, 2, L.shoe); }
    else { R(8, 28, 3, 4 - lL, L.pants); R(7, 32 - lL, 5, 2, L.shoe); R(13, 28, 3, 4 - lR, L.pants); R(12, 32 - lR, 5, 2, L.shoe); }
    // torso & arms
    if (!L.robe) { R(7, 19 + bob, 10, 9, L.top); R(7, 26 + bob, 10, 1, L.trim); }
    else R(11, 20 + bob, 2, 9, L.trim);
    let hx = 18, hy = 26 + bob, pose = 'idle';
    if (f === 'a') { R(5, 20, 2, 6, L.top); R(5, 25, 2, 2, SKIN); R(17, 19, 5, 2, L.top); R(21, 18, 2, 2, SKIN); hx = 22; hy = 19; pose = 'fwd'; }
    else if (f === 'c') { R(4, 14, 2, 7, L.top); R(4, 12, 2, 2, SKIN); R(18, 14, 2, 7, L.top); R(18, 12, 2, 2, SKIN); hx = 18; hy = 13; }
    else { R(5, 20 + bob, 2, 6, L.top); R(5, 25 + bob, 2, 2, SKIN); R(17, 20 + bob, 2, 6, L.top); R(17, 25 + bob, 2, 2, SKIN); }
    if (wtype) weapon(R, wtype, hx, hy, pose);
    // head
    R(5, 6 + bob, 14, 13, SKIN); ctx.clearRect(5, 18 + bob, 1, 1); ctx.clearRect(18, 18 + bob, 1, 1);
    const hair = L.hair;
    R(4, 5 + bob, 16, 6, hair); R(4, 10 + bob, 2, 5, hair); R(18, 10 + bob, 2, 5, hair); R(6, 10 + bob, 4, 2, hair); R(14, 10 + bob, 4, 2, hair);
    R(8, 12 + bob, 2, 3, '#2b1b22'); R(14, 12 + bob, 2, 3, '#2b1b22'); R(8, 12 + bob, 1, 1, '#fff'); R(14, 12 + bob, 1, 1, '#fff');
    R(6, 15 + bob, 2, 1, '#ff9aa8'); R(16, 15 + bob, 2, 1, '#ff9aa8'); R(11, 16 + bob, 2, 1, '#b0594f');
    // headgear
    switch (L.hat) {
      case 'spiky': R(7, 3 + bob, 2, 3, hair); R(11, 2 + bob, 2, 4, hair); R(15, 3 + bob, 2, 3, hair); R(5, 9 + bob, 14, 2, L.top); break;
      case 'wizard': R(2, 6 + bob, 20, 2, L.hatc); R(7, 3 + bob, 10, 3, L.hatc); R(9, 1 + bob, 6, 2, L.hatc); R(7, 5 + bob, 10, 1, L.trim); break;
      case 'cap': R(5, 4 + bob, 14, 4, L.hatc); R(5, 8 + bob, 14, 1, '#1b5e20'); R(18, 1 + bob, 2, 5, '#e53935'); break;
      case 'hood': R(4, 4 + bob, 16, 6, '#fafafa'); R(4, 10 + bob, 2, 7, '#fafafa'); R(18, 10 + bob, 2, 7, '#fafafa'); R(11, 5 + bob, 2, 5, L.trim); R(10, 6 + bob, 4, 2, L.trim); break;
      case 'explorer': R(7, 2 + bob, 10, 4, L.hatc); R(3, 6 + bob, 18, 2, L.hatc); R(7, 5 + bob, 10, 1, '#5d4037'); break;
      case 'bandana': R(5, 8 + bob, 14, 3, '#b71c1c'); R(19, 9 + bob, 3, 2, '#b71c1c'); break;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function charSheet(look, wtype, frames = ['i', 'w0', 'w1', 'a', 'c']) {
    const sheet = cv(FW * frames.length, FH), sx = sheet.getContext('2d');
    frames.forEach((f, i) => { const c = cv(FW, FH), x = c.getContext('2d'); drawChar(x, look, wtype, f); outline(x, FW, FH); sx.drawImage(c, i * FW, 0); });
    return sheet;
  }
  const lookFor = cls => LOOK[cls];

  /** Head-and-shoulders portrait (canvas) for UI. */
  function portrait(look, scale = 3) {
    const c = cv(26 * scale, 24 * scale), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const sh = charSheet(look, null, ['i']); x.drawImage(sh, 5, 1, 26, 24, 0, 0, c.width, c.height); return c;
  }

  /* --------------------------------------------------------------- monsters */
  const MON = {
    poring: { w: 32, h: 28, draw(x, f) { const R = rect(x); ell(x, 16, 16 + f, 14 - f * 0 + f, 10 - f, '#ff9fb8'); ell(x, 11, 11 + f, 4, 3, '#ffd3e0'); R(11, 15 + f, 2, 3, '#222'); R(19, 15 + f, 2, 3, '#222'); R(15, 20 + f, 3, 1, '#b0405f'); } },
    fabre: { w: 36, h: 24, draw(x, f) { const R = rect(x); ell(x, 8, 15, 6, 6, '#8bc34a'); ell(x, 17, 14 + f, 7, 7, '#9ccc65'); ell(x, 25, 15, 6, 6, '#8bc34a'); ell(x, 29, 11, 6, 6, '#c5e1a5');
      R(30, 9, 2, 3, '#222'); R(28, 3, 1, 4, '#558b2f'); R(32, 3, 1, 4, '#558b2f'); R(12, 12 + f, 2, 5, '#7cb342'); R(21, 12 + f, 2, 5, '#7cb342'); R(5, 20, 3, 2, '#558b2f'); R(24, 20, 3, 2, '#558b2f'); } },
    lunatic: { w: 30, h: 32, draw(x, f) { const R = rect(x); ell(x, 15, 22 - f, 10, 8, '#fafafa'); ell(x, 15, 14 - f, 8, 7, '#ffffff'); R(9, 1 + f, 4, 9, '#fafafa'); R(17, 1 + f, 4, 9, '#fafafa'); R(10, 3 + f, 2, 5, '#ffb3c6'); R(18, 3 + f, 2, 5, '#ffb3c6');
      R(11, 13 - f, 2, 2, '#e53935'); R(17, 13 - f, 2, 2, '#e53935'); R(14, 16 - f, 2, 1, '#e57373'); R(10, 28, 3, 2, '#ddd'); R(17, 28, 3, 2, '#ddd'); } },
    rocker: { w: 36, h: 34, draw(x, f) { const R = rect(x); R(5, 14 - f, 4, 14, '#558b2f'); R(3, 26, 8, 2, '#558b2f'); ell(x, 17, 19, 10, 8, '#7cb342'); ell(x, 24, 11, 7, 6, '#9ccc65');
      R(24, 8, 4, 4, '#fff'); R(26, 9, 1, 3, '#222'); R(27, 2, 1, 7, '#558b2f'); R(21, 24, 2, 7 - f, '#558b2f'); R(14, 25, 2, 6, '#558b2f'); R(23, 29, 4, 2, '#558b2f'); } },
    wolf: { w: 44, h: 32, draw(x, f) { const R = rect(x); R(2, 11, 5, 4, '#9e9e9e'); R(0, 8, 4, 4, '#9e9e9e'); ell(x, 20, 18, 15, 8, '#8d8d8d'); ell(x, 34, 13, 8, 6, '#9e9e9e'); R(38, 13, 5, 4, '#757575'); R(42, 13, 2, 2, '#111');
      R(30, 4, 3, 6, '#757575'); R(35, 4, 3, 6, '#757575'); R(35, 11, 2, 2, '#ff5252'); R(10, 23, 3, 8, '#757575'); R(16, 23 + f, 3, 8 - f, '#757575'); R(25, 23, 3, 8, '#757575'); R(31, 23 + f, 3, 8 - f, '#757575'); R(38, 17, 3, 2, '#fff'); } },
    zombie: { w: 32, h: 42, draw(x, f) { const R = rect(x); ell(x, 14, 9, 7, 7, '#9fb88a'); R(10, 7, 3, 3, '#401010'); R(16, 7, 3, 3, '#401010'); R(11, 13, 7, 2, '#2a1a1a'); R(8, 16, 12, 13, '#6d5a73'); R(8, 26, 3, 4, '#524358'); R(16, 27, 4, 3, '#524358');
      R(19, 17, 11, 3, '#9fb88a'); R(19, 22 + f, 11, 3, '#9fb88a'); R(9, 29, 4, 10 - f, '#4a4f6a'); R(15, 29, 4, 10 - (1 - f), '#4a4f6a'); R(8, 38 - f, 6, 3, '#222'); R(15, 38 - (1 - f), 6, 3, '#222'); } },
    skeleton: { w: 34, h: 42, draw(x, f) { const R = rect(x); ell(x, 14, 9, 7, 7, '#f1f1e6'); R(10, 14, 8, 3, '#e3e3d3'); R(9, 8, 4, 4, '#1a1a1a'); R(16, 8, 4, 4, '#1a1a1a'); R(13, 12, 2, 2, '#555');
      R(13, 17, 2, 13, '#e8e8d8'); for (let i = 0; i < 4; i++) R(8, 18 + i * 3, 12, 2, '#efefe0'); R(4, 18, 3, 10, '#e8e8d8'); R(21, 18, 3, 8, '#e8e8d8'); R(24, 6, 2, 20, '#cfd8dc'); R(22, 24, 6, 2, '#f4d03f');
      R(10, 30, 3, 10 - f, '#e8e8d8'); R(16, 30, 3, 10 - (1 - f), '#e8e8d8'); R(9, 39 - f, 5, 2, '#e8e8d8'); R(15, 39 - (1 - f), 5, 2, '#e8e8d8'); } },
    familiar: { w: 38, h: 30, draw(x, f) { const R = rect(x); const up = f ? 12 : 0; poly(x, [[12, 14], [1, 4 + up], [3, 18], [9, 21]], '#4a2a73'); poly(x, [[26, 14], [37, 4 + up], [35, 18], [29, 21]], '#4a2a73');
      ell(x, 19, 17, 6, 8, '#6a3d9a'); ell(x, 19, 10, 6, 6, '#7b4bb0'); R(14, 2, 3, 5, '#7b4bb0'); R(22, 2, 3, 5, '#7b4bb0'); R(15, 9, 2, 2, '#ff5252'); R(22, 9, 2, 2, '#ff5252'); R(17, 13, 1, 2, '#fff'); R(21, 13, 1, 2, '#fff'); } },
    baphomet: { w: 56, h: 60, draw(x, f) { const R = rect(x); poly(x, [[14, 32], [1, 18], [3, 44], [10, 46]], '#2a1640'); poly(x, [[42, 32], [55, 18], [53, 44], [46, 46]], '#2a1640');
      ell(x, 28, 42 + f, 14, 14, '#4a2a6a'); ell(x, 28, 44 + f, 8, 9, '#6a3f8e'); ell(x, 28, 18 + f, 12, 11, '#5a3380');
      poly(x, [[17, 12], [8, 1], [22, 8]], '#f5e6c8'); poly(x, [[39, 12], [48, 1], [34, 8]], '#f5e6c8');
      R(20, 17 + f, 5, 4, '#ffeb3b'); R(31, 17 + f, 5, 4, '#ffeb3b'); R(22, 18 + f, 2, 3, '#222'); R(33, 18 + f, 2, 3, '#222'); R(22, 25 + f, 12, 2, '#1a0a1a'); R(23, 25 + f, 2, 3, '#fff'); R(31, 25 + f, 2, 3, '#fff');
      R(17, 54, 8, 5, '#2a1640'); R(31, 54, 8, 5, '#2a1640'); R(48, 10, 2, 48, '#795548'); poly(x, [[46, 10], [56, 3], [50, 18]], '#cfd8dc'); } },
  };
  function monSheet(key) {
    const M = MON[key], sheet = cv(M.w * 2, M.h), sx = sheet.getContext('2d');
    for (let f = 0; f < 2; f++) { const c = cv(M.w, M.h), x = c.getContext('2d'); M.draw(x, f); outline(x, M.w, M.h); sx.drawImage(c, f * M.w, 0); }
    return sheet;
  }

  /* -------------------------------------------------------------- item icons */
  const iconCache = {};
  function itemIcon(id) {
    if (iconCache[id]) return iconCache[id];
    const it = GD.ITEMS[id], c = cv(24, 24), x = c.getContext('2d'), R = rect(x), col = it.col;
    switch (it.icon) {
      case 'potion': R(10, 2, 4, 2, '#a1887f'); R(10, 4, 4, 4, '#dfe9ee'); R(6, 8, 12, 12, col); R(8, 10, 2, 6, 'rgba(255,255,255,.55)'); R(6, 17, 12, 3, 'rgba(0,0,0,.18)'); break;
      case 'wing': poly(x, [[4, 18], [6, 7], [14, 3], [20, 4], [16, 10], [20, 12], [14, 16], [18, 19], [8, 21]], col); R(8, 8, 1, 10, 'rgba(0,0,0,.18)'); R(12, 7, 1, 8, 'rgba(0,0,0,.18)'); break;
      case 'blob': ell(x, 12, 14, 9, 7, col); ell(x, 9, 11, 3, 2, 'rgba(255,255,255,.5)'); R(9, 14, 2, 2, '#333'); R(14, 14, 2, 2, '#333'); break;
      case 'armor': R(5, 5, 14, 16, col); R(2, 5, 4, 7, col); R(18, 5, 4, 7, col); R(9, 5, 6, 3, 'rgba(0,0,0,.3)'); R(5, 16, 14, 2, 'rgba(0,0,0,.25)'); R(6, 7, 2, 6, 'rgba(255,255,255,.3)'); break;
      case 'ring': x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.ellipse(12, 14, 6, 6, 0, 0, 7); x.stroke(); R(10, 3, 4, 4, '#4fc3f7'); R(10, 3, 1, 1, '#fff'); break;
      default: weapon(R, it.icon, it.icon === 'bow' ? 9 : 5, it.icon === 'bow' ? 18 : 20, it.icon === 'bow' ? 'idle' : 'fwd');
    }
    outline(x, 24, 24);
    return (iconCache[id] = c.toDataURL());
  }

  /* ------------------------------------------------------------- map tiles */
  function renderMap(g) {
    const T = GD.T, S = GD.TILE, c = cv(g.w * S, g.h * S), x = c.getContext('2d'), R = rect(x), kind = g.def.kind, r = GD.rng(g.def.seed * 7 + 3);
    const at = (i, j) => (i < 0 || j < 0 || i >= g.w || j >= g.h) ? T.WALL : g.tiles[j * g.w + i];
    const pick = a => a[(r() * a.length) | 0];
    const pcirc = (cx, cy, rad, col) => { x.fillStyle = col; for (let dy = -rad; dy <= rad; dy += 2) for (let dx = -rad; dx <= rad; dx += 2) if (dx * dx + dy * dy <= rad * rad) x.fillRect(cx + dx, cy + dy, 2, 2); };
    // pass 1: ground
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const t = at(i, j), X = i * S, Y = j * S;
      if (t === T.GRASS || t === T.TREE || (t === T.BUILD)) {
        R(X, Y, S, S, pick(['#6dbd4b', '#68b647', '#72c250']));
        for (let k = 0; k < 7; k++) R(X + ((r() * 28) | 0), Y + ((r() * 28) | 0), 2, 3, r() < .5 ? '#58a63c' : '#86d363');
        if (t === T.GRASS && r() < .07) { const fx = X + 4 + ((r() * 22) | 0), fy = Y + 4 + ((r() * 22) | 0); R(fx, fy, 3, 3, pick(['#ffffff', '#ffe066', '#ff8fb1'])); R(fx + 1, fy + 1, 1, 1, '#f9a825'); }
      } else if (t === T.PATH || (t === T.DECOR && kind === 'town')) {
        if (kind === 'town') { R(X, Y, S, S, '#cdbb9a'); R(X, Y + 15, S, 1, '#b3a284'); R(X, Y + 31, S, 1, '#b3a284'); const off = (j % 2) ? 8 : 0; R(X + off, Y, 1, 15, '#b3a284'); R(X + off + 16, Y, 1, 15, '#b3a284'); R(X + 16 - off, Y + 16, 1, 15, '#b3a284'); R(X + 31 - off, Y + 16, 1, 15, '#b3a284'); for (let k = 0; k < 4; k++) R(X + ((r() * 28) | 0), Y + ((r() * 28) | 0), 2, 2, '#dccdb0'); }
        else { R(X, Y, S, S, '#c49a62'); for (let k = 0; k < 9; k++) R(X + ((r() * 28) | 0), Y + ((r() * 28) | 0), 3, 2, r() < .5 ? '#a67c46' : '#d8b27c'); }
      } else if (t === T.WATER) {
        R(X, Y, S, S, '#3c8fda'); for (let k = 0; k < 3; k++) R(X + ((r() * 20) | 0), Y + ((r() * 28) | 0), 7, 1, '#7fc0f2');
        if (at(i, j - 1) !== T.WATER) R(X, Y, S, 3, '#a8d8fb'); if (at(i, j + 1) !== T.WATER) R(X, Y + 29, S, 3, '#2a6fb5');
        if (at(i - 1, j) !== T.WATER) R(X, Y, 3, S, '#a8d8fb'); if (at(i + 1, j) !== T.WATER) R(X + 29, Y, 3, S, '#2a6fb5');
      } else if (t === T.FLOOR || t === T.DECOR) {
        R(X, Y, S, S, pick(['#4d4660', '#4a435c', '#514a65'])); R(X, Y, S, 1, '#3b3550'); R(X, Y, 1, S, '#3b3550');
        for (let k = 0; k < 4; k++) R(X + ((r() * 28) | 0), Y + ((r() * 28) | 0), 2, 1, r() < .5 ? '#5d5675' : '#403a53');
        if (r() < .04) { R(X + 8, Y + 10, 10, 1, '#2f2a40'); R(X + 14, Y + 11, 1, 6, '#2f2a40'); }
      } else if (t === T.WALL) {
        R(X, Y, S, S, '#221f2b');
        if (at(i, j + 1) !== T.WALL) { R(X, Y + 14, S, 18, '#3e394d'); R(X, Y + 14, S, 2, '#5a5470'); for (let b = 0; b < 2; b++) { R(X, Y + 22 + b * 8, S, 1, '#2c2838'); R(X + ((b * 11 + 7) % 32), Y + 16 + b * 8, 1, 8, '#2c2838'); } }
        else for (let k = 0; k < 3; k++) R(X + ((r() * 28) | 0), Y + ((r() * 28) | 0), 4, 2, '#2b2837');
      }
    }
    // pass 2: objects drawn over the ground (trees, buildings, fountain, pillars)
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const t = at(i, j), X = i * S, Y = j * S;
      if (t === T.TREE) {
        R(X + 13, Y + 16, 6, 14, '#6b4423'); R(X + 13, Y + 16, 2, 14, '#8a5a30'); R(X + 8, Y + 29, 16, 3, 'rgba(0,0,0,.25)');
        pcirc(X + 16, Y + 10, 16, '#2e7d32'); pcirc(X + 13, Y + 8, 12, '#388e3c'); pcirc(X + 11, Y + 5, 6, '#4caf50'); R(X + 20, Y + 12, 3, 2, '#1b5e20');
        outlineCircleHint(x, X + 16, Y + 10, 16);
      } else if (t === T.DECOR && kind === 'town' && at(i - 1, j) !== T.DECOR && at(i, j - 1) !== T.DECOR) {
        pcirc(X + 32, Y + 32, 30, '#8e8e99'); pcirc(X + 32, Y + 32, 26, '#b9b9c4'); pcirc(X + 32, Y + 32, 22, '#59b3f2'); pcirc(X + 32, Y + 32, 14, '#8fd0ff'); R(X + 28, Y + 14, 8, 22, '#d9d9e2'); R(X + 30, Y + 8, 4, 8, '#bfe6ff'); R(X + 26, Y + 40, 12, 2, '#cfefff');
      } else if (t === T.DECOR && kind === 'dungeon') {
        R(X + 4, Y + 24, 24, 6, 'rgba(0,0,0,.3)'); R(X + 6, Y + 2, 20, 26, '#7a738f'); R(X + 6, Y + 2, 5, 26, '#948dab'); R(X + 3, Y, 26, 4, '#8f88a6'); R(X + 3, Y + 26, 26, 4, '#6d667f');
      }
    }
    // buildings
    const roofs = ['#c0392b', '#2e86c1', '#1e8449', '#b9770e', '#7d3c98', '#a04000', '#1f618d'];
    (g.buildings || []).forEach((b, n) => {
      const X = b[0] * S, Y = b[1] * S, W = b[2] * S, H = b[3] * S, castle = b[2] >= 16, ry = Math.round(H * 0.6);
      R(X + 2, Y + H, W, 6, 'rgba(0,0,0,.25)');
      R(X, Y, W, H, castle ? '#c3c7d0' : '#efe2c0'); R(X, Y + ry, W, H - ry, castle ? '#aab0bb' : '#e2d2a8');
      const rc = castle ? '#566573' : roofs[n % roofs.length];
      R(X, Y, W, ry, rc); for (let yy = 6; yy < ry; yy += 8) R(X, Y + yy, W, 2, 'rgba(0,0,0,.18)'); R(X, Y, W, 4, 'rgba(255,255,255,.25)');
      for (let xx = 0; xx < W; xx += 16) R(X + xx, Y + ry - 6 + ((xx / 16) % 2) * 3, 8, 6, 'rgba(0,0,0,.12)');
      if (castle) { for (let xx = 0; xx < W; xx += 20) R(X + xx, Y - 6, 10, 8, '#8795a1'); [0, W - 40].forEach(o => { R(X + o, Y - 4, 40, H, '#7b8794'); R(X + o, Y - 4, 40, 8, '#9aa6b2'); R(X + o + 14, Y + 24, 12, 18, '#2c3e50'); });
        R(X + W / 2 - 22, Y + H - 52, 44, 52, '#4e342e'); R(X + W / 2 - 22, Y + H - 52, 44, 6, '#6d4c41'); R(X + W / 2 - 2, Y + H - 50, 4, 50, '#3e2723'); R(X + W / 2 - 60, Y + 20, 10, 30, '#c0392b'); R(X + W / 2 + 50, Y + 20, 10, 30, '#c0392b'); }
      else { const cx = X + W / 2; R(cx - 9, Y + H - 24, 18, 24, '#6d4c41'); R(cx - 9, Y + H - 24, 18, 3, '#8d6e63'); R(cx + 4, Y + H - 12, 2, 2, '#ffd54f');
        [X + 14, X + W - 30].forEach(wx => { R(wx, Y + ry + 6, 16, 14, '#5d4037'); R(wx + 2, Y + ry + 8, 12, 10, '#8fd0ff'); R(wx + 7, Y + ry + 8, 2, 10, '#5d4037'); }); }
      x.strokeStyle = '#3a2a2a'; x.lineWidth = 2; x.strokeRect(X + 1, Y + 1, W - 2, H - 2);
    });
    return c;
  }
  function outlineCircleHint() { /* trees are already pixel-art circles; kept as a hook for custom outlines */ }

  /* ------------------------------------------------------- Phaser textures */
  function build(scene) {
    const tx = scene.textures;
    const addSheet = (key, canvas, fw, names) => { const t = tx.addCanvas(key, canvas); names.forEach((n, i) => t.add(n, 0, i * fw, 0, fw, canvas.height)); };
    for (const cls in LOOK) addSheet('char_' + cls, charSheet(LOOK[cls], GD.CLASSES[cls].weapon), FW, ['i', 'w0', 'w1', 'a', 'c']);
    for (const id in GD.NPCS) { const n = GD.NPCS[id]; addSheet('npc_' + id, charSheet(Object.assign({}, LOOK[n.look], NPC_LOOK[id] || {}), null, ['i']), FW, ['i']); }
    for (const k in MON) addSheet('mob_' + k, monSheet(k), MON[k].w, ['f0', 'f1']);
    let c = cv(24, 10), x = c.getContext('2d'); ell(x, 12, 5, 11, 4, 'rgba(0,0,0,.35)'); tx.addCanvas('shadow', c);
    c = cv(12, 12); x = c.getContext('2d'); ell(x, 6, 6, 5, 5, '#fff'); tx.addCanvas('spark', c);
    c = cv(64, 64); x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); tx.addCanvas('glow', c);
    c = cv(64, 64); x = c.getContext('2d'); x.lineWidth = 4;
    ['#b388ff', '#7c4dff', '#00e5ff'].forEach((col, i) => { x.strokeStyle = col; x.beginPath(); x.ellipse(32, 32, 28 - i * 8, 28 - i * 8, 0, i, i + 4.6); x.stroke(); });
    tx.addCanvas('portal', c);
  }

  const monSize = key => MON[key] ? { w: MON[key].w, h: MON[key].h } : { w: 32, h: 32 };
  return { FW, FH, LOOK, lookFor, charSheet, monSheet, monKeys: Object.keys(MON), portrait, itemIcon, renderMap, build, monSize };
})();
