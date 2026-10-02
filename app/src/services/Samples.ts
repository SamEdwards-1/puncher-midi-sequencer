/** How a run of measurements spreads, from the middle one to the largest. */
export interface Spread {
  p50: number
  p95: number
  p99: number
  max: number
}

// about a minute of ticks
const KEPT = 2400

/**
 * The last few thousand of something measured, kept cheaply enough to leave
 * on: added as they come, the oldest making way for the newest.
 */
export class Samples {
  // every one added since the last reset, kept or not
  count = 0
  private readonly kept: Float64Array

  constructor(size = KEPT) {
    this.kept = new Float64Array(size)
  }

  add(value: number) {
    this.kept[this.count % this.kept.length] = value
    this.count++
  }

  reset() {
    this.count = 0
  }

  // all 0 when there are none
  spread(): Spread {
    const sorted = this.kept
      .slice(0, Math.min(this.count, this.kept.length))
      .sort((a, b) => a - b)
    const at = (fraction: number) =>
      sorted.length === 0
        ? 0
        : sorted[
            Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
          ]
    return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) }
  }
}
