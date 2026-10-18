/* server/nav.js — tile collision, sliding movement and A* pathfinding */
const GD = require('../shared/data');
const TILE = GD.TILE, RAD = 9;           // entity collision radius in px
const solidT = (g, tx, ty) => GD.solidAt(g, tx, ty);

function canStand(g, x, y) {
  const x0 = Math.floor((x - RAD) / TILE), x1 = Math.floor((x + RAD) / TILE);
  const y0 = Math.floor((y - RAD) / TILE), y1 = Math.floor((y + RAD) / TILE);
  return !(solidT(g, x0, y0) || solidT(g, x1, y0) || solidT(g, x0, y1) || solidT(g, x1, y1));
}

/** Move an entity by (dx,dy); slide along walls if the direct move is blocked. */
function slide(g, e, dx, dy) {
  if (dx > 0.01) e.dir = 1; else if (dx < -0.01) e.dir = -1;
  if (canStand(g, e.x + dx, e.y + dy)) { e.x += dx; e.y += dy; return true; }
  let moved = false;
  if (dx && canStand(g, e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (dy && canStand(g, e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}

/** Walk along e.path (array of {x,y} px waypoints). Returns true while moving. */
function follow(g, e, speed, dt) {
  let move = speed * dt, moved = false;
  while (e.path && e.path.length && move > 0) {
    const w = e.path[0], dx = w.x - e.x, dy = w.y - e.y, d = Math.hypot(dx, dy);
    if (d <= move) { if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1; e.x = w.x; e.y = w.y; move -= d; e.path.shift(); moved = true; }
    else { if (!slide(g, e, dx / d * move, dy / d * move)) { e.path = null; return moved; } moved = true; move = 0; }
  }
  return moved;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, v) { const a = this.a; a.push([f, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** A* on the tile grid. Returns array of tile coords (excluding start) or null. */
function astar(g, s, e, cap = 1200) {
  if (solidT(g, e.x, e.y) || solidT(g, s.x, s.y)) return null;
  const W = g.w, id = (x, y) => y * W + x, open = new Heap(), came = new Map(), cost = new Map();
  const h = (x, y) => { const dx = Math.abs(x - e.x), dy = Math.abs(y - e.y); return dx + dy - 0.586 * Math.min(dx, dy); };
  const start = id(s.x, s.y); cost.set(start, 0); open.push(h(s.x, s.y), start);
  for (let n = 0; open.size && n < cap; n++) {
    const cur = open.pop()[1], cx = cur % W, cy = (cur / W) | 0;
    if (cx === e.x && cy === e.y) { const out = []; for (let c = cur; c !== start; c = came.get(c)) out.push({ x: c % W, y: (c / W) | 0 }); return out.reverse(); }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy; if (solidT(g, nx, ny)) continue;
      if (dx && dy && (solidT(g, cx + dx, cy) || solidT(g, cx, cy + dy))) continue;   // no corner cutting
      const ni = id(nx, ny), nc = cost.get(cur) + (dx && dy ? 1.414 : 1);
      if (!cost.has(ni) || nc < cost.get(ni)) { cost.set(ni, nc); came.set(ni, cur); open.push(nc + h(nx, ny), ni); }
    }
  }
  return null;
}

/** Closest walkable tile to (tx,ty) within r tiles, or null. */
function nearestWalkable(g, tx, ty, r = 3) {
  if (!solidT(g, tx, ty)) return { x: tx, y: ty };
  for (let k = 1; k <= r; k++) for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++)
    if (Math.max(Math.abs(i), Math.abs(j)) === k && !solidT(g, tx + i, ty + j)) return { x: tx + i, y: ty + j };
  return null;
}

/** Pixel-space path from (x,y) to (tx,ty), or null. */
function pathPx(g, x, y, tx, ty) {
  const s = { x: Math.floor(x / TILE), y: Math.floor(y / TILE) }, e = nearestWalkable(g, Math.floor(tx / TILE), Math.floor(ty / TILE));
  if (!e) return null;
  const p = astar(g, s, e); if (!p) return null;
  return p.map(n => ({ x: (n.x + 0.5) * TILE, y: (n.y + 0.5) * TILE }));
}

/** Random walkable tile satisfying ok(tx,ty). */
function randomTile(g, ok, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const tx = 1 + Math.floor(Math.random() * (g.w - 2)), ty = 1 + Math.floor(Math.random() * (g.h - 2));
    if (!solidT(g, tx, ty) && (!ok || ok(tx, ty))) return { x: tx, y: ty };
  }
  return null;
}

module.exports = { TILE, canStand, slide, follow, astar, pathPx, nearestWalkable, randomTile };
