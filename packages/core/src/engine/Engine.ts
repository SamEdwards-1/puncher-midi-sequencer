import { envelopeShape, valueAt } from "../entities/envelope"
import { envelopeLookup } from "../entities/lookup"
import {
  modulatedAction,
  modulatedSequencer,
  modulatedVoice,
  modulationForCC,
  SequencerSettings,
  stepPace,
} from "../entities/modulation"
import { onPaceGrid, PACE_GRID, paceBeats } from "../entities/paces"
import { fitToScale, ScaleFit, ScaleJSON } from "../entities/scale"
import {
  ActionTarget,
  Direction,
  ModSource,
  PatchJSON,
  StepIndex,
  StepJSON,
  VoiceIndex,
  VoiceJSON,
} from "../entities/types"
import { DEFAULT_ACCENT_AMOUNT, playedVelocity } from "../entities/velocity"
import { initialDirectionState, nextStep } from "./direction"
import { EngineEvent } from "./events"
import { evalJumpRule } from "./jumpRules"
import { playableSteps, viewIndex } from "./loopRange"
import { scaleModValue, sequencerModValues } from "./modOuts"
import { evalCondition, evalProbability } from "./patternConditions"
import { createRng, Rng } from "./rng"
import { createRuntime, EngineRuntime, voiceIndexes } from "./runtime"
import { initialCursor, pickNote } from "./voiceRules"

export interface EngineActions {
  hold: boolean
  sync: boolean
  flip: boolean
  transpose: boolean
}

export const createActions = (): EngineActions => ({
  hold: false,
  sync: false,
  flip: false,
  transpose: false,
})

/**
 * Where an engine has got to, as plain data: everything it needs to play on
 * from there, on this thread or another. The patch and accent amount are
 * not part of it, so it can be played on with an edited one.
 */
export interface EngineSnapshot {
  runtime: EngineRuntime
  rng: number
  navigationDirection: Direction
  actions: EngineActions
  selectedVoice: VoiceIndex
}

export interface EngineOptions {
  accentAmount?: number
  // the seed goes unused where the engine plays on from a snapshot
  seed?: number
  // where to play on from, which is left as it was; a fresh engine otherwise
  from?: EngineSnapshot
}

/**
 * How much one render does at most, by default: how many of the engine's
 * pending ticks — the sequencer landing, an envelope read, a voice's dot, a
 * note ending — it plays before handing back what it has. The longest step,
 * with every voice at the fastest pace, takes a few of these.
 */
export const RENDER_BUDGET = 4096

/**
 * What a render got through. It stops short of the beat it was asked for
 * only when its budget runs out, and says so: a render on from there picks
 * up where it left off.
 */
export interface EngineRender {
  events: EngineEvent[]
  // whether it got all the way, to the beat asked for and everything on it
  done: boolean
  // everything before this beat has been rendered; once done, the beat
  // asked for, and everything on it too
  beat: number
  // how much of its budget it used
  spent: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// How often an envelope is read across its step: the finest grid every pace
// sits on, about 10 ms at 120 BPM.
export const ENVELOPE_RESOLUTION = 1 / PACE_GRID

type Candidate = {
  kind: "seq" | "env" | "voice" | "off"
  beat: number
  voice: number
}

/**
 * Turns a patch into timestamped MIDI events. Works in floating-point beats so
 * the golden-ratio paces stay exact, and keeps all of its mutable state in a
 * runtime object so a render is a pure function of (patch, runtime, rng).
 */
export class Engine {
  private runtime: EngineRuntime
  private rng: Rng
  private navigationDirection: Direction
  accentAmount: number
  actions: EngineActions = createActions()
  // the voice Sync keeps to the sequencer's pace while it is held
  selectedVoice: VoiceIndex = 0

