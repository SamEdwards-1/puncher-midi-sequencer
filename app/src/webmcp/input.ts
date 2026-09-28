import {
  Accent,
  Articulation,
  Direction,
  EnvelopeShape,
  GM_PROGRAMS,
  JumpRule,
  LoopMode,
  noteNameToNumber,
  PACE_LABELS,
  PACES,
  PaceId,
  PatchJSON,
  PatternCondition,
  Probability,
  Ratchet,
  SCALE_FITS,
  ScaleFit,
  ScaleJSON,
  StepIndex,
  StepState,
  VOICE_RULES,
  VoiceIndex,
  VoiceRule,
} from "@midiseq/core"
import { RULE_LABELS } from "../components/Modulation/labels"
import { makeScale, SEQUENCER_SCALE_CHOICES, TONICS } from "../theory/scales"

/**
 * Reading what an agent sends. The browser checks none of it against the
 * tools' schemas, so everything is checked here, and anything that can't be
 * used is refused whole, saying why, so the agent can put it right and try
 * again. The forms the app shows are taken as well as the ones it stores:
 * "16th T" as well as "16thT", "Up / Down" as well as "updown", a note by
 * name or by number.
 */
export class InputError extends Error {}

// A value as the agent sent it, short enough to quote.
const show = (value: unknown): string => {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 40 ? `${text.slice(0, 37)}...` : text
}

/**
 * An object with only the fields a tool knows: a field it doesn't would be
 * a mistake — "note" for "notes" — that would otherwise do nothing, silently.
 */
export const readFields = (
  value: unknown,
  where: string,
  fields: readonly string[],
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputError(`${where} must be an object, not ${show(value)}`)
  }
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) {
      throw new InputError(
        `${where} has no field "${field}"; it takes ${fields.length === 0 ? "none" : fields.join(", ")}`,
      )
    }
  }
  return value as Record<string, unknown>
}

export const readList = (value: unknown, what: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new InputError(`${what} must be a list, not ${show(value)}`)
  }
  return value
}

// Numbers may come as text: "5" is as clear as 5.
export const readNumber = (
  value: unknown,
  what: string,
  min: number,
  max: number,
  whole = true,
): number => {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value
  if (
    typeof number !== "number" ||
    !Number.isFinite(number) ||
    (whole && !Number.isInteger(number)) ||
    number < min ||
    number > max
  ) {
    throw new InputError(
      `${what} must be ${whole ? "a whole number" : "a number"} from ${min} to ${max}, not ${show(value)}`,
    )
  }
  return number
}

export const readBoolean = (value: unknown, what: string): boolean => {
  if (typeof value === "boolean") {
    return value
  }
  if (value === "true" || value === "false") {
    return value === "true"
  }
  throw new InputError(`${what} must be true or false, not ${show(value)}`)
}

export const readText = (value: unknown, what: string, max: number): string => {
  if (typeof value !== "string" || value.length > max) {
    throw new InputError(
      `${what} must be text of at most ${max} characters, not ${show(value)}`,
    )
  }
  return value
}

/** One of a closed set of values, and the names each goes by. */
interface Choice<T> {
  value: T
  // the first is the one the schema offers
  names: readonly string[]
}

// Case and spacing don't matter: "Up / Down +", "up/down+" and "updown+"
// are one rule.
const choiceKey = (text: string) => text.toLowerCase().replace(/[\s/_]+/g, "")

const readChoice = <T>(
  value: unknown,
  what: string,
  choices: readonly Choice<T>[],
): T => {
  const key = typeof value === "string" ? choiceKey(value) : null
  const found = choices.find(({ names }) =>
    names.some((name) => choiceKey(name) === key),
  )
  if (found === undefined) {
    throw new InputError(
      `${what} can't be ${show(value)}; it is one of ${choices
        .map(({ names }) => names[0])
        .join(", ")}`,
    )
  }
  return found.value
}

// The names a schema offers for a set of choices.
const namesOf = <T>(choices: readonly Choice<T>[]) =>
  choices.map(({ names }) => names[0])

const PACE_CHOICES: Choice<PaceId>[] = PACES.map((pace) => ({
  value: pace,
  names: [pace, PACE_LABELS[pace]],
}))

export const PACE_NAMES = namesOf(PACE_CHOICES)

export const readPace = (value: unknown, what = "pace") =>
  readChoice(value, what, PACE_CHOICES)

const RULE_CHOICES: Choice<VoiceRule>[] = VOICE_RULES.map((rule) => ({
  value: rule,
  names: [rule, RULE_LABELS[rule]],
}))

export const RULE_NAMES = namesOf(RULE_CHOICES)

export const readRule = (value: unknown, what = "rule") =>
  readChoice(value, what, RULE_CHOICES)

