/**
 * Seeded PRNG so the incident set is reproducible: the same master seed always
 * regenerates byte-identical incidents, which is what lets the eval compare runs
 * over time against a fixed dataset.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number;
  /** Uniform float in [lo, hi). */
  float(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(xs: readonly T[]): T[];
  /** Independent child stream, so adding draws in one place doesn't reshuffle another. */
  fork(label: string): Rng;
}

/** FNV-1a: stable 32-bit hash of a string, used to derive seeds. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  const base = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
  let state = base;

  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    float: (lo, hi) => lo + next() * (hi - lo),
    pick: (xs) => {
      if (xs.length === 0) throw new Error("pick from empty array");
      return xs[Math.floor(next() * xs.length)];
    },
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork: (label) => createRng(hashSeed(`${base}:${label}`)),
  };
  return rng;
}

/** `count` sorted times spread across [from, to) with jitter. */
export function spread(rng: Rng, from: number, to: number, count: number): number[] {
  if (count <= 0 || to <= from) return [];
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, i) => from + step * i + rng.float(0, step * 0.9));
}
