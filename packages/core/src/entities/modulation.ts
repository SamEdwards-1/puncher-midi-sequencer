import { UNDEFINED_CCS } from "../midi/ccNames"
import { envelopeShape, valueAt } from "./envelope"
import { PACES, PaceId } from "./paces"
import { SCALE_FITS, ScaleFit, ScaleJSON } from "./scale"
import {
  ActionTarget,
  Direction,
  LoopMode,
  MAX_STEPS,
  NOTES_PER_STEP,
  MAX_PATTERN_LENGTH,
  ModulationJSON,
  ModulationTarget,
  ModulationValue,
  PatchJSON,
  ScaleChoiceJSON,
  StepIndex,
  StepJSON,
  VoiceIndex,
  VoiceJSON,
  VoiceRule,
} from "./types"

/** The rules in the order the Rule field lists them. */
export const VOICE_RULES: VoiceRule[] = [
  "nth",
  "lowest",
  "highest",
  "random",
  "up",
  "down",
  "updown",
  "downup",
  "updown+",
  "downup+",
  "rise",
  "fall",
]

/**
 * The scales the sequencer's Scale field offers, and their steps. A
 * modulation reaches each of them at every tonic, and none: all of that has
 * to fit in a CC's 128 values, so there are ten.
 */
export const SEQUENCER_SCALES: { name: string; steps: number[] }[] = [
  { name: "major", steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: "minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: "dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: "phrygian", steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: "lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: "mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: "harmonicMinor", steps: [0, 2, 3, 5, 7, 8, 11] },
  { name: "majorPentatonic", steps: [0, 2, 4, 7, 9] },
  { name: "minorPentatonic", steps: [0, 3, 5, 7, 10] },
  { name: "minorBlues", steps: [0, 3, 5, 6, 7, 10] },
]

/** A scale of SEQUENCER_SCALES at a tonic; null for a name it hasn't. */
export const sequencerScale = (
  { tonic, name }: ScaleChoiceJSON,
  fit: ScaleFit,
): ScaleJSON | null => {
  const scale = SEQUENCER_SCALES.find((each) => each.name === name)
  return scale === undefined
    ? null
    : { tonic, name, steps: [...scale.steps], fit }
}

// what each field can be set to, in the order it lists them
const LENGTHS = Array.from({ length: 19 }, (_, index) => (10 + index * 5) / 100)
const OFFSETS = Array.from({ length: 49 }, (_, index) => index - 24)
const SIZES = Array.from({ length: MAX_STEPS }, (_, index) => index + 1)
const NOTE_COUNTS = Array.from(
  { length: NOTES_PER_STEP },
  (_, index) => index + 1,
)
const DIRECTIONS: Direction[] = [
  "fwd",
  "bwd",
  "fwdbwd",
  "bwdfwd",
  "random",
  "random+",
]
const LOOP_MODES: LoopMode[] = ["recorded", "all", "custom"]
const PATTERN_LENGTHS = Array.from(
  { length: MAX_PATTERN_LENGTH },
  (_, index) => index + 1,
)
// an action is off or on
const ACTION_STATES = [false, true]
// none, then every scale at C, then at C#, and so on
const SCALES: (ScaleChoiceJSON | null)[] = [
  null,
  ...Array.from({ length: 12 }, (_, tonic) =>
    SEQUENCER_SCALES.map(({ name }) => ({ tonic, name })),
  ).flat(),
]

/**
 * Every value a setting can take, in the order its field lists them — a
 * modulation's range is a run of these. No setting has more than a CC has
 * values, so each can be reached.
 */
export const modulationChoices = (
  target: ModulationTarget,
): readonly ModulationValue[] => {
  switch (target.setting) {
    case "pace":
      return PACES
    case "length":
      return LENGTHS
    case "rule":
      return VOICE_RULES
    case "offset":
    case "shiftAmt":
      return OFFSETS
    case "size":
      return SIZES
    case "maxNotesPerStep":
      return NOTE_COUNTS
    case "direction":
      return DIRECTIONS
    case "loop":
      return LOOP_MODES
    case "offsetFit":
    case "shiftFit":
      return SCALE_FITS
    case "patternLength":
      return PATTERN_LENGTHS
    case "scale":
      return SCALES
    case "hold":
    case "sync":
    case "flip":
    case "shift":
      return ACTION_STATES
  }
}

