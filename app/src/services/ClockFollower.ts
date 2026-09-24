import { CLOCKS_PER_BEAT } from "@midiseq/core"

// Enough ticks to average out the jitter in how messages arrive, but still
// under a beat, so a tempo change is followed within one.
const TICKS_AVERAGED = 12
// Longer than this between ticks is a pause or a disconnection, not a tempo.
const MAX_GAP_MS = 500
// The range the tempo field itself allows.
const MIN_BPM = 20
const MAX_BPM = 400

/**
 * Reads a tempo out of an incoming MIDI clock, and nothing else: start and
 * stop are not obeyed, so the transport stays midiseq's own. Only the number
 * in the tempo field follows.
 */
export class ClockFollower {
  private last: number | null = null
  private intervals: number[] = []

  constructor(private readonly now: () => number = () => performance.now()) {}

  reset() {
    this.last = null
    this.intervals = []
  }

  /**
   * Takes one clock tick. Returns a tempo in whole BPM once it has heard
   * enough of them, or null while it is still listening.
   */
  onTick(): number | null {
    const now = this.now()
    const last = this.last
    this.last = now
    if (last === null) {
      return null
    }
    const interval = now - last
    if (interval <= 0 || interval > MAX_GAP_MS) {
      // the clock stopped and started again, so what came before says nothing
      this.intervals = []
      return null
    }
    this.intervals.push(interval)
    if (this.intervals.length > TICKS_AVERAGED) {
      this.intervals.shift()
    }
    if (this.intervals.length < TICKS_AVERAGED) {
      return null
    }
    const average =
      this.intervals.reduce((sum, value) => sum + value, 0) /
      this.intervals.length
    const bpm = Math.round(60000 / (average * CLOCKS_PER_BEAT))
    return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm))
  }
}