  constructor(
    private patch: PatchJSON,
    options: EngineOptions = {},
  ) {
    this.accentAmount = options.accentAmount ?? DEFAULT_ACCENT_AMOUNT
    if (options.from === undefined) {
      this.rng = createRng(options.seed ?? 1)
      this.runtime = createRuntime(patch)
      this.navigationDirection = patch.direction
    } else {
      const from = structuredClone(options.from)
      this.rng = createRng(from.rng)
      this.runtime = from.runtime
      this.navigationDirection = from.navigationDirection
      this.actions = from.actions
      this.selectedVoice = from.selectedVoice
    }
  }

  get position(): StepIndex {
    return this.runtime.position
  }

  get isStarted(): boolean {
    return this.runtime.started
  }

  // Where the sequencer next moves: once a step has landed, where it ends.
  get nextStepBeat(): number {
    return this.runtime.nextSeqBeat
  }

  /**
   * Where this engine has got to, copied: an engine made from it plays on
   * from here, rolling the same chances, so what it renders is what this
   * one will — however this one goes on.
   */
  snapshot(): EngineSnapshot {
    return structuredClone({
      runtime: this.runtime,
      rng: this.rng.state(),
      navigationDirection: this.navigationDirection,
      actions: this.actions,
      selectedVoice: this.selectedVoice,
    })
  }

  getPatch(): PatchJSON {
    return this.patch
  }

  // Live edits land here; the runtime (position, counters, cursors) survives.
  setPatch(patch: PatchJSON) {
    this.patch = patch
  }

  setActions(actions: Partial<EngineActions>) {
    this.actions = { ...this.actions, ...actions }
  }

  queueStep(step: StepIndex | null) {
    this.runtime.queued = step
  }

  start(beat = 0) {
    this.runtime = createRuntime(this.patch)
    this.navigationDirection = this.patch.direction
    this.runtime.started = true
    this.runtime.nextSeqBeat = beat
    for (const voice of this.runtime.voices) {
      voice.nextBeat = beat
    }
    this.runtime.position = playableSteps(this.patch, this.actions.flip)[0] ?? 0
  }

  // Note offs for everything still sounding.
  stop(beat: number): EngineEvent[] {
    const events: EngineEvent[] = []
    for (const index of voiceIndexes) {
      const voice = this.runtime.voices[index]
      if (voice.activeNote !== null) {
        events.push({
          type: "noteOff",
          beat,
          voice: index,
          note: voice.activeNote.note,
          channel: voice.activeNote.channel,
        })
        voice.activeNote = null
      }
      voice.cursor = null
    }
    this.runtime.started = false
    return events
  }

  /**
   * Plays on to `toBeat`, and everything on it, as far as `budget` goes:
   * see EngineRender. A budget of 0 plays nothing, but still says whether
   * anything is left to.
   */
  render(toBeat: number, budget = RENDER_BUDGET): EngineRender {
    const events: EngineEvent[] = []
    if (!this.runtime.started) {
      return { events, done: true, beat: toBeat, spent: 0 }
    }

    for (let spent = 0; ; spent++) {
      const candidate = this.nextCandidate(toBeat)
      if (candidate === null) {
        this.skipEmptyEnvelopeSamples(toBeat)
        return { events, done: true, beat: toBeat, spent }
      }
      if (spent >= budget) {
        this.skipEmptyEnvelopeSamples(candidate.beat, false)
        return { events, done: false, beat: candidate.beat, spent }
      }
      switch (candidate.kind) {
        case "seq":
          this.tickSequencer(candidate.beat, events)
          break
        case "env":
          this.tickEnvelopes(candidate.beat, events)
          break
        case "voice":
          this.tickVoice(candidate.voice as VoiceIndex, candidate.beat, events)
          break
        case "off":
          this.releaseNote(candidate.voice as VoiceIndex, events)
          break
      }
      this.skipEmptyEnvelopeSamples(candidate.beat)
    }
  }

