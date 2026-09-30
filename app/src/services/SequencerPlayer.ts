import {
  CLOCKS_PER_BEAT,
  clockBytes,
  createActions,
  DEFAULT_ACCENT_AMOUNT,
  Engine,
  EngineActions,
  EngineEvent,
  ModulatedSetting,
  modulatedSettings,
  NoteOffEvent,
  NoteOnEvent,
  nextRound,
  PatchJSON,
  paceBeats,
  StepIndex,
  StepNote,
  StepRound,
  sameModulationValue,
  sameTarget,
  stepEvents,
  stepPace,
  VoiceIndex,
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

/**
 * Where a step landed. `step` is the stored step it plays, which differs
 * from `position` while Flip is held; `beat` and `lengthBeats` are what the
 * engine measures that step's envelopes against.
 */
interface StepMark {
  time: number
  beat: number
  lengthBeats: number
  position: StepIndex
  step: StepIndex
  voiceDots: number[]
}

/** How far through the sounding step the sequence is, 0 to 1. */
export interface StepProgress {
  step: StepIndex
  time: number
  lengthBeats: number
}

/**
 * A round of the sequencer on its way or sounding, and the engine as it was
 * just before it, to play the round again from should the patch change.
 */
interface Round extends StepRound {
  time: number
  from: Engine
}

/** The notes the sounding step plays, as the sequence plays it this time. */
export interface RoundNotes {
  step: StepIndex
  notes: StepNote[]
}

/**
 * A clicked step sounding on its own: when it started, how long a beat and
 * the step last, and when it ends.
 */
export interface StepPreview {
  step: StepIndex
  time: number
  msPerBeat: number
  lengthBeats: number
  end: number
}

const sameSettings = (
  a: ModulatedSetting[] | null,
  b: ModulatedSetting[] | null,
) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every(
      (each, index) =>
        sameTarget(each.target, b[index].target) &&
        each.cc === b[index].cc &&
        each.ccValue === b[index].ccValue &&
        sameModulationValue(each.value, b[index].value),
    ))

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
  // the stored step sounding, which differs from `position` while Flip is
  // held; null when stopped
  step: StepIndex | null = null
  // the clicked step sounding on its own, until another is clicked or the
  // sound is stopped; it may have finished
  preview: StepPreview | null = null
  // the dot each voice plays first on the sounding step, null when stopped
  voiceDots: number[] | null = null
  // the dot each voice is on right now; null for a voice yet to reach one,
  // or for all of them when stopped
  playingDots: (number | null)[] | null = null
  // the settings the sounding step modulates, as its envelopes have them
  // right now; null when stopped
  modulated: ModulatedSetting[] | null = null
  // what the sounding step plays this time round, which differs from one
  // time to the next where the voices come to it partway through their
  // patterns; null when stopped
  roundNotes: RoundNotes | null = null
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
  private stepMarks: StepMark[] = []
  // the last step that has sounded, for recording onto it
  private landed: StepMark | null = null
  private dotMarks: { time: number; voice: number; dot: number }[] = []
  // the rounds played ahead and not yet reached, and the one sounding
  private rounds: Round[] = []
  private round: Round | null = null
  // the clicked step's events not yet handed to the router, in time order;
  // the notes it has started and not yet ended; and its latest sent
  private previewPending: { time: number; event: EngineEvent }[] = []
  private previewSounding = new Map<string, NoteOnEvent>()
  private previewScheduled = 0
  private lastScheduledTime = 0
  private sendClock = false
  // whether the envelopes whose CC drives a setting go out as well
  private sendModulationCCs = true
  private accentAmount = DEFAULT_ACCENT_AMOUNT
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
      step: observable,
      preview: observable.ref,
      voiceDots: observable.ref,
      playingDots: observable.ref,
      modulated: observable.ref,
      roundNotes: observable.ref,
      actions: observable.ref,
    })
  }

  setPatch(patch: PatchJSON) {
    this.patch = patch
    this.engine.setPatch(patch)
    this.replayRounds()
  }

  setActions(actions: Partial<EngineActions>) {
    this.actions = { ...this.actions, ...actions }
    this.engine.setActions(actions)
  }

  // The voice Sync keeps to the sequencer's pace: the one the UI has
  // selected.
  setSelectedVoice = (voice: VoiceIndex) => {
    this.engine.selectedVoice = voice
  }

  // Hold, Sync, Flip and Transpose, held or latched from the UI.
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
   * Sounds one step all the way through, as the step editor shows it: the
   * voices play it at their own paces, patterns and rules, from wherever
   * they have come round to when the sequence first reaches it. It goes out
   * a little ahead at a time, as the sequence does, so clicking another
   * step or stopping cuts it short however long the step is.
   */
  previewStep = (step: number) => {
    const patch = this.patch
    if (patch.steps[step] === undefined) {
      return
    }

    const now = this.now()
    this.endPreview(now)
    const msPerBeat = 60000 / patch.tempo
    const lengthBeats = paceBeats(stepPace(patch, step))
    this.preview = {
      step,
      time: now,
      msPerBeat,
      lengthBeats,
      end: now + lengthBeats * msPerBeat,
    }
    this.previewPending = stepEvents(patch, step, {
      accentAmount: this.accentAmount,
    })
      .filter((event) => this.sends(event))
      .map((event) => ({ time: now + event.beat * msPerBeat, event }))
      .sort((a, b) => a.time - b.time)
    this.sendPreview(now)
    if (!this.isPlaying) {
      this.ticker.start(this.tick)
    }
  }

  // Hands the clicked step's events due within the lookahead to the router.
  private sendPreview(now: number) {
    const until = now + this.lookaheadMs
    let due = 0
    while (
      due < this.previewPending.length &&
      this.previewPending[due].time <= until
    ) {
      const { time, event } = this.previewPending[due++]
      if (event.type === "noteOn") {
        this.previewSounding.set(noteKey(event), event)
      } else if (event.type === "noteOff") {
        this.previewSounding.delete(noteKey(event))
      }
      this.router.route(event, time)
      this.previewScheduled = Math.max(this.previewScheduled, time)
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
    this.previewPending = this.previewPending.slice(due)
  }

  // Cuts the clicked step short: what it has yet to send is dropped, and
  // the notes it has started end after the last thing it sent.
  private endPreview(now: number) {
    const time = Math.max(now, this.previewScheduled)
    for (const on of this.previewSounding.values()) {
      this.router.route({ ...on, type: "noteOff" }, time)
    }
    this.dropPreview()
  }

  // Forgets the clicked step, once its notes are ended or silenced.
  private dropPreview() {
    this.previewPending = []
    this.previewSounding.clear()
    this.preview = null
  }

  // The rounds on their way, played again from where each began, so what
  // they show follows an edit made while they sound.
  private replayRounds() {
    const replay = (round: Round): Round => {
      const from = round.from.fork()
      from.setPatch(this.patch)
      from.accentAmount = this.accentAmount
      return { ...round, notes: nextRound(from).round.notes }
    }
    this.rounds = this.rounds.map(replay)
    if (this.round !== null && this.roundNotes !== null) {
      this.round = replay(this.round)
      this.roundNotes = { ...this.roundNotes, notes: this.round.notes }
    }
  }

  setSendClock = (send: boolean) => {
    this.sendClock = send
  }

  // A modulation's CC still drives its setting either way; this is only
  // whether it goes out too.
  setSendModulationCCs = (send: boolean) => {
    this.sendModulationCCs = send
  }

  // How far an accent moves a velocity; the next note played hears it.
  setAccentAmount = (amount: number) => {
    this.accentAmount = amount
    this.engine.accentAmount = amount
    this.replayRounds()
  }

  /**
   * The step sounding now and how far through it, measured the way the
   * engine reads that step's envelopes — so a point recorded here plays
   * back at the moment it was played. A step whose mark is due but not yet
   * taken off by a tick counts as sounding, which keeps a recording exact
   * right at a step's edge. Null when stopped, or before the first step.
   */
  stepProgress = (): StepProgress | null => {
    const sounded = this.stepSounded()
    if (sounded === null) {
      return null
    }
    return {
      step: sounded.mark.step,
      time: Math.min(1, Math.max(0, sounded.along)),
      lengthBeats: sounded.mark.lengthBeats,
    }
  }

  // The step sounding now and how many times through it, which goes past 1
  // while Hold keeps it round after round.
  private stepSounded = (): { mark: StepMark; along: number } | null => {
    if (!this.isPlaying) {
      return null
    }
    const now = this.now()
    let current = this.landed
    for (const mark of this.stepMarks) {
      if (mark.time > now) {
        break
      }
      current = mark
    }
    if (current === null) {
      return null
    }
    return {
      mark: current,
      along: (this.beatAt(now) - current.beat) / current.lengthBeats,
    }
  }

  /**
   * How far through `step` the playhead is, 0 to 1: as the sequence plays
   * it — starting over each time round while Hold keeps it — or else as a
   * click on it sounds it. Null while it isn't sounding.
   */
  playhead = (step: StepIndex): number | null => {
    const sounded = this.stepSounded()
    if (sounded !== null && sounded.mark.step === step) {
      return Math.max(0, sounded.along) % 1
    }
    const preview = this.preview
    if (preview === null || preview.step !== step) {
      return null
    }
    const now = this.now()
    if (now < preview.time || now >= preview.end) {
      return null
    }
    return (now - preview.time) / preview.msPerBeat / preview.lengthBeats
  }

  // Whether anything is sounding for a playhead to follow.
  sounding = (): boolean =>
    this.isPlaying || (this.preview !== null && this.now() < this.preview.end)

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
    this.landed = null
    this.dotMarks = []
    this.rounds = []
    this.round = null
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
    this.landed = null
    this.dotMarks = []
    this.rounds = []
    this.round = null
    this.isPlaying = false
    this.position = null
    this.step = null
    // the panic above silenced it
    this.dropPreview()
    this.voiceDots = null
    this.playingDots = null
    this.modulated = null
    this.roundNotes = null
  }

  panic = () => {
    if (this.isPlaying) {
      this.stop()
      return
    }
    this.ticker.stop()
    const now = this.now()
    this.router.panic(now, this.horizon(now))
    this.dropPreview()
  }

  tick = () => {
    const now = this.now()
    this.sendPreview(now)
    if (!this.isPlaying) {
      if (this.previewPending.length === 0) {
        this.ticker.stop()
      }
      return
    }

    // a tempo change keeps the current beat and bends time from here on
    if (this.patch.tempo !== this.tempo) {
      this.anchorBeat = this.beatAt(now)
      this.anchorTime = now
      this.tempo = this.patch.tempo
    }

    const toBeat = this.beatAt(now + this.lookaheadMs)
    this.emitClock(toBeat, now)
    this.queueRounds(toBeat, now)
    this.pending.push(...this.engine.render(toBeat))
    this.pending.sort((a, b) => a.beat - b.beat)

    let due = 0
    while (due < this.pending.length && this.pending[due].beat <= toBeat) {
      const event = this.pending[due++]
      const time = Math.max(this.timeAt(event.beat), now)
      if (event.type === "step") {
        this.stepMarks.push({
          time,
          beat: event.beat,
          lengthBeats: paceBeats(stepPace(this.patch, event.step)),
          position: event.position,
          step: event.step,
          voiceDots: event.voiceDots,
        })
      } else if (event.type === "dot") {
        this.dotMarks.push({ time, voice: event.voice, dot: event.dot })
      } else if (this.sends(event)) {
        this.router.route(event, time)
      }
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
    this.pending = this.pending.slice(due)

    let position = this.position
    let step = this.step
    let voiceDots = this.voiceDots
    while (this.stepMarks.length > 0 && this.stepMarks[0].time <= now) {
      position = this.stepMarks[0].position
      step = this.stepMarks[0].step
      voiceDots = this.stepMarks[0].voiceDots
      this.landed = this.stepMarks[0]
      this.stepMarks.shift()
    }
    if (position !== this.position) {
      this.position = position
    }
    if (step !== this.step) {
      this.step = step
    }
    // a new array only when a step has sounded, so observers of an unchanged
    // step are not woken every tick
    if (voiceDots !== this.voiceDots) {
      this.voiceDots = voiceDots
    }

    let round = this.round
    while (this.rounds.length > 0 && this.rounds[0].time <= now) {
      round = this.rounds.shift() ?? null
    }
    if (round !== this.round) {
      this.round = round
      // a round Hold keeps goes on with the step it was on
      const roundStep = round?.step ?? step
      this.roundNotes =
        round === null || roundStep === null
          ? null
          : { step: roundStep, notes: round.notes }
    }

    if (this.dotMarks.length > 0 && this.dotMarks[0].time <= now) {
      const playingDots = [...(this.playingDots ?? [null, null, null, null])]
      while (this.dotMarks.length > 0 && this.dotMarks[0].time <= now) {
        const { voice, dot } = this.dotMarks[0]
        playingDots[voice] = dot
        this.dotMarks.shift()
      }
      this.playingDots = playingDots
    }

    // A new list only when something in it has changed, so a field showing
    // a setting is woken only when its value moves.
    const modulated =
      this.landed === null
        ? null
        : modulatedSettings(
            this.patch,
            this.landed.step,
            this.beatAt(now) - this.landed.beat,
          )
    if (!sameSettings(modulated, this.modulated)) {
      this.modulated = modulated
    }
  }

  // Plays each round of the sequencer due by `toBeat` on a fork of the
  // engine, before the engine itself plays into it, so all a step's notes
  // are known as it lands.
  private queueRounds(toBeat: number, now: number) {
    let from = this.engine
    while (from.nextStepBeat <= toBeat) {
      const before = from === this.engine ? from.fork() : from
      const { round, after } = nextRound(before)
      this.rounds.push({
        ...round,
        time: Math.max(this.timeAt(round.beat), now),
        from: before,
      })
      from = after
    }
  }

  private sends(event: EngineEvent): boolean {
    return (
      this.sendModulationCCs ||
      event.type !== "cc" ||
      event.source !== "modulation"
    )
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

const noteKey = (event: { voice: VoiceIndex; channel: number; note: number }) =>
  `${event.voice}:${event.channel}:${event.note}`
