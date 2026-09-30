import {
  ccName,
  EnvelopeJSON,
  envelopeShape,
  gmProgramName,
  gridWidth,
  inScale,
  JumpJSON,
  JumpRule,
  loopEndIndex,
  ModulationJSON,
  ModulationTarget,
  ModulationValue,
  modulationForCC,
  modulationStops,
  modulationValueAt,
  noteNumberToName,
  PatchJSON,
  PatternCondition,
  PatternStepJSON,
  paceBeats,
  playedVelocity,
  ScaleChoiceJSON,
  StepIndex,
  stepPace,
  VoiceIndex,
  VoiceJSON,
} from "@midiseq/core"
import {
  modulationTargetLabel,
  modulationValueLabel,
} from "../components/Modulation/labels"
import { hasJump } from "../components/StepEditor/JumpPatcher"
import localization from "../localize/localization"
import type { MIDIDeviceStore } from "../stores/MIDIDeviceStore"
import { BUILTIN_OUTPUT } from "../stores/MIDIDeviceStore"
import type { SynthStore } from "../stores/SynthStore"
import {
  guessScales,
  SEQUENCER_SCALE_CHOICES,
  scaleLabel,
  weightsOfNotes,
} from "../theory/scales"
import { modulationSettingName } from "./input"

// settings are named as the app's fields name them, in its one language
const localized = localization.en

// where a setting is and what it's called: "Voice 2 · Pace"
export const modulationLabel = (target: ModulationTarget) =>
  modulationTargetLabel(target, localized)

// times such as 1/3 of a beat, to a precision that still reads
const tidy = (beats: number) => Math.round(beats * 10000) / 10000

export const jumpRuleName = (rule: JumpRule): string => {
  switch (rule.kind) {
    case "times":
      return `${rule.n}x`
    case "every":
      return `${rule.n}:${rule.n}`
    case "chance":
      return `${rule.pct}%`
    case "notLast":
      return "not last"
    default:
      return rule.kind
  }
}

const conditionName = (condition: PatternCondition) =>
  condition === "notLast" ? "not last" : condition

const describeJump = (jump: JumpJSON) => ({
  rule: jumpRuleName(jump.rule),
  destination: jump.dest === null ? null : jump.dest + 1,
  // null goes on to the next step, in the sequencer's direction
  normal: jump.normal === null ? null : jump.normal + 1,
})

const describeEnvelope = (patch: PatchJSON, envelope: EnvelopeJSON) => {
  // a CC driving a setting stands for the setting's values
  const modulation = modulationForCC(patch, envelope.cc)
  return {
    cc: envelope.cc,
    name: ccName(envelope.cc),
    channel: envelope.channel,
    shape: envelopeShape(envelope),
    ...(modulation !== undefined && {
      modulates: modulationLabel(modulation.target),
    }),
    points: envelope.points.map((point) => ({
      beat: tidy(point.time),
      value: point.value,
      ...(modulation !== undefined && {
        stands_for: modulationValueLabel(
          modulation.target,
          modulationValueAt(modulation, point.value),
          localized,
        ),
      }),
    })),
  }
}

// Anything a step holds that makes it more than an empty, normal step.
export const stepHasContent = (patch: PatchJSON, index: StepIndex): boolean => {
  const step = patch.steps[index]
  return (
    step.notes.length > 0 ||
    step.envelopes.length > 0 ||
    step.state !== "normal" ||
    hasJump(step.jump)
  )
}

export const describeStep = (patch: PatchJSON, index: StepIndex) => {
  const step = patch.steps[index]
  const { scale } = patch
  // the engine reads them lowest first, and plays no more than Step Notes
  const notes = [...step.notes].sort((a, b) => a - b)
  const unplayed = notes.slice(patch.maxNotesPerStep)
  const outside = scale === null ? [] : notes.filter((n) => !inScale(scale, n))
  const beats = paceBeats(stepPace(patch, index))
  return {
    step: index + 1,
    notes: notes.map(noteNumberToName),
    ...(unplayed.length > 0 && {
      unplayed_notes: unplayed.map(noteNumberToName),
    }),
    ...(outside.length > 0 && {
      outside_scale: outside.map(noteNumberToName),
    }),
    state: step.state,
    jump: hasJump(step.jump) ? describeJump(step.jump) : null,
    // where an envelope on the step changes the sequencer's pace
    ...(beats !== paceBeats(patch.pace) && { beats }),
    envelopes: step.envelopes.map((envelope) =>
      describeEnvelope(patch, envelope),
    ),
  }
}

// A dot's options where they aren't a plain dot's, or null for a plain dot.
const describeDot = (
  voice: VoiceJSON,
  dot: PatternStepJSON,
  accentAmount: number,
) => {
  const options = {
    ...(dot.articulation !== "none" && { articulation: dot.articulation }),
    ...(dot.accent !== "none" && { accent: dot.accent }),
    ...(dot.velocityOffset !== 0 && {
      velocity: playedVelocity(voice.velocity, accentAmount, dot),
    }),
    ...(dot.ratchet > 1 && { ratchet: dot.ratchet }),
    ...(dot.probability < 100 && { probability: dot.probability }),
    ...(dot.condition !== "always" && {
      condition: conditionName(dot.condition),
    }),
  }
  return Object.keys(options).length === 0 ? null : options
}