  // Earliest pending item at or before `toBeat`. At equal beats the sequencer
  // goes first (its CCs and sync reset precede the notes), then the step's
  // envelopes, then voice ticks, then pending note offs, so hold/tie can
  // still extend a sounding note.
  private nextCandidate(toBeat: number): Candidate | null {
    let best: Candidate | null = null
    const consider = (candidate: Candidate) => {
      if (
        candidate.beat <= toBeat &&
        (best === null || candidate.beat < best.beat)
      ) {
        best = candidate
      }
    }

    consider({ kind: "seq", beat: this.runtime.nextSeqBeat, voice: -1 })
    const envelope = this.runtime.envelope
    if (
      envelope !== null &&
      envelopeLookup(this.patch.steps[envelope.step].envelopes).hasPoints
    ) {
      consider({ kind: "env", beat: envelope.nextBeat, voice: -1 })
    }
    for (const index of voiceIndexes) {
      consider({
        kind: "voice",
        beat: this.runtime.voices[index].nextBeat,
        voice: index,
      })
    }
    for (const index of voiceIndexes) {
      const active = this.runtime.voices[index].activeNote
      if (active !== null) {
        consider({ kind: "off", beat: active.offBeat, voice: index })
      }
    }
    return best
  }

  private releaseNote(index: VoiceIndex, events: EngineEvent[]) {
    const voice = this.runtime.voices[index]
    const active = voice.activeNote
    if (active === null) {
      return
    }
    events.push({
      type: "noteOff",
      beat: active.offBeat,
      voice: index,
      note: active.note,
      channel: active.channel,
    })
    voice.activeNote = null
  }

  /**
   * An action as it is at `beat`: where the step the sequencer landed on
   * has an envelope for the action's modulation, as that has it, and
   * otherwise as its button is.
   */
  private actionAt(target: ActionTarget, beat: number): boolean {
    const envelope = this.runtime.envelope
    const held = this.actions[target.setting]
    return envelope === null
      ? held
      : (modulatedAction(
          this.patch,
          envelope.step,
          beat - envelope.startBeat,
          target,
        ) ?? held)
  }

  // Whether a voice plays at the sequencer's pace rather than its own: on a
  // step whose envelope has its Sync on, as the step landed, and otherwise
  // while Sync is held with the voice selected.
  private isSynced(voice: VoiceIndex): boolean {
    const step = this.runtime.envelope?.step
    const modulated =
      step === undefined
        ? undefined
        : modulatedAction(this.patch, step, 0, {
            kind: "action",
            setting: "sync",
            voice,
          })
    return modulated ?? (this.actions.sync && voice === this.selectedVoice)
  }

  // A synced voice plays as the sequencer ticks, whether it lands a step or
  // Hold keeps one.
  private tickSynced(beat: number) {
    this.runtime.seqBeat = beat
    for (const index of voiceIndexes) {
      if (this.isSynced(index)) {
        this.runtime.voices[index].nextBeat = beat
      }
    }
  }

  // The step the sequencer landed on, which the voices play until the next
  // lands: a Flip pressed or let go in the middle of it moves the sequencer
  // on flipped or not, as a step's envelope for it does.
  private currentStep(): StepJSON {
    const { runtime, patch } = this
    return patch.steps[
      runtime.envelope?.step ??
        viewIndex(runtime.position, patch.size, this.actions.flip)
    ]
  }

