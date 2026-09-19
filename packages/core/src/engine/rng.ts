export interface Rng {
  // returns a float in [0, 1)
  next(): number
  setSeed(seed: number): void
}

// mulberry32: small, fast, and deterministic so the engine can be tested.
export const createRng = (seed = 1): Rng => {
  let state = seed >>> 0

  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    setSeed(nextSeed: number) {
      state = nextSeed >>> 0
    },
  }
}
