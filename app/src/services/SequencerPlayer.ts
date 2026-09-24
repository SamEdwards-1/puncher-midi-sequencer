import {
  CLOCKS_PER_BEAT,
  clockBytes,
  createActions,
  Engine,
  EngineActions,
  EngineEvent,
  NoteOffEvent,
  PatchJSON,
  paceBeats,
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
// upper bound on how long a clicked step sounds
const PREVIEW_MAX_MS = 2000
const BEAT_EPSILON = 1e-9
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
  // the dot each voice plays first on the sounding step, null when stopped
  voiceDots: number[] | null = null
  actions: EngineActions = createActions()

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
  private stepMarks: {
    time: number
    position: StepIndex
    voiceDots: number[]
  }[] = []
  private lastScheduledTime = 0
  private sendClock = false
  // the last clock tick handed to the router, counted from the start
  private clockSent = -1

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
      voiceDots: observable.ref,
      actions: observable.ref,
    })
  }

  setPatch(patch: PatchJSON) {
    this.patch = patch
    this.engine.setPatch(patch)
  }

  setActions(actions: Partial<EngineActions>) {
    this.actions = { ...this.actions, ...actions }
    this.engine.setActions(actions)
  }

  // Hang, Bump, Flip and Shift, held or latched from the UI.
  setAction = (action: keyof EngineActions, held: boolean) => {
    this.setActions({ [action]: held })
  }

  setOutputs(assignment: OutputAssignment) {
    this.router.setAssignment(assignment, this.now())
  }

  // The sequencer moves to this step the next time it advances.
  queueStep = (step: number) => {
    this.engine.queueStep(step)
  }

  /**
   * Sounds one step the way the sequencer would play it: the voices read it
   * at their own paces, patterns and rules for the length of a sequencer
   * step. Everything is timestamped rather than timed by a timer, so it lands
   * even if the tab is busy.
   */
  previewStep = (step: number) => {
    const patch = this.patch
    const source = patch.steps[step]
    if (source === undefined) {
      return
    }

    // A one-step patch, so the sequencer stays on this step and the voices
    // start together as they would on landing.
    const previewPatch: PatchJSON = {
      ...patch,
      loop: { mode: "custom", end: 0 },
      steps: patch.steps.map((existing, index) =>
        index === 0
          ? {
              ...source,
              jump: { rule: { kind: "always" }, dest: null, normal: null },
            }
          : existing,
      ),
    }

    const engine = new Engine(previewPatch, {
      seed: Math.floor(Math.random() * 2 ** 32),
    })
    engine.start(0)
    const msPerBeat = 60000 / patch.tempo
    // a slow sequencer pace would otherwise run for a long time
    const beats = Math.min(paceBeats(patch.pace), PREVIEW_MAX_MS / msPerBeat)
    const events = [
      ...engine.render(beats - BEAT_EPSILON),
      ...engine.stop(beats),
    ]

    const now = this.now()
    for (const event of events) {
      if (event.type === "step") {
        continue
      }
      const time = now + event.beat * msPerBeat
      this.router.route(event, time)
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
  }

  setSendClock = (send: boolean) => {
    this.sendClock = send
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
    this.clockSent = -1
    this.engine.start(0)
    this.isPlaying = true
    if (this.sendClock) {
      this.router.clock(clockBytes("start"), now)
    }
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
    if (this.sendClock) {
      this.router.clock(clockBytes("stop"), now)
    }
    this.pending = []
    this.stepMarks = []
    this.isPlaying = false
    this.position = null
    this.voiceDots = null
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
    this.emitClock(toBeat, now)
    this.pending.push(...this.engine.render(toBeat))
    this.pending.sort((a, b) => a.beat - b.beat)

    let due = 0
    while (due < this.pending.length && this.pending[due].beat <= toBeat) {
      const event = this.pending[due++]
      const time = Math.max(this.timeAt(event.beat), now)
      if (event.type === "step") {
        this.stepMarks.push({
          time,
          position: event.position,
          voiceDots: event.voiceDots,
        })
      } else {
        this.router.route(event, time)
      }
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
    this.pending = this.pending.slice(due)

    let position = this.position
    let voiceDots = this.voiceDots
    while (this.stepMarks.length > 0 && this.stepMarks[0].time <= now) {
      position = this.stepMarks[0].position
      voiceDots = this.stepMarks[0].voiceDots
      this.stepMarks.shift()
    }
    if (position !== this.position) {
      this.position = position
    }
    // a new array only when a step has sounded, so observers of an unchanged
    // step are not woken every tick
    if (voiceDots !== this.voiceDots) {
      this.voiceDots = voiceDots
    }
  }

  // 24 to the quarter note, on the same grid the notes are scheduled against
  private emitClock(toBeat: number, now: number) {
    if (!this.sendClock) {
      return
    }
    const due = Math.floor(toBeat * CLOCKS_PER_BEAT)
    const bytes = clockBytes("clock")
    for (let tick = this.clockSent + 1; tick <= due; tick++) {
      const time = Math.max(this.timeAt(tick / CLOCKS_PER_BEAT), now)
      this.router.clock(bytes, time)
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
    this.clockSent = Math.max(this.clockSent, due)
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