  private tickSequencer(beat: number, events: EngineEvent[]) {
    const { patch, runtime } = this

    // Hold keeps the phase moving but never advances the step, which goes on
    // as long as it lasts each time round, its envelopes starting over with
    // it. Hold and Flip are read as the step ends, so a step's envelope has
    // them as it leaves it. Held before the sequence starts, the first step
    // still lands, for Hold to keep.
    if (
      !runtime.pendingFirstStep &&
      this.actionAt({ kind: "action", setting: "hold" }, beat)
    ) {
      const held = runtime.envelope?.step
      const lengthBeats = paceBeats(
        held === undefined ? patch.pace : stepPace(patch, held),
      )
      runtime.nextSeqBeat = onPaceGrid(beat + lengthBeats)
      if (held !== undefined) {
        this.landEnvelopes(held, beat, lengthBeats, events)
      }
      this.tickSynced(beat)
      return
    }

    const flip = this.actionAt({ kind: "action", setting: "flip" }, beat)
    // Navigation reads the outgoing step's envelopes at the transition.
    // The first landing uses the saved settings, before any envelope plays.
    const navigation = this.sequencerAt(beat)
    if (navigation.direction !== this.navigationDirection) {
      runtime.directionState = initialDirectionState(navigation.direction)
      this.navigationDirection = navigation.direction
    }
    const navigationPatch = {
      ...patch,
      size: navigation.size,
      loop: { ...patch.loop, mode: navigation.loop },
    }
    const steps = playableSteps(navigationPatch, flip)
    if (steps.length === 0) {
      runtime.nextSeqBeat = onPaceGrid(beat + paceBeats(patch.pace))
      return
    }

    if (runtime.pendingFirstStep) {
      runtime.pendingFirstStep = false
      if (!steps.includes(runtime.position)) {
        runtime.position = steps[0]
      }
    } else {
      runtime.position = this.advance(steps, navigation.direction)
    }

    const position = runtime.position
    const step = viewIndex(position, navigation.size, flip)
    // as long as the sequencer's pace as it lands, which the step itself
    // may modulate
    const lengthBeats = paceBeats(stepPace(patch, step))
    runtime.nextSeqBeat = onPaceGrid(beat + lengthBeats)
    events.push({
      type: "step",
      beat,
      position,
      step,
      // Voice ticks before this beat are already rendered and the ones on it
      // come after the sequencer's, so each voice's next dot is the first it
      // plays on this step — or the first of its pattern, once sync resets it.
      // A pattern the step shortens is carried on from within it.
      voiceDots: voiceIndexes.map((index) =>
        patch.syncVoices
          ? 0
          : runtime.voices[index].patternIndex %
            modulatedVoice(patch, index, step, 0).patternLength,
      ),
    })

    this.landEnvelopes(step, beat, lengthBeats, events)
    this.emitSequencerMods(beat, position, flip, events, navigationPatch)

    if (patch.syncVoices) {
      for (const voice of runtime.voices) {
        voice.patternIndex = 0
        voice.cursor = null
        voice.nextBeat = beat
      }
    }
    this.tickSynced(beat)
  }

  private advance(steps: StepIndex[], direction: Direction): StepIndex {
    const { runtime } = this

    if (runtime.queued !== null) {
      const queued = runtime.queued
      runtime.queued = null
      return this.intoRange(queued, steps, direction)
    }

    const jump = this.currentStep().jump
    const byDirection = () => {
      const result = nextStep(
        direction,
        runtime.position,
        steps,
        runtime.directionState,
        this.rng,
      )
      runtime.directionState = result.state
      return result.step
    }

    if (jump.dest === null) {
      return jump.normal === null
        ? byDirection()
        : this.intoRange(jump.normal, steps, direction)
    }

    const visitCount = runtime.jumpCounts[runtime.position] ?? 0
    runtime.jumpCounts[runtime.position] = visitCount + 1
    const passed = evalJumpRule(
      jump.rule,
      visitCount,
      runtime.lastJumpResult,
      this.rng,
    )
    runtime.lastJumpResult = passed

    if (passed) {
      return this.intoRange(jump.dest, steps, direction)
    }
    return jump.normal === null
      ? byDirection()
      : this.intoRange(jump.normal, steps, direction)
  }

