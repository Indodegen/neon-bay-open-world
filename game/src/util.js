// NEON BAY — util.js
// Deterministic RNG + small math helpers shared by every module.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Eastern land edge: the bay water starts at x=470, but the bridge deck
// (z -60 ± 7, x to 570) and the island disc (centre 560,-60, radius 95)
// are land. On the bridge deck the road is continuous from the mainland,
// so the island is reachable; once past the shoreline the island disc sets
// the eastern edge. Anywhere else the water stays walled off at x=470.
export function landMaxX(x, z) {
  const dz = z + 60;
  if (Math.abs(dz) <= 7) return 560 + Math.sqrt(95 * 95 - dz * dz);
  if (x > 470 && Math.abs(dz) <= 95) return 560 + Math.sqrt(95 * 95 - dz * dz);
  return 470;
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Shortest signed angle difference, radians.
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angLerp(a, b, t) { return a + angDiff(a, b) * t; }

// Grid helpers: Coral Bay streets sit on a 46 m pitch. Buildings sit ON the
// block centres (multiples of 46), so the drivable lanes run BETWEEN them,
// offset by half a block (23 m). Snap a point to the nearest lane centreline
// so AI routing never cuts diagonally through blocks — or through buildings.
export function snapToRoad(x, z, block = 46, roadW = 12) {
  const off = block / 2;
  const half = block / 2;
  const gx = Math.round((x - off) / block) * block + off;
  const gz = Math.round((z - off) / block) * block + off;
  // Nearest road is the closer of the vertical avenue x=gx or horizontal street z=gz.
  const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
  if (dx < dz) return { x: gx, z: clamp(z, -half * 20, half * 20) };
  return { x: clamp(x, -half * 20, half * 20), z: gz };
}

// Manhattan route through the grid: returns waypoints from (x0,z0) to (x1,z1)
// that stay on roads — avenue first, then street. Never a diagonal cut.
export function gridRoute(x0, z0, x1, z1, block = 46) {
  const a = snapToRoad(x0, z0, block);
  const b = snapToRoad(x1, z1, block);
  const pts = [{ x: a.x, z: a.z }];
  if (Math.abs(a.x - b.x) > 1) pts.push({ x: b.x, z: a.z });
  pts.push({ x: b.x, z: b.z });
  // Final leg off-road to the exact target (short, inside one block).
  pts.push({ x: x1, z: z1 });
  // Drop duplicates.
  return pts.filter((p, i) => i === 0 || dist2d(p.x, p.z, pts[i - 1].x, pts[i - 1].z) > 2);
}

export function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
export function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function chance(rng, p) { return rng() < p; }

// Tiny canvas helpers used by HUD portraits and building textures.
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
