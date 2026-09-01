/**
 * Deterministic pseudo-randomness.
 *
 * Every fixture in this app is derived from its own integer index rather than
 * stored, which is what makes a 100,000-document archive cheap: nothing is
 * generated until a row is actually returned, and the same index always
 * produces the same document across reloads and across machines.
 */

/** Small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Adjacent indices produce very similar mulberry32 streams, which would make
 * neighbouring documents suspiciously alike. Hashing first decorrelates them.
 */
function hash(index: number, salt: number): number {
  let h = (index ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rngFor(index: number, salt = 0x9e3779b9): () => number {
  return mulberry32(hash(index, salt));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    throw new Error('pick() called with an empty list');
  }
  return item;
}

export function intBetween(
  rng: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function floatBetween(
  rng: () => number,
  min: number,
  max: number,
): number {
  return min + rng() * (max - min);
}

export function chance(rng: () => number, probability: number): boolean {
  return rng() < probability;
}