  // Jump targets may point at a skipped step or outside the loop range; from
  // there the direction rule walks back into it.
  private intoRange(
    step: StepIndex,
    steps: StepIndex[],
    direction: Direction,
  ): StepIndex {
    if (steps.includes(step)) {
      return step
    }
    const result = nextStep(
      direction,
      step,
      steps,
      this.runtime.directionState,
      this.rng,
    )
    this.runtime.directionState = result.state
    return result.step
  }

  /**
   * Starts the landed step's envelopes: each sends its opening value now,
   * in list order and ahead of the notes on this beat — rests included, as
   * a rest still lands — and then follows its curve across the step. Hold
   * starts them over each time round it keeps the step.
   */
  private landEnvelopes(
    step: StepIndex,
    beat: number,
    lengthBeats: number,
    events: EngineEvent[],
  ) {
    this.runtime.envelope = {
      step,
      startBeat: beat,
      lengthBeats,
      nextBeat: this.nextEnvelopeSample(beat, beat, lengthBeats),
      sent: {},
    }
    this.sendEnvelopes(beat, events)
  }

  private tickEnvelopes(beat: number, events: EngineEvent[]) {
    const envelope = this.runtime.envelope
    if (envelope === null) {
      return
    }
    this.sendEnvelopes(beat, events)
    envelope.nextBeat = this.nextEnvelopeSample(
      beat,
      envelope.startBeat,
      envelope.lengthBeats,
    )
  }

  // An empty step keeps its landing context for Hold/Sync and modulation,
  // but consumes no sampling candidates. Advance the dormant grid only
  // through work actually rendered, including between budget resumptions.
  // A live edit can then resume at the first unrendered sample, and snapshots
  // carry that boundary without any new runtime fields.
  private skipEmptyEnvelopeSamples(beat: number, inclusive = true) {
    const envelope = this.runtime.envelope
    if (
      envelope === null ||
      envelope.nextBeat > beat ||
      (!inclusive && envelope.nextBeat === beat) ||
      envelopeLookup(this.patch.steps[envelope.step].envelopes).hasPoints
    ) {
      return
    }
    // Render windows and note-offs need not fall on the sampling grid.
    // A complete window includes beat; an exhausted budget leaves that
    // boundary unrendered. Neither case may skip the next eligible line.
    const gridBeat = onPaceGrid(beat)
    const next =
      gridBeat > beat || (!inclusive && gridBeat === beat)
        ? gridBeat
        : onPaceGrid(gridBeat + ENVELOPE_RESOLUTION)
    envelope.nextBeat =
      next < onPaceGrid(envelope.startBeat + envelope.lengthBeats)
        ? next
        : Infinity
  }

  private nextEnvelopeSample(
    beat: number,
    startBeat: number,
    lengthBeats: number,
  ): number {
    const next = onPaceGrid(beat + ENVELOPE_RESOLUTION)
    return next < onPaceGrid(startBeat + lengthBeats) ? next : Infinity
  }

  // Reads the envelopes live, so one redrawn mid-step is heard at once. A
  // value goes out only when it changes; a step's CC is its own message on
  // its own channel, so it goes to every output rather than to a voice's.
  // One that drives a setting says so, so it can be kept in.
  private sendEnvelopes(beat: number, events: EngineEvent[]) {
    const envelope = this.runtime.envelope
    if (envelope === null) {
      return
    }
    // in beats, so a pace change shortens or lengthens what is heard of the
    // envelope rather than squeezing or stretching it
    const time = beat - envelope.startBeat
    for (const each of this.patch.steps[envelope.step].envelopes) {
      const { id, cc, channel, points } = each
      const exact = valueAt(points, time, envelopeShape(each))
      if (exact === null) {
        continue
      }
      const value = Math.round(exact)
      if (envelope.sent[id] === value) {
        continue
      }
      envelope.sent[id] = value
      events.push({
        type: "cc",
        beat,
        cc,
        value,
        channel,
        output: "all",
        source:
          modulationForCC(this.patch, cc) === undefined ? "step" : "modulation",
      })
    }
  }