const keyOf = (value: ModulationValue): string =>
  value === null
    ? "none"
    : typeof value === "object"
      ? `${value.tonic} ${value.name}`
      : String(value)

/** Whether two of a setting's values are the same one. */
export const sameModulationValue = (
  a: ModulationValue,
  b: ModulationValue,
): boolean => keyOf(a) === keyOf(b)

/**
 * Where `value` is among `choices`: exactly, or for a number, whichever is
 * nearest it. -1 for a value that isn't there.
 */
export const choiceIndex = (
  choices: readonly ModulationValue[],
  value: ModulationValue,
): number => {
  const key = keyOf(value)
  const exact = choices.findIndex((choice) => keyOf(choice) === key)
  if (exact !== -1 || typeof value !== "number") {
    return exact
  }
  return choices.reduce<number>(
    (nearest, choice, index) =>
      typeof choice === "number" &&
      (nearest === -1 ||
        Math.abs(choice - value) <
          Math.abs((choices[nearest] as number) - value))
        ? index
        : nearest,
    -1,
  )
}

// A modulation's ends as indexes into its setting's choices, kept for as
// long as the modulation is: the engine reads them at every note. An end
// the setting hasn't stands for its first or last value.
const ends = new WeakMap<ModulationJSON, [number, number]>()

const rangeEnds = (modulation: ModulationJSON): [number, number] => {
  const known = ends.get(modulation)
  if (known !== undefined) {
    return known
  }
  const choices = modulationChoices(modulation.target)
  const from = choiceIndex(choices, modulation.from)
  const to = choiceIndex(choices, modulation.to)
  const found: [number, number] = [
    from === -1 ? 0 : from,
    to === -1 ? choices.length - 1 : to,
  ]
  ends.set(modulation, found)
  return found
}

/** How many of its setting's values a modulation moves through. */
export const modulationCount = (modulation: ModulationJSON): number => {
  const [from, to] = rangeEnds(modulation)
  return Math.abs(to - from) + 1
}

/**
 * The values a modulation moves through, from the one its CC's 0 stands
 * for to its 127's.
 */
export const modulationRange = (
  modulation: ModulationJSON,
): ModulationValue[] => {
  const choices = modulationChoices(modulation.target)
  const [from, to] = rangeEnds(modulation)
  const direction = to >= from ? 1 : -1
  return Array.from(
    { length: modulationCount(modulation) },
    (_, index) => choices[from + index * direction],
  )
}

const clampCC = (value: number) => Math.min(127, Math.max(0, value))

// Which of `count` values a CC value stands for. They are spread evenly, the
// first at 0 and the last at 127, and a CC value between two goes to the
// nearer.
const placeOf = (cc: number, count: number) =>
  count <= 1 ? 0 : Math.round((clampCC(cc) / 127) * (count - 1))

const ccOfPlace = (place: number, count: number) =>
  count <= 1 ? 0 : Math.round((place * 127) / (count - 1))

/** The setting's value that a CC value stands for. */
export const modulationValueAt = (
  modulation: ModulationJSON,
  cc: number,
): ModulationValue => {
  const [from, to] = rangeEnds(modulation)
  const place = placeOf(cc, modulationCount(modulation))
  return modulationChoices(modulation.target)[
    from + (to >= from ? place : -place)
  ]
}

/**
 * The CC value that stands for one of the setting's values. One outside the
 * modulation's range stands for the nearer end of it.
 */
export const modulationCC = (
  modulation: ModulationJSON,
  value: ModulationValue,
): number => {
  const [from, to] = rangeEnds(modulation)
  const at = choiceIndex(modulationChoices(modulation.target), value)
  const low = Math.min(from, to)
  const high = Math.max(from, to)
  const within = at === -1 ? from : Math.min(high, Math.max(low, at))
  return ccOfPlace(Math.abs(within - from), modulationCount(modulation))
}

/** A CC value moved to the nearest that stands for a value exactly. */
export const snapToModulation = (
  modulation: ModulationJSON,
  cc: number,
): number => {
  const count = modulationCount(modulation)
  return ccOfPlace(placeOf(cc, count), count)
}

/** Each value a modulation moves through, and the CC value standing for it. */
export const modulationStops = (
  modulation: ModulationJSON,
): { value: ModulationValue; cc: number }[] => {
  const range = modulationRange(modulation)
  return range.map((value, place) => ({
    value,
    cc: ccOfPlace(place, range.length),
  }))
}

