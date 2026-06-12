/**
 * RNG abstraction so the engine is deterministic under test and
 * cryptographically shuffled in production. Never Math.random for cards.
 */
export interface Rng {
  /** Uniform integer in [0, maxExclusive). maxExclusive ≥ 1. */
  nextInt(maxExclusive: number): number;
}

/**
 * Production RNG backed by the platform CSPRNG (Web Crypto, available in
 * Node ≥19 and all browsers — same entropy source as crypto.randomBytes).
 * Uses rejection sampling so results are unbiased.
 */
export function createCryptoRng(): Rng {
  const buf = new Uint32Array(64);
  let idx = buf.length; // force initial fill
  const refill = () => {
    globalThis.crypto.getRandomValues(buf);
    idx = 0;
  };
  const next32 = (): number => {
    if (idx >= buf.length) refill();
    return buf[idx++]!;
  };
  return {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`nextInt: invalid bound ${maxExclusive}`);
      }
      if (maxExclusive === 1) return 0;
      // Rejection sampling: discard values in the biased tail.
      const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
      let v = next32();
      while (v >= limit) v = next32();
      return v % maxExclusive;
    },
  };
}

/**
 * Deterministic RNG (mulberry32) for tests and simulations.
 * NOT cryptographic — never use for live shuffles.
 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`nextInt: invalid bound ${maxExclusive}`);
      }
      if (maxExclusive === 1) return 0;
      const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
      let v = next();
      while (v >= limit) v = next();
      return v % maxExclusive;
    },
  };
}

/** In-place Fisher–Yates. */
export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