  private emitMod(
    source: ModSource,
    normalized: number,
    beat: number,
    events: EngineEvent[],
  ) {
    const modOut = this.patch.modOuts.find((m) => m.source === source)
    if (modOut === undefined || !modOut.enabled) {
      return
    }
    events.push({
      type: "cc",
      beat,
      cc: modOut.cc,
      value: scaleModValue(normalized, modOut),
      channel: 1,
      output: "all",
      source: "mod",
    })
  }

  private emitSequencerMods(
    beat: number,
    position: StepIndex,
    flip: boolean,
    events: EngineEvent[],
    patch: PatchJSON,
  ) {
    const values = sequencerModValues(patch, position, flip)
    this.emitMod("seqX", values.seqX, beat, events)
    this.emitMod("seqY", values.seqY, beat, events)
    this.emitMod("phase", values.phase, beat, events)
  }

  /**
   * A voice's settings as it plays at `beat`: its own, but for any that the
   * step the sequencer landed on modulates, as the envelope has them there.
   */
  private voiceAt(index: VoiceIndex, beat: number): VoiceJSON {
    const envelope = this.runtime.envelope
    return envelope === null
      ? this.patch.voices[index]
      : modulatedVoice(
          this.patch,
          index,
          envelope.step,
          beat - envelope.startBeat,
        )
  }

  // The sequencer's settings at `beat`, as voiceAt has a voice's.
  private sequencerAt(beat: number): SequencerSettings {
    const { patch } = this
    const envelope = this.runtime.envelope
    return envelope === null
      ? { ...patch, loop: patch.loop.mode }
      : modulatedSequencer(patch, envelope.step, beat - envelope.startBeat)
  }

  private tickVoice(index: VoiceIndex, beat: number, events: EngineEvent[]) {
    const voice = this.voiceAt(index, beat)
    const runtime = this.runtime.voices[index]
    // A synced voice still counts its own pace, so it picks that up again
    // the moment Sync lets go, but plays only as the sequencer ticks, a dot
    // each time and as long as the sequencer's step.
    const own = paceBeats(voice.pace)
    runtime.nextBeat = onPaceGrid(beat + own)
    const synced = this.isSynced(index)
    if (synced && beat !== this.runtime.seqBeat) {
      return
    }
    const pace = synced ? this.runtime.nextSeqBeat - beat : own

    // a pattern shortened under the voice — edited, or modulated — carries
    // on from within it
    const patternIndex = runtime.patternIndex % voice.patternLength
    runtime.patternIndex = (patternIndex + 1) % voice.patternLength
    if (!voice.enabled) {
      return
    }
    events.push({ type: "dot", beat, voice: index, dot: patternIndex })

    const patternStep = voice.pattern[patternIndex]
    const step = this.currentStep()
    // a step keeps its notes in the order they were entered; the rules read
    // them lowest first
    const notes = [...step.notes]
      .sort((a, b) => a - b)
      .slice(0, this.sequencerAt(beat).maxNotesPerStep)
    if (!patternStep.on || step.state === "rest" || notes.length === 0) {
      return
    }

    // A hold dot plays nothing: the note before it was already scheduled to
    // sustain through this dot.
    if (patternStep.articulation === "hold") {
      return
    }

    const visitCount = runtime.conditionCounts[patternIndex]
    runtime.conditionCounts[patternIndex] = visitCount + 1
    const passed =
      evalProbability(patternStep.probability, this.rng) &&
      evalCondition(patternStep.condition, visitCount, runtime.lastCondition)
    runtime.lastCondition = passed
    if (!passed) {
      return
    }

    if (runtime.cursor === null) {
      runtime.cursor = initialCursor(voice.rule, notes.length)
    }
    const picked = pickNote(voice.rule, notes, runtime.cursor, index, this.rng)
    runtime.cursor = picked.cursor
    if (picked.note === null) {
      return
    }

    const { scale, transposeFit, transposeAmt } = this.sequencerAt(beat)
    const moved = this.transposed(
      picked.note,
      voice.transposeAmt,
      voice.transposeFit,
      scale,
    )
    const note =
      moved !== null &&
      this.actionAt({ kind: "action", setting: "transpose" }, beat)
        ? this.transposed(moved, transposeAmt, transposeFit, scale)
        : moved
    if (note === null) {
      return
    }
    const velocity = playedVelocity(
      voice.velocity,
      this.accentAmount,
      patternStep,
    )
    const hits = patternStep.ratchet
    const hitPace = pace / hits
    const holdBeats = this.holdBeatsAfter(voice, patternIndex, pace)

    for (let hit = 0; hit < hits; hit++) {
      const onBeat = beat + hit * hitPace
      const isLastHit = hit === hits - 1
      const offBeat =
        onBeat + hitPace * voice.length + (isLastHit ? holdBeats : 0)
      const tie = hit === 0 && patternStep.articulation === "tie"
      const previous = runtime.activeNote

      // Tying into the note that is already sounding just extends it
      if (
        tie &&
        previous !== null &&
        previous.note === note &&
        previous.channel === voice.channel
      ) {
        previous.offBeat = offBeat
        continue
      }

      if (previous !== null && !tie) {
        events.push({
          type: "noteOff",
          // let the note reach its gate end, unless the new note cuts it short
          beat: Math.min(previous.offBeat, onBeat),
          voice: index,
          note: previous.note,
          channel: previous.channel,
        })
        runtime.activeNote = null
      }

      events.push({
        type: "noteOn",
        beat: onBeat,
        voice: index,
        note,
        velocity,
        channel: voice.channel,
      })

      // Tie holds the old note past the new note-on so the two overlap
      if (previous !== null && tie) {
        events.push({
          type: "noteOff",
          beat: onBeat,
          voice: index,
          note: previous.note,
          channel: previous.channel,
        })
      }

      runtime.activeNote = { note, channel: voice.channel, offBeat }
    }

    this.emitMod(
      `voice${index + 1}Random` as ModSource,
      this.rng.next(),
      beat,
      events,
    )
  }

