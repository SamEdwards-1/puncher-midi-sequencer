import {
  CLOCKS_PER_BEAT,
  clockBytes,
  createActions,
  DEFAULT_ACCENT_AMOUNT,
  Engine,
  EngineActions,
  EngineEvent,
  EngineSnapshot,
  ModulatedSetting,
  modulatedSettings,
  NoteOffEvent,
  NoteOnEvent,
  PatchJSON,
  paceBeats,
  previewsAlike,
  RENDER_BUDGET,
  StepAdvanceEvent,
  StepIndex,
  StepNote,
  sameModulationValue,
  sameTarget,
  stepEvents,
  stepPace,
  VoiceIndex,
} from "@midiseq/core"
import { action, makeObservable, observable } from "mobx"
import { OutputAssignment, OutputRouter } from "./OutputRouter"
import {
  CreateRoundPreviewer,
  createWorkerRoundPreviewer,
  PlayedRound,
  RoundJob,
  RoundPreviewer,
} from "./RoundPreviewer"
import { RoundStats } from "./RoundStats"
import { SchedulerStats } from "./SchedulerStats"
import { createWorkerTicker, OwnedTicker, Ticker } from "./Ticker"

export interface SequencerPlayerOptions {
  now?: () => number
  ticker?: Ticker
  roundPreviewer?: CreateRoundPreviewer
  lookaheadMs?: number
  startDelayMs?: number
  seed?: number
  // how much of the engine's work one tick does at most: see renderRounds
  renderBudget?: number
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
 * A round of the sequencer on its way or sounding: when it lands, the step
 * it lands on — or null where Hold keeps the one it was on — and the engine
 * as it was just before it, to play it ahead from for its notes, and again
 * should the patch change.
 */
interface Round {
  id: number
  time: number
  step: StepIndex | null
  from: EngineSnapshot
  // as played at `notesRevision` of the patch; null until played
  notes: StepNote[] | null
  notesRevision: number
  // the latest revision it has been handed out to be played at
  askedRevision: number
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
// how late events may go out before a stall pauses the sequence instead
const STALL_TOLERANCE_MS = 20
// renders up to, but not including, a beat
const BEAT_EPSILON = 1e-9
// A tick's share of the engine's work: many times what the fastest steps
// and voices at the fastest tempo ask of a tick's lookahead, but no more
// than a small part of the tick.
const TICK_RENDER_BUDGET = RENDER_BUDGET / 4

/**
 * How far a tick's render got: everything before `beat`, or when `done`,
 * the whole lookahead up to and on it.
 */
interface TickRender {
  events: EngineEvent[]
  done: boolean
  beat: number
}

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
  // how the scheduling keeps up, and playing the rounds ahead, for reading
  // from the console
  readonly stats = new SchedulerStats()
  readonly roundStats = new RoundStats()

  private readonly engine: Engine
  private readonly now: () => number
  private readonly ticker: Ticker
  // the ticker it made itself, to end when it is disposed; one handed in
  // belongs to whoever made it
  private readonly ownTicker: OwnedTicker | null
  private readonly previewer: RoundPreviewer
  private readonly lookaheadMs: number
  private readonly startDelayMs: number
  private readonly renderBudget: number
  private patch: PatchJSON
  // the patch the rounds are played ahead with: the latest edit they hear,
  // which plays them just as `patch` does (see previewsAlike)
  private roundPatch: PatchJSON
  private tempo: number
  private anchorTime = 0
  private anchorBeat = 0
  // rendered events not yet due for scheduling, in beat order
  private pending: EngineEvent[] = []
  // how far ahead the sequence has been scheduled
  private scheduledUntil = 0
  // where the last tick's render got to, if it ran out of budget short of
  // `scheduledUntil`
  private behindAt: number | null = null
  private stepMarks: StepMark[] = []
  // the last step that has sounded, for recording onto it
  private landed: StepMark | null = null
  private dotMarks: { time: number; voice: number; dot: number }[] = []
  // the rounds rendered ahead and not yet reached, and the one sounding
  private rounds: Round[] = []
  private round: Round | null = null
  private roundCount = 0
  // counts the edits the rounds hear: to the patch, and the accent amount
  private revision = 0
  // the clicked step's events not yet handed to the router, in time order;
  // the notes it has started and not yet ended; its latest sent; and how
  // far ahead it has been sent
  private previewPending: { time: number; event: EngineEvent }[] = []
  private previewSounding = new Map<string, NoteOnEvent>()
  private previewScheduled = 0
  private previewUntil = 0
  private lastScheduledTime = 0
  private sendClock = false
  // whether the envelopes whose CC drives a setting go out as well
  private sendModulationCCs = true
  private accentAmount = DEFAULT_ACCENT_AMOUNT
  // the last clock tick handed to the router, counted from the start
  private clockSent = -1
  private disposed = false

