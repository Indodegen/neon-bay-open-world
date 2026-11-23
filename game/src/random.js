// Seeded RNG (mulberry32) so screenshot staging is deterministic.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
// Integer in [lo, hi] — consumes exactly one rng() call, same distribution as
// 1 + Math.floor(rng() * 3), so swapping it in never reshuffles the city.
export function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// Fisher–Yates shuffle — returns a new array, the input is untouched.
export function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