  // A note moved by its voice's transpose or by Transpose. A note that moves is
  // fitted to the scale as that move's fit says, or null where the fit
  // leaves it out; one that stays plays as written, in the scale or not.
  private transposed(
    note: number,
    semitones: number,
    fit: ScaleFit,
    scale: ScaleJSON | null,
  ): number | null {
    const moved = clamp(note + semitones, 0, 127)
    return semitones === 0 || scale === null
      ? moved
      : fitToScale(scale, moved, fit)
  }

  // Extra sustain contributed by the hold dots that follow this one.
  private holdBeatsAfter(
    voice: VoiceJSON,
    patternIndex: number,
    pace: number,
  ): number {
    let held = 0
    for (let offset = 1; offset < voice.patternLength; offset++) {
      const dot = voice.pattern[(patternIndex + offset) % voice.patternLength]
      if (dot.articulation !== "hold") {
        break
      }
      held++
    }
    return held * pace
  }
}

/**
 * Everything `engine` plays on to `toBeat`, and on it: rendered a budget at
 * a time and handed over as it comes, so however much there is, no one
 * render does more than a budget's work and nothing is left out. For work
 * that has to be whole — an export, a preview; playing live renders a
 * budget a tick instead.
 */
export function* renderThrough(
  engine: Engine,
  toBeat: number,
  budget = RENDER_BUDGET,
): Generator<EngineEvent, void, undefined> {
  for (;;) {
    const render = engine.render(toBeat, budget)
    yield* render.events
    if (render.done) {
      return
    }
    // every tick moves the engine on, so only a budget of nothing stalls
    if (render.spent === 0) {
      throw new RangeError(`A render needs a budget, not ${budget}`)
    }
  }
}