const DIRECTION_CHOICES: Choice<Direction>[] = [
  { value: "fwd", names: ["fwd", "forwards", "forward"] },
  { value: "bwd", names: ["bwd", "backwards", "backward"] },
  { value: "fwdbwd", names: ["fwdbwd", "Fwd / Bwd"] },
  { value: "bwdfwd", names: ["bwdfwd", "Bwd / Fwd"] },
  { value: "random", names: ["random"] },
  { value: "random+", names: ["random+"] },
]

export const DIRECTION_NAMES = namesOf(DIRECTION_CHOICES)

export const readDirection = (value: unknown, what = "direction") =>
  readChoice(value, what, DIRECTION_CHOICES)

const plain = <T extends string>(values: readonly T[]): Choice<T>[] =>
  values.map((value) => ({ value, names: [value] }))

export const LOOP_NAMES: LoopMode[] = ["recorded", "all", "custom"]

export const readLoopMode = (value: unknown, what = "loop") =>
  readChoice(value, what, plain(LOOP_NAMES))

export const FIT_NAMES: readonly ScaleFit[] = SCALE_FITS

export const readFit = (value: unknown, what: string) =>
  readChoice(value, what, plain(FIT_NAMES))

export const STATE_NAMES: StepState[] = ["normal", "rest", "skip"]

export const readStepState = (value: unknown, what = "state") =>
  readChoice(value, what, plain(STATE_NAMES))

export const SHAPE_NAMES: EnvelopeShape[] = ["steps", "ramps"]

export const readShape = (value: unknown, what = "shape") =>
  readChoice(value, what, plain(SHAPE_NAMES))

export const ARTICULATION_NAMES: Articulation[] = ["none", "hold", "tie"]

export const readArticulation = (value: unknown, what = "articulation") =>
  readChoice(value, what, plain(ARTICULATION_NAMES))

export const ACCENT_NAMES: Accent[] = ["none", "+", "-"]

export const readAccent = (value: unknown, what = "accent") =>
  readChoice(value, what, plain(ACCENT_NAMES))

const CONDITION_CHOICES: Choice<PatternCondition>[] = [
  ...plain(["always", "2:2", "3:3", "4:4", "1x", "2x", "3x", "last"] as const),
  { value: "notLast", names: ["not last", "notLast"] },
]

export const CONDITION_NAMES = namesOf(CONDITION_CHOICES)

export const readCondition = (value: unknown, what = "condition") =>
  readChoice(value, what, CONDITION_CHOICES)

export const PROBABILITIES: Probability[] = [100, 90, 75, 67, 50, 33, 25, 10]

export const readProbability = (value: unknown, what = "probability") => {
  const number =
    typeof value === "string" ? Number(value.replace(/%\s*$/, "")) : value
  const found = PROBABILITIES.find((probability) => probability === number)
  if (found === undefined) {
    throw new InputError(
      `${what} can't be ${show(value)}; it is one of ${PROBABILITIES.join(", ")}`,
    )
  }
  return found
}

export const readRatchet = (value: unknown, what = "ratchet") =>
  readNumber(value, what, 1, 4) as Ratchet

/** A step as the grid numbers it, from 1, as its index from 0. */
export const readStep = (
  value: unknown,
  patch: PatchJSON,
  what = "step",
): StepIndex => readNumber(value, what, 1, patch.size) - 1

/** A voice as the app numbers it, 1 to 4, as its index. */
export const readVoice = (value: unknown, what = "voice") =>
  (readNumber(value, what, 1, 4) - 1) as VoiceIndex

/**
 * A note by name — scientific pitch, where C4 is middle C, with sharps or
 * flats — or by its MIDI number.
 */
export const readNote = (value: unknown, what = "note"): number => {
  if (typeof value === "number" || /^\s*\d+\s*$/.test(String(value))) {
    return readNumber(value, what, 0, 127)
  }
  const note =
    typeof value === "string"
      ? noteNameToNumber(value.replace(/♯/g, "#").replace(/♭/g, "b"))
      : null
  if (note === null) {
    throw new InputError(
      `${what} ${show(value)} isn't a note: name one as C4 or F#3 (C4 is middle C), or give its MIDI number, 0 to 127`,
    )
  }
  return note
}

/** A step's notes, each once, as a list or as "C4 E4 G4". */
export const readNotes = (value: unknown, what = "notes"): number[] => {
  const list =
    typeof value === "string"
      ? value.split(/[\s,]+/).filter((note) => note !== "")
      : readList(value, what)
  return [
    ...new Set(list.map((note, index) => readNote(note, `${what}[${index}]`))),
  ]
}

/**
 * Jump rules as the step editor lists them: always; 1x to 7x, which jump
 * that many times and then fall through once; 2:2 to 8:8, which jump on the
 * last of every so many visits; a chance; or whether the last jump taken
 * anywhere was.
 */