// the voice a target belongs to, if it belongs to one
const voiceOf = (target: ModulationTarget) =>
  "voice" in target ? target.voice : null

export const sameTarget = (a: ModulationTarget, b: ModulationTarget) =>
  a.kind === b.kind && a.setting === b.setting && voiceOf(a) === voiceOf(b)

/** The modulation a setting has, if any. */
export const modulationOf = (
  patch: PatchJSON,
  target: ModulationTarget,
): ModulationJSON | undefined =>
  patch.modulations.find((modulation) => sameTarget(modulation.target, target))

/** The modulation a CC drives, if any. */
export const modulationForCC = (
  patch: PatchJSON,
  cc: number,
): ModulationJSON | undefined =>
  patch.modulations.find((modulation) => modulation.cc === cc)

/**
 * The value a setting has of its own, which a step without its CC plays.
 * An action has none in the patch: its button has it, off until pressed.
 */
export const settingValue = (
  patch: PatchJSON,
  target: ModulationTarget,
): ModulationValue => {
  if (target.kind === "action") {
    return false
  }
  if (target.kind === "voice") {
    return patch.voices[target.voice][target.setting]
  }
  switch (target.setting) {
    case "size":
    case "direction":
    case "shiftAmt":
    case "maxNotesPerStep":
      return patch[target.setting]
    case "loop":
      return patch.loop.mode
    case "pace":
      return patch.pace
    case "shiftFit":
      return patch.shiftFit
    case "scale":
      return patch.scale === null
        ? null
        : { tonic: patch.scale.tonic, name: patch.scale.name }
  }
}

/**
 * A modulation of a setting as it starts: across all of the setting's
 * values, or for a scale, the ten at its tonic. With no scale, that is
 * none and C's ten, which lie together, so the range holds the setting's
 * own value as the others' do.
 */
export const defaultModulation = (
  patch: PatchJSON,
  target: ModulationTarget,
  cc: number,
): ModulationJSON => {
  if (target.setting === "scale") {
    const tonic = patch.scale?.tonic ?? 0
    const first = SEQUENCER_SCALES[0]
    const last = SEQUENCER_SCALES[SEQUENCER_SCALES.length - 1]
    return {
      target,
      cc,
      from: patch.scale === null ? null : { tonic, name: first.name },
      to: { tonic, name: last.name },
    }
  }
  const choices = modulationChoices(target)
  return { target, cc, from: choices[0], to: choices[choices.length - 1] }
}

/**
 * Whether a patch plays without a scale throughout: it has none of its own,
 * and no step can move it to one.
 */
export const scaleless = (patch: PatchJSON): boolean =>
  patch.scale === null &&
  modulationOf(patch, { kind: "sequencer", setting: "scale" }) === undefined

/** Whether a modulation's range holds one of its setting's values. */
export const inModulationRange = (
  modulation: ModulationJSON,
  value: ModulationValue,
): boolean => {
  const [from, to] = rangeEnds(modulation)
  const at = choiceIndex(modulationChoices(modulation.target), value)
  return at >= Math.min(from, to) && at <= Math.max(from, to)
}

/**
 * The CC a new modulation is offered: the first undefined controller that
 * nothing in the patch uses yet — no modulation, no step's envelope and no
 * mod output that is on. Failing that, the first no other modulation has.
 */
export const nextModulationCC = (patch: PatchJSON): number => {
  const modulated = new Set(patch.modulations.map(({ cc }) => cc))
  const used = new Set([
    ...modulated,
    ...patch.steps.flatMap((step) => step.envelopes.map(({ cc }) => cc)),
    ...patch.modOuts.filter(({ enabled }) => enabled).map(({ cc }) => cc),
  ])
  return (
    UNDEFINED_CCS.find((cc) => !used.has(cc)) ??
    UNDEFINED_CCS.find((cc) => !modulated.has(cc)) ??
    UNDEFINED_CCS[0]
  )
}

// What a step's envelope for `cc` sends `time` beats in, or null where the
// step has none. The first envelope for it counts, whatever its channel.
const envelopeCC = (
  step: StepJSON,
  cc: number,
  time: number,
): number | null => {
  const envelope = step.envelopes.find((each) => each.cc === cc)
  const exact =
    envelope === undefined
      ? null
      : valueAt(envelope.points, time, envelopeShape(envelope))
  return exact === null ? null : Math.round(exact)
}

/**
 * A voice's settings `time` beats into `step`: its own, but for any a
 * modulation drives there — where the step has an envelope for its CC, the
 * value that stands for.
 */