  constructor(
    patch: PatchJSON,
    private readonly router: OutputRouter,
    options: SequencerPlayerOptions = {},
  ) {
    this.patch = patch
    this.roundPatch = patch
    this.tempo = patch.tempo
    this.now = options.now ?? (() => performance.now())
    if (options.ticker === undefined) {
      this.ownTicker = createWorkerTicker(TICK_MS)
      this.ticker = this.ownTicker
    } else {
      this.ownTicker = null
      this.ticker = options.ticker
    }
    this.previewer = (options.roundPreviewer ?? createWorkerRoundPreviewer)(
      {
        next: this.nextRoundJob,
        played: this.roundPlayed,
        lost: this.roundLost,
      },
      this.roundStats,
    )
    this.lookaheadMs = options.lookaheadMs ?? LOOKAHEAD_MS
    this.startDelayMs = options.startDelayMs ?? START_DELAY_MS
    this.renderBudget = options.renderBudget ?? TICK_RENDER_BUDGET
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
      // each publishes what it changes at once, so whatever reads several
      // of them hears of them together
      play: action,
      stop: action,
      panic: action,
      tick: action,
    })
  }

  /**
   * The sequence plays every edit, but the rounds are played again only for
   * one they hear. The name, the tempo — a round's notes are measured in
   * beats — or a CC that drives nothing leave what they play as it was.
   */
  setPatch(patch: PatchJSON) {
    this.patch = patch
    this.engine.setPatch(patch)
    const heard = !previewsAlike(this.roundPatch, patch)
    this.roundStats.edited(heard)
    if (heard) {
      this.roundPatch = patch
      this.replayRounds()
    }
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
    if (patch.steps[step] === undefined || this.disposed) {
      return
    }

    this.endPreview(this.now())
    const msPerBeat = 60000 / patch.tempo
    const lengthBeats = paceBeats(stepPace(patch, step))
    // Finding the first pass over a step may take time on a dense patch.
    // Start both the sound and the playhead after that work, from one clock
    // reading, so the picture does not run ahead of the notes.
    const events = stepEvents(patch, step, {
      accentAmount: this.accentAmount,
    }).filter((event) => this.sends(event))
    const now = this.now()
    const start = now + this.router.minimumLeadMs(now)
    this.preview = {
      step,
      time: start,
      msPerBeat,
      lengthBeats,
      end: start + lengthBeats * msPerBeat,
    }
    this.previewPending = events
      .map((event) => ({ time: start + event.beat * msPerBeat, event }))
      .sort((a, b) => a.time - b.time)
    this.previewUntil = now
    this.sendPreview(now)
    if (!this.isPlaying) {
      this.ticker.start(this.tick)
    }
  }

  // Hands the clicked step's events due within the lookahead to the router.
  private sendPreview(now: number) {
    // a stall pauses it, as it does the sequence
    const overdue = now - this.previewUntil
    if (
      this.preview !== null &&
      this.previewPending.length > 0 &&
      overdue > STALL_TOLERANCE_MS
    ) {
      this.previewPending = this.previewPending.map(({ time, event }) => ({
        time: time + overdue,
        event,
      }))
      this.preview = {
        ...this.preview,
        time: this.preview.time + overdue,
        end: this.preview.end + overdue,
      }
      this.stats.stall(overdue)
    }

    const until = now + this.lookahead(now)
    let due = 0
    while (
      due < this.previewPending.length &&
      this.previewPending[due].time <= until
    ) {
      const { time: at, event } = this.previewPending[due++]
      const time = this.sendTime(at, now)
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
    this.previewUntil = until
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

  // The rounds on their way, and the one sounding, played again from where
  // each began, so what they show follows an edit made while they sound.
  private replayRounds() {
    this.revision++
    this.previewer.wake()
  }

  // The next round to play ahead for its notes, as the patch is now: the
  // one sounding, then those on their way, soonest first.
  private nextRoundJob = (): RoundJob | null => {
    const round = [this.round, ...this.rounds].find(
      (each): each is Round =>
        each !== null && each.askedRevision < this.revision,
    )
    if (round === undefined) {
      return null
    }
    round.askedRevision = this.revision
    this.roundStats.requested()
    return {
      id: round.id,
      revision: this.revision,
      from: round.from,
      patch: this.roundPatch,
      accentAmount: this.accentAmount,
    }
  }

  /**
   * A round's notes, played ahead. A round shows the latest played for it,
   * even ones played before an edit since, while its replay after that edit
   * is on its way: they are nearer the mark than what it showed before. Were
   * only the latest edit's shown, a run of edits coming quicker than a round
   * can be played would hold it at what it showed before the run for as
   * long as the run lasted. Notes for a round gone by are dropped, as are
   * any older than those a round already shows, so it never goes back.
   */
  private roundPlayed = ({ id, revision, notes }: PlayedRound) => {
    const round = this.roundWithId(id)
    if (round === undefined || revision <= round.notesRevision) {
      this.roundStats.dropped()
      return
    }
    this.roundStats.shown(revision < this.revision)
    round.notes = notes
    round.notesRevision = revision
    if (round === this.round) {
      this.roundNotes = this.notesOf(round)
    }
  }

  // A round handed out to be played that never was, its worker lost: it is
  // handed out again, as wanting the notes it has yet to have.
  private roundLost = ({ id, revision }: RoundJob) => {
    this.roundStats.lost()
    const round = this.roundWithId(id)
    if (round !== undefined && round.askedRevision === revision) {
      round.askedRevision = round.notesRevision
    }
  }

  // the round sounding or on its way with this id, or none once gone by
  private roundWithId(id: number): Round | undefined {
    return [this.round, ...this.rounds].find(
      (each): each is Round => each?.id === id,
    )
  }

  // What a round plays, once played ahead; a round Hold keeps goes on with
  // the step it was on.
  private notesOf(round: Round | null): RoundNotes | null {
    const step = round?.step ?? this.step
    return round === null || round.notes === null || step === null
      ? null
      : { step, notes: round.notes }
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
    if (amount === this.accentAmount) {
      return
    }
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

  // Allow enough lookahead for the slowest assigned output, including the
  // built-in audio device's buffering, and one worker ticker interval.
  private lookahead(now: number): number {
    return Math.max(this.lookaheadMs, this.router.minimumLeadMs(now) + TICK_MS)
  }

  play = () => {
    if (this.isPlaying || this.disposed) {
      return
    }
    const now = this.now()
    this.tempo = this.patch.tempo
    this.anchorTime =
      now + Math.max(this.startDelayMs, this.router.minimumLeadMs(now))
    this.anchorBeat = 0
    this.pending = []
    this.scheduledUntil = now
    this.behindAt = null
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
    this.stats.idle()
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
    this.stats.idle()
    const now = this.now()
    this.router.panic(now, this.horizon(now))
    this.dropPreview()
  }

  /**
   * Ends the player for good: whatever is sounding, the sequence or a
   * clicked step, is silenced on the outputs, and the ticker and worker it
   * made are ended. Playing or previewing afterwards does nothing; disposing
   * again does nothing either.
   */
  dispose = () => {
    if (this.disposed) {
      return
    }
    // the ticker only runs while one of them is sounding; the panic stops it
    if (this.isPlaying || this.preview !== null) {
      this.panic()
    }
    this.ownTicker?.dispose()
    this.previewer.dispose()
    this.disposed = true
  }

  /**
   * Schedules what falls due within the lookahead, then shows where the
   * sequence has got to. What is due goes out first: the notes of the
   * rounds it comes to are played ahead after that, being only for show.
   */
  tick = () => {
    const now = this.now()
    this.sendPreview(now)
    if (!this.isPlaying) {
      this.stats.tick(now, this.now())
      if (this.previewPending.length === 0) {
        this.ticker.stop()
        this.stats.idle()
      }
      return
    }

    this.recoverFromStall(now)
    // a tempo change keeps the current beat and bends time from here on
    if (this.patch.tempo !== this.tempo) {
      this.anchorBeat = this.beatAt(now)
      this.anchorTime = now
      this.tempo = this.patch.tempo
    }

    const lookahead = this.lookahead(now)
    const toBeat = this.beatAt(now + lookahead)
    const queued = this.rounds.length
    const rendered = this.renderRounds(toBeat, now)
    this.pending.push(...rendered.events)
    this.pending.sort((a, b) => a.beat - b.beat)
    // What the render got through goes out: the whole lookahead, or where
    // the budget ran out, the rest waiting for the ticks after. Should they
    // fall behind, the sequence pauses for them, as for a stall.
    const settled = (beat: number) =>
      rendered.done ? beat <= toBeat : beat < rendered.beat
    this.behindAt = rendered.done ? null : rendered.beat
    if (this.behindAt !== null) {
      this.stats.fellBehind()
    }
    this.emitClock(rendered.beat, now)

    let due = 0
    while (due < this.pending.length && settled(this.pending[due].beat)) {
      const event = this.pending[due++]
      const at = this.timeAt(event.beat)
      const time = Math.max(at, now)
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
        this.router.route(event, this.sendTime(at, now))
      }
      this.lastScheduledTime = Math.max(this.lastScheduledTime, time)
    }
    this.pending = this.pending.slice(due)
    this.scheduledUntil = rendered.done
      ? now + lookahead
      : this.timeAt(rendered.beat)

    if (this.rounds.length > queued) {
      this.previewer.wake()
    }

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
      this.roundNotes = this.notesOf(round)
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
    this.stats.tick(now, this.now())
  }

  /**
   * After a stall — the page held up, or put to sleep — long enough that
   * events have gone by unsent, the sequence pauses for the time lost and
   * picks up where it was, rather than rushing out all that was due at once.
   * The notes keep their rhythm and the clock its pulse, nothing is dropped,
   * and a note sounding across the stall holds on until the sequence comes
   * to its end. Rendering that ran out of budget and fell behind pauses it
   * the same, however little it fell behind by: it is sure to go on.
   */
  private recoverFromStall(now: number) {
    const overdue = now - this.scheduledUntil
    if (overdue <= (this.behindAt === null ? STALL_TOLERANCE_MS : 0)) {
      return
    }
    this.anchorBeat = this.behindAt ?? this.beatAt(this.scheduledUntil)
    this.anchorTime = now
    this.stats.stall(overdue)
  }

  /**
   * Renders on to `toBeat`, noting each round of the sequencer as it lands:
   * the step it lands on, and the engine as it was just before, to play the
   * round ahead from for its notes. As far as a tick's budget goes, so
   * catching up on a lot at once — the longest steps with every voice at the
   * fastest pace — never holds up a tick for long: what is left is picked up
   * by the ticks after, from where this one got to.
   */
  private renderRounds(toBeat: number, now: number): TickRender {
    const events: EngineEvent[] = []
    let budget = this.renderBudget
    const render = (beat: number) => {
      const rendered = this.engine.render(beat, budget)
      budget -= rendered.spent
      events.push(...rendered.events)
      return rendered
    }

    while (this.engine.isStarted && this.engine.nextStepBeat <= toBeat) {
      const beat = this.engine.nextStepBeat
      const before = render(beat - BEAT_EPSILON)
      if (!before.done) {
        return { events, done: false, beat: before.beat }
      }
      // a round is noted from just before it lands, so one there is no
      // budget left to land waits for the next tick
      if (budget <= 0) {
        return { events, done: false, beat }
      }
      const from = this.engine.snapshot()
      // the sequencer goes first on its beat, so even a landing the budget
      // cuts short has its step
      const landing = render(beat)
      const landed = landing.events.find(
        (event): event is StepAdvanceEvent => event.type === "step",
      )
      this.rounds.push({
        id: this.roundCount++,
        time: Math.max(this.timeAt(beat), now),
        step: landed?.step ?? null,
        from,
        notes: null,
        notesRevision: -1,
        askedRevision: -1,
      })
      if (!landing.done) {
        return { events, done: false, beat: landing.beat }
      }
    }
    const rest = render(toBeat)
    return { events, done: rest.done, beat: rest.beat }
  }

  // When an event due at `time` goes out: then, or at once if that has gone
  // by, which counts as late.
  private sendTime(time: number, now: number): number {
    if (time >= now) {
      return time
    }
    this.stats.lateEvent(now - time)
    return now
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
      const time = this.sendTime(this.timeAt(tick / CLOCKS_PER_BEAT), now)
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