export const JUMP_RULE_NAMES = [
  "always",
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `${n}x`),
  ...[2, 3, 4, 5, 6, 7, 8].map((n) => `${n}:${n}`),
  ...[10, 25, 33, 50, 67, 75, 90].map((pct) => `${pct}%`),
  "last",
  "not last",
]

export const readJumpRule = (value: unknown, what = "rule"): JumpRule => {
  const key = typeof value === "string" ? choiceKey(value) : ""
  const times = /^([1-7])x$/.exec(key)
  const every = /^([2-8]):\1$/.exec(key)
  const chance = /^(10|25|33|50|67|75|90)%$/.exec(key)
  if (key === "always") {
    return { kind: "always" }
  }
  if (key === "last") {
    return { kind: "last" }
  }
  if (key === "notlast") {
    return { kind: "notLast" }
  }
  if (times !== null) {
    return { kind: "times", n: Number(times[1]) as 1 }
  }
  if (every !== null) {
    return { kind: "every", n: Number(every[1]) as 2 }
  }
  if (chance !== null) {
    return { kind: "chance", pct: Number(chance[1]) as Probability }
  }
  throw new InputError(
    `${what} can't be ${show(value)}; it is one of ${JUMP_RULE_NAMES.join(", ")}`,
  )
}

// A tonic as a note name without its octave, sharp or flat: "F#", "Bb".
const readTonic = (text: string): number | null => {
  const note = noteNameToNumber(`${text}4`)
  return note === null ? null : note % 12
}

const scaleKey = (text: string) => text.toLowerCase().replace(/[\s_]+/g, "")

/**
 * The scales the sequencer's Scale field offers, by the name the app shows
 * or the one it stores: "harmonic minor" or "harmonicMinor".
 */
export const SCALE_NAMES = SEQUENCER_SCALE_CHOICES.map(({ label }) => label)

/**
 * A scale as "A minor" or "F# minor pentatonic", or "none". Its fit, which
 * only decides what becomes of notes recorded or imported outside it, stays
 * as the patch's was.
 */
export const readScale = (
  value: unknown,
  fit: ScaleFit,
  what = "scale",
): ScaleJSON | null => {
  if (typeof value === "string" && /^\s*none\s*$/i.test(value)) {
    return null
  }
  const match =
    typeof value === "string" ? /^\s*(\S+)\s+(.+?)\s*$/.exec(value) : null
  const tonic = match === null ? null : readTonic(match[1])
  const choice =
    match === null
      ? undefined
      : SEQUENCER_SCALE_CHOICES.find(
          ({ name, label }) =>
            scaleKey(name) === scaleKey(match[2]) ||
            scaleKey(label) === scaleKey(match[2]),
        )
  if (tonic === null || choice === undefined) {
    throw new InputError(
      `${what} can't be ${show(value)}; give a tonic (${TONICS.join(", ")}) and one of ${SCALE_NAMES.join(", ")} — "A minor", say — or "none"`,
    )
  }
  return makeScale(tonic, choice.name, fit)
}

/**
 * A General MIDI instrument by name, or by its number from 1 to 128 as GM
 * numbers them. A name needn't be whole where only one instrument has it:
 * "vibraphone" is enough, "piano" isn't.
 */
export const readInstrument = (value: unknown, what = "instrument"): number => {
  if (typeof value === "number" || /^\s*\d+\s*$/.test(String(value))) {
    return readNumber(value, what, 1, 128) - 1
  }
  const text = typeof value === "string" ? value.trim().toLowerCase() : ""
  const exact = GM_PROGRAMS.findIndex((name) => name.toLowerCase() === text)
  if (exact !== -1) {
    return exact
  }
  const partial = GM_PROGRAMS.flatMap((name, program) =>
    text !== "" && name.toLowerCase().includes(text) ? [program] : [],
  )
  if (partial.length === 1) {
    return partial[0]
  }
  throw new InputError(
    partial.length > 1
      ? `${what} ${show(value)} could be ${partial
          .slice(0, 8)
          .map((program) => GM_PROGRAMS[program])
          .join(", ")}${partial.length > 8 ? " and more" : ""}; name one`
      : `${what} ${show(value)} isn't a General MIDI instrument; name one, "Electric Bass (finger)" say, or give its number from 1 to 128`,
  )
}

/**
 * A rhythm as a string, a character a dot: x (or X, o, 1, *) plays, . (or
 * -, _, 0) rests. Spaces and bars only make it easier to read, so
 * "x... x..x" is eight dots.
 */
export const readPattern = (value: unknown, what = "pattern"): boolean[] => {
  const text = typeof value === "string" ? value.replace(/[\s|]+/g, "") : null
  if (text === null || !/^[xXoO1*.\-_0]{1,16}$/.test(text)) {
    throw new InputError(
      `${what} must be 1 to 16 dots, each x to play or . to rest — "x..x..x." — not ${show(value)}`,
    )
  }
  return [...text].map((dot) => /[xXoO1*]/.test(dot))
}
