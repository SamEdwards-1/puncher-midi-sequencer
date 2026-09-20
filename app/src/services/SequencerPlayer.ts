import {
  Engine,
  EngineActions,
  EngineEvent,
  NoteOffEvent,
  PatchJSON,
  StepIndex,
} from "@midiseq/core"
import { makeObservable, observable } from "mobx"
import { OutputAssignment, OutputRouter } from "./OutputRouter"
import { createWorkerTicker, Ticker } from "./Ticker"

export interface SequencerPlayerOptions {
  now?: () => number
  ticker?: Ticker
  lookaheadMs?: number
  startDelayMs?: number
  seed?: number
}

const TICK_MS = 25
const LOOKAHEAD_MS = 100
// gives the first events time to be scheduled before they are due
const START_DELAY_MS = 50

/**
 * Drives the engine in real time: on every tick it renders the next lookahead
 * window, converts beats to performance.now() timestamps, and hands the
 * events to the router so the browser can send them precisely on time.
 */
export class SequencerPlayer {
  isPlaying = false
  position: StepIndex | null = null

  private readonly engine: Engine
  private readonly now: () => number
  private readonly ticker: Ticker
  private readonly lookaheadMs: number
  private readonly startDelayMs: number
  private patch: PatchJSON
  private tempo: number
  private anchorTime = 0
  private anchorBeat = 0
  // rendered events not yet due for scheduling, in beat order
  private pending: EngineEvent[] = []
  private stepMarks: { time: number; position: StepIndex }[] = []
  private lastScheduledTime = 0

  constructor(
    patch: PatchJSON,
    private readonly router: OutputRouter,
    options: SequencerPlayerOptions = {},
  ) {
    this.patch = patch
    this.tempo = patch.tempo
    this.now = options.now ?? (() => performance.now())
    this.ticker = options.ticker ?? createWorkerTicker(TICK_MS)
    this.lookaheadMs = options.lookaheadMs ?? LOOKAHEAD_MS
    this.startDelayMs = options.startDelayMs ?? START_DELAY_MS
    this.engine = new Engine(patch, {
      seed: options.seed ?? Math.floor(Math.random() * 2 ** 32),
    })

    makeObservable(this, {
      isPlaying: observable,
      position: observable,
    })
  }

  setPatch(patch: PatchJSON) {
    this.patch = patch
    this.engine.setPatch(patch)
  }

  setActions(actions: Partial<EngineActions>) {
    this.engine.setActions(actions)
  }

  setOutputs(assignment: OutputAssignment) {
    this.router.setAssignment(assignment, this.now())
  }

  // The sequencer moves to this step the next time it advances.
  queueStep = (step: number) => {
    this.engine.queueStep(step)
  }

  play = () => {
    if (this.isPlaying) {
      return
    }
    const now = this.now()
    this.tempo = this.patch.tempo
    this.anchorTime = now + this.startDelayMs
    this.anchorBeat = 0
    this.pending = []
    this.stepMarks = []
    this.lastScheduledTime = now
    this.engine.start(0)
    this.isPlaying = true
    this.ticker.start(this.tick)
    this.tick()
  }

  stop = () => {
    if (!this.isPlaying) {
      return
    }
    this.ticker.stop()
    const now = this.now()
    const sounding = this.engine
      .stop(Math.max(0, this.beatAt(now)))
      .filter((event): event is NoteOffEvent => event.type === "noteOff")
    this.router.panic(now, this.horizon(now), sounding)
    this.pending = []
    this.stepMarks = []
    this.isPlaying = false
    this.position = null
  }

  panic = () => {
    if (this.isPlaying) {
      this.stop()
      return
    }
    const now = this.now()
    this.router.panic(now, this.horizon(now))
  }

  tick = () => {
    if (!this.isPlaying) {
      return
    }
    const now = this.now()

    // a tempo change keeps the current beat and bends time from here on
    if (this.patch.tempo !== this.tempo) {
      this.anchorBeat = this.beatAt(now)
      this.anchorTime = now
      this.tempo = this.patch.tempo
    }

    const toBeat = this.beatAt(now + this.lookaheadMs)
    this.pending.push(...this.engine.render(toBeat))
    this.pending.sort((a, b) => a.beat - b.beat)

    let due = 0
    while (due < this.pending.length && this.pending[due].beat <= toBeat) {
      const event = this.pending[due++]
      const time = Math.max(this.timeAt(event.beat), now)
      if (event.type === "step") {
        this.stepMarks.push({ time, position: event.position })
      } else {
        this.router.route(event, time)
      }
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
    this.pending = this.pending.slice(due)

    let position = this.position
    while (this.stepMarks.length > 0 && this.stepMarks[0].time <= now) {
      position = this.stepMarks[0].position
      this.stepMarks.shift()
    }
    if (position !== this.position) {
      this.position = position
    }
  }

  private beatAt(time: number): number {
    return this.anchorBeat + ((time - this.anchorTime) * this.tempo) / 60000
  }

  private timeAt(beat: number): number {
    return this.anchorTime + ((beat - this.anchorBeat) * 60000) / this.tempo
  }

  private horizon(now: number): number {
    return Math.max(now, this.lastScheduledTime) + 1
  }
}
