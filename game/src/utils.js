// Shared helpers for NEON BAY: seeded randomness, math, and tiny geometry tools.
// Nothing here knows about the game state; every module imports what it needs.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    chance(p) { return next() < p; },
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Shortest signed angle from `from` to `to`, in radians, wrapped to [-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(from, to, t) {
  return from + angleDelta(from, to) * t;
}

export function distance2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function formatCash(amount) {
  const n = Math.round(amount);
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'AM' : 'PM';
  return hh + ':' + String(m).padStart(2, '0') + ' ' + suffix;
}

export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Push a circle (x, z, radius) out of an axis-aligned box; returns true on hit. */
export function resolveCircleBox(px, pz, radius, box) {
  const cx = clamp(px, box.x - box.hw, box.x + box.hw);
  const cz = clamp(pz, box.z - box.hd, box.z + box.hd);
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (radius - d), z: (dz / d) * (radius - d) };
  }
  // Centre inside the box: shove out along the smallest penetration axis.
  const ox = box.hw + radius - Math.abs(px - box.x);
  const oz = box.hd + radius - Math.abs(pz - box.z);
  if (ox < oz) return { x: px < box.x ? -ox : ox, z: 0 };
  return { x: 0, z: pz < box.z ? -oz : oz };
}
