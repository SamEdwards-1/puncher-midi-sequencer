import { envelopeShape, valueAt } from "../entities/envelope"
import { onPaceGrid, PACE_GRID, paceBeats } from "../entities/paces"
import {
  ModSource,
  PatchJSON,
  StepIndex,
  StepJSON,
  VoiceIndex,
  VoiceJSON,
} from "../entities/types"
import { DEFAULT_ACCENT_AMOUNT, playedVelocity } from "../entities/velocity"
import { nextStep } from "./direction"
import { EngineEvent } from "./events"
import { evalJumpRule } from "./jumpRules"
import { playableSteps, viewIndex } from "./loopRange"
import { scaleModValue, sequencerModValues } from "./modOuts"
import { evalCondition, evalProbability } from "./patternConditions"
import { createRng, Rng } from "./rng"
import { createRuntime, EngineRuntime, voiceIndexes } from "./runtime"
import { initialCursor, pickNote } from "./voiceRules"

export interface EngineActions {
  hang: boolean
  bump: boolean
  flip: boolean
  shift: boolean
}

export const createActions = (): EngineActions => ({
  hang: false,
  bump: false,
  flip: false,
  shift: false,
})

export interface EngineOptions {
  accentAmount?: number
  seed?: number
}

// guards against a pathological patch spinning the render loop forever
const MAX_EVENTS_PER_RENDER = 10000

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
  accentAmount: number
  actions: EngineActions = createActions()

  constructor(
    private patch: PatchJSON,
    options: EngineOptions = {},
  ) {
    this.accentAmount = options.accentAmount ?? DEFAULT_ACCENT_AMOUNT
    this.rng = createRng(options.seed ?? 1)
    this.runtime = createRuntime(patch)
  }

  get position(): StepIndex {
    return this.runtime.position
  }

  get isStarted(): boolean {
    return this.runtime.started
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

  render(toBeat: number): EngineEvent[] {
    const events: EngineEvent[] = []
    if (!this.runtime.started) {
      return events
    }

    for (let guard = 0; guard < MAX_EVENTS_PER_RENDER; guard++) {
      const candidate = this.nextCandidate(toBeat)
      if (candidate === null) {
        return events
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
    }
    return events
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
    if (this.runtime.envelope !== null) {
      consider({ kind: "env", beat: this.runtime.envelope.nextBeat, voice: -1 })
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

  private get syncVoices(): boolean {
    // Bump inverts Sync Voices while it is held
    return this.patch.syncVoices !== this.actions.bump
  }

  private currentStep(): StepJSON {
    return this.patch.steps[
      viewIndex(this.runtime.position, this.patch.size, this.actions.flip)
    ]
  }

  private tickSequencer(beat: number, events: EngineEvent[]) {
    const { patch, runtime } = this
    runtime.nextSeqBeat = onPaceGrid(beat + paceBeats(patch.pace))

    // Hang keeps the phase moving but never advances the step
    if (this.actions.hang) {
      return
    }

    const steps = playableSteps(patch, this.actions.flip)
    if (steps.length === 0) {
      return
    }

    if (runtime.pendingFirstStep) {
      runtime.pendingFirstStep = false
      if (!steps.includes(runtime.position)) {
        runtime.position = steps[0]
      }
    } else {
      runtime.position = this.advance(steps)
    }

    const position = runtime.position
    events.push({
      type: "step",
      beat,
      position,
      step: viewIndex(position, patch.size, this.actions.flip),
      // Voice ticks before this beat are already rendered and the ones on it
      // come after the sequencer's, so each voice's next dot is the first it
      // plays on this step — or the first of its pattern, once sync resets it.
      voiceDots: voiceIndexes.map((index) =>
        this.syncVoices ? 0 : runtime.voices[index].patternIndex,
      ),
    })

    this.landEnvelopes(
      viewIndex(position, patch.size, this.actions.flip),
      beat,
      events,
    )
    this.emitSequencerMods(beat, position, events)

    if (this.syncVoices) {
      for (const index of voiceIndexes) {
        const voice = runtime.voices[index]
        voice.patternIndex = 0
        voice.cursor = null
        voice.nextBeat = beat
      }
    }
  }

  private advance(steps: StepIndex[]): StepIndex {
    const { patch, runtime } = this

    if (runtime.queued !== null) {
      const queued = runtime.queued
      runtime.queued = null
      return this.intoRange(queued, steps)
    }

    const jump = this.currentStep().jump
    const byDirection = () => {
      const result = nextStep(
        patch.direction,
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
        : this.intoRange(jump.normal, steps)
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
      return this.intoRange(jump.dest, steps)
    }
    return jump.normal === null
      ? byDirection()
      : this.intoRange(jump.normal, steps)
  }

  // Jump targets may point at a skipped step or outside the loop range; from
  // there the direction rule walks back into it.
  private intoRange(step: StepIndex, steps: StepIndex[]): StepIndex {
    if (steps.includes(step)) {
      return step
    }
    const result = nextStep(
      this.patch.direction,
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
   * a rest still lands — and then follows its curve across the step.
   */
  private landEnvelopes(step: StepIndex, beat: number, events: EngineEvent[]) {
    const lengthBeats = paceBeats(this.patch.pace)
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
        source: "step",
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
    events: EngineEvent[],
  ) {
    const values = sequencerModValues(this.patch, position, this.actions.flip)
    this.emitMod("seqX", values.seqX, beat, events)
    this.emitMod("seqY", values.seqY, beat, events)
    this.emitMod("phase", values.phase, beat, events)
  }

  private tickVoice(index: VoiceIndex, beat: number, events: EngineEvent[]) {
    const voice = this.patch.voices[index]
    const runtime = this.runtime.voices[index]
    const pace = paceBeats(voice.pace)
    runtime.nextBeat = onPaceGrid(beat + pace)

    const patternIndex = runtime.patternIndex
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
      .slice(0, this.patch.maxNotesPerStep)
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

    const note = clamp(
      picked.note +
        voice.offset +
        (this.actions.shift ? this.patch.shiftAmt : 0),
      0,
      127,
    )
    const velocity = playedVelocity(
      voice.velocity,
      this.accentAmount,
      patternStep,
    )
    const hits = patternStep.ratchet
    const hitPace = pace / hits
    const holdBeats = this.holdBeatsAfter(voice, patternIndex)

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

  // Extra sustain contributed by the hold dots that follow this one.
  private holdBeatsAfter(voice: VoiceJSON, patternIndex: number): number {
    const pace = paceBeats(voice.pace)
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