export const modulatedVoice = (
  patch: PatchJSON,
  voice: VoiceIndex,
  step: StepIndex,
  time: number,
): VoiceJSON => {
  let settings = patch.voices[voice]
  for (const modulation of patch.modulations) {
    const { target } = modulation
    if (target.kind !== "voice" || target.voice !== voice) {
      continue
    }
    const cc = envelopeCC(patch.steps[step], modulation.cc, time)
    if (cc !== null) {
      settings = {
        ...settings,
        [target.setting]: modulationValueAt(modulation, cc),
      }
    }
  }
  return settings
}

/** The sequencer's settings that can be modulated. */
export interface SequencerSettings {
  size: number
  direction: Direction
  loop: LoopMode
  shiftAmt: number
  maxNotesPerStep: number
  pace: PaceId
  scale: ScaleJSON | null
  shiftFit: ScaleFit
}

/**
 * The sequencer's settings `time` beats into `step`, as modulatedVoice has
 * a voice's. A scale a modulation moves to fits imports and recordings as
 * the patch's own scale does.
 */
export const modulatedSequencer = (
  patch: PatchJSON,
  step: StepIndex,
  time: number,
): SequencerSettings => {
  const settings: SequencerSettings = {
    size: patch.size,
    direction: patch.direction,
    loop: patch.loop.mode,
    shiftAmt: patch.shiftAmt,
    maxNotesPerStep: patch.maxNotesPerStep,
    pace: patch.pace,
    scale: patch.scale,
    shiftFit: patch.shiftFit,
  }
  for (const modulation of patch.modulations) {
    const { target } = modulation
    if (target.kind !== "sequencer") {
      continue
    }
    const cc = envelopeCC(patch.steps[step], modulation.cc, time)
    if (cc === null) {
      continue
    }
    const value = modulationValueAt(modulation, cc)
    if (target.setting === "scale") {
      settings.scale =
        value === null
          ? null
          : sequencerScale(value as ScaleChoiceJSON, patch.scale?.fit ?? "up")
    } else if (target.setting === "pace") {
      settings.pace = value as PaceId
    } else if (target.setting === "shiftFit") {
      settings.shiftFit = value as ScaleFit
    } else if (target.setting === "direction") {
      settings.direction = value as Direction
    } else if (target.setting === "loop") {
      settings.loop = value as LoopMode
    } else {
      settings[target.setting] = value as number
    }
  }
  return settings
}

/**
 * Whether a step has an action on, `time` beats in: where it has an
 * envelope for the action's CC, as that has it; elsewhere undefined, and
 * the action is as its button is.
 */
export const modulatedAction = (
  patch: PatchJSON,
  step: StepIndex,
  time: number,
  target: ActionTarget,
): boolean | undefined => {
  const modulation = modulationOf(patch, target)
  const cc =
    modulation === undefined
      ? null
      : envelopeCC(patch.steps[step], modulation.cc, time)
  return modulation === undefined || cc === null
    ? undefined
    : (modulationValueAt(modulation, cc) as boolean)
}

/**
 * How long a step lasts: the sequencer's pace as the step lands, where a
 * modulation's envelope on it may have changed it.
 */
export const stepPace = (patch: PatchJSON, step: StepIndex): PaceId =>
  modulatedSequencer(patch, step, 0).pace

/** A setting a step's envelope drives, as it has it at one moment. */
export interface ModulatedSetting {
  target: ModulationTarget
  // the CC and the value its envelope sends there
  cc: number
  ccValue: number
  // the setting's value that stands for
  value: ModulationValue
}

/**
 * Every setting `step` modulates, `time` beats in, and what it has them at:
 * those with an envelope for their CC on the step. The sequencer's pace and
 * a voice's Sync are as the step landed, since that is the only time they
 * are read.
 */
export const modulatedSettings = (
  patch: PatchJSON,
  step: StepIndex,
  time: number,
): ModulatedSetting[] =>
  patch.modulations.flatMap((modulation) => {
    const { target, cc } = modulation
    const landed =
      (target.kind === "sequencer" && target.setting === "pace") ||
      target.setting === "sync"
    const ccValue = envelopeCC(patch.steps[step], cc, landed ? 0 : time)
    return ccValue === null
      ? []
      : [
          {
            target,
            cc,
            ccValue,
            value: modulationValueAt(modulation, ccValue),
          },
        ]
  })
