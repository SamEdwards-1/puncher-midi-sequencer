/** How the scheduler has kept up, over its last few thousand ticks. */
export interface SchedulerReport {
  ticks: number
  // how long a tick took, in ms
  p50: number
  p95: number
  p99: number
  max: number
  // the longest from one tick to the next, in ms
  maxGap: number
  // events handed out after they were due, and the latest of them, in ms
  late: number
  maxLate: number
  // stalls the sequence paused for, and the time they took, in ms
  stalls: number
  stalled: number
  // ticks that ran out of rendering budget short of the lookahead, leaving
  // the rest to the ticks after
  behind: number
}

// about a minute of ticks
const KEPT = 2400

/**
 * Measures the scheduler as it plays, cheaply enough to leave on, so how it
 * keeps up can be read from the console on the device in question:
 * `midiseq.player.stats.report()`, and `.reset()` before trying something.
 */
export class SchedulerStats {
  private readonly durations = new Float64Array(KEPT)
  private ticks = 0
  private lastStart: number | null = null
  private maxGap = 0
  private late = 0
  private maxLate = 0
  private stalls = 0
  private stalled = 0
  private behind = 0

  tick(start: number, end: number) {
    this.durations[this.ticks % KEPT] = end - start
    this.ticks++
    if (this.lastStart !== null) {
      this.maxGap = Math.max(this.maxGap, start - this.lastStart)
    }
    this.lastStart = start
  }

  // the ticks have stopped, so the wait for the next isn't a gap
  idle() {
    this.lastStart = null
  }

  lateEvent(by: number) {
    this.late++
    this.maxLate = Math.max(this.maxLate, by)
  }

  stall(lasted: number) {
    this.stalls++
    this.stalled += lasted
  }

  fellBehind() {
    this.behind++
  }

  reset() {
    this.ticks = 0
    this.lastStart = null
    this.maxGap = 0
    this.late = 0
    this.maxLate = 0
    this.stalls = 0
    this.stalled = 0
    this.behind = 0
  }

  report(): SchedulerReport {
    const kept = this.durations
      .slice(0, Math.min(this.ticks, KEPT))
      .sort((a, b) => a - b)
    const at = (fraction: number) =>
      kept.length === 0
        ? 0
        : kept[Math.min(kept.length - 1, Math.floor(fraction * kept.length))]
    return {
      ticks: this.ticks,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: at(1),
      maxGap: this.maxGap,
      late: this.late,
      maxLate: this.maxLate,
      stalls: this.stalls,
      stalled: this.stalled,
      behind: this.behind,
    }
  }
}