export const describeVoice = (
  patch: PatchJSON,
  index: VoiceIndex,
  accentAmount: number,
) => {
  const voice = patch.voices[index]
  // the dots past the pattern's length are kept, but never play
  const dots = voice.pattern.slice(0, voice.patternLength)
  return {
    voice: index + 1,
    enabled: voice.enabled,
    pace: voice.pace,
    length: Math.round(voice.length * 100),
    rule: voice.rule,
    transpose: voice.transposeAmt,
    transpose_fit: voice.transposeFit,
    velocity: voice.velocity,
    channel: voice.channel,
    instrument: gmProgramName(voice.program),
    pattern: dots.map((dot) => (dot.on ? "x" : ".")).join(""),
    dots: dots.flatMap((dot, dotIndex) => {
      const options = describeDot(voice, dot, accentAmount)
      return options === null ? [] : [{ dot: dotIndex + 1, ...options }]
    }),
  }
}

export const describeSequencer = (patch: PatchJSON) => ({
  tempo: patch.tempo,
  size: patch.size,
  // the grid is as near square as the steps allow, filled a row at a time
  columns: gridWidth(patch.size),
  pace: patch.pace,
  step_beats: paceBeats(patch.pace),
  direction: patch.direction,
  loop: patch.loop.mode,
  // the last step the loop plays, however its mode finds it
  loop_end: loopEndIndex(patch) + 1,
  sync_voices: patch.syncVoices,
  transpose: patch.transposeAmt,
  transpose_fit: patch.transposeFit,
  step_notes: patch.maxNotesPerStep,
  scale: patch.scale === null ? null : scaleLabel(patch.scale),
})

/**
 * One of a setting's values as set_modulations takes it: a pace's or a
 * rule's id, a length in percent, semitones, a fit, a pattern length, a
 * scale or "none", or whether an action is on.
 */
export const modulationValueName = (
  target: ModulationTarget,
  value: ModulationValue,
): string | number | boolean => {
  switch (target.setting) {
    case "length":
      return Math.round((value as number) * 100)
    case "scale":
      return value === null ? "none" : scaleLabel(value as ScaleChoiceJSON)
    default:
      return value as string | number | boolean
  }
}

/**
 * A setting a CC drives, named as set_modulations names it, with the CC
 * value standing for each of the values it moves through — what a step's
 * envelope sends to have the setting there — and the steps that have one.
 */
export const describeModulation = (
  patch: PatchJSON,
  modulation: ModulationJSON,
) => {
  const { target, cc } = modulation
  return {
    setting: modulationSettingName(target.setting),
    ...("voice" in target && { voice: target.voice + 1 }),
    label: modulationLabel(target),
    cc,
    from: modulationValueName(target, modulation.from),
    to: modulationValueName(target, modulation.to),
    values: modulationStops(modulation).map((stop) => ({
      value: modulationValueName(target, stop.value),
      cc: stop.cc,
    })),
    steps: patch.steps.flatMap((step, index) =>
      step.envelopes.some((envelope) => envelope.cc === cc) ? [index + 1] : [],
    ),
  }
}

/**
 * The patch as an agent reads it: numbered from 1 as the app shows it,
 * notes by name, paces and rules by the names the tools take, and only what
 * says something — a dot's options where they differ from a plain dot's, a
 * step where it holds anything.
 */
export const describePatch = (patch: PatchJSON, accentAmount: number) => {
  const shown = Array.from({ length: patch.size }, (_, index) => index)
  // steps past the size keep what they held, for when the grid grows
  const past = patch.steps
    .map((_, index) => index)
    .filter((index) => index >= patch.size && stepHasContent(patch, index))
  return {
    sequencer: describeSequencer(patch),
    detected_scales: guessScales(
      weightsOfNotes(patch.steps.flatMap((step) => step.notes)),
      SEQUENCER_SCALE_CHOICES,
    ).map(scaleLabel),
    voices: patch.voices.map((_, index) =>
      describeVoice(patch, index as VoiceIndex, accentAmount),
    ),
    steps: shown
      .filter((index) => stepHasContent(patch, index))
      .map((index) => describeStep(patch, index)),
    ...(past.length > 0 && {
      kept_past_size: past.map((index) => index + 1),
    }),
    modulations: patch.modulations.map((modulation) =>
      describeModulation(patch, modulation),
    ),
  }
}

/**
 * Why nothing would be heard, as the status beside the transport says it,
 * or null when the sequence has somewhere to play. The built-in synth also
 * waits for a click or key press on the page, which is all that lets a
 * page's audio start — an agent pressing Play isn't one.
 */
export const soundStatus = (
  midiDeviceStore: Pick<MIDIDeviceStore, "outputNames">,
  synthStore: Pick<SynthStore, "state" | "error" | "waiting">,
): string | null => {
  const { all, voices } = midiDeviceStore.outputNames
  const chosen = [...all, ...voices]
  if (chosen.every((name) => name === null)) {
    return "Nothing is routed: an output has to be ticked in Settings → MIDI to hear anything"
  }
  if (!chosen.includes(BUILTIN_OUTPUT)) {
    return null
  }
  switch (synthStore.state) {
    case "loading":
      return "The built-in synth is still starting"
    case "error":
      return `The built-in synth didn't start: ${synthStore.error}`
    default:
      return synthStore.waiting
        ? "The built-in synth starts with the first click or key press on the page, and is silent until then"
        : null
  }
}
