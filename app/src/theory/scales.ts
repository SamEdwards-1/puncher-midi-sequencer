import {
  normalizeSteps,
  noteNumberToName,
  ScaleFit,
  ScaleJSON,
} from "@midiseq/core"
import { detectKey, SCALE_DEFINITIONS, scalesContaining } from "musictheoryjs"

/** A scale to choose from, as MusicTheoryJS names and builds it. */
export interface ScaleChoice {
  name: string
  label: string
  steps: number[]
  common: boolean
}

// The twelve tonics, named as the app names notes.
export const TONICS = Array.from({ length: 12 }, (_, pitch) =>
  noteNumberToName(pitch + 60).replace(/-?\d+$/, ""),
)

// Shown first, the scales most music keeps to.
const COMMON = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "harmonicMinor",
  "melodicMinor",
  "majorPentatonic",
  "minorPentatonic",
  "minorBlues",
  "majorBlues",
]

/**
 * A name to read: the library's own where it is a plain word ("dorian"),
 * else the first of its spaced spellings ("harmonic minor", "lydian #2"),
 * else its name pulled apart at the capitals.
 */
const labelOf = (name: string, aliases: readonly string[]) =>
  /^[a-z]+$/.test(name)
    ? name
    : (aliases.find((alias) => alias.includes(" ")) ??
      name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase())

/**
 * Every scale the library knows but chromatic, which keeps nothing out: the
 * common ones first, in the order above, then the rest as it lists them.
 */
export const SCALE_CHOICES: ScaleChoice[] = SCALE_DEFINITIONS.filter(
  ({ name }) => name !== "chromatic",
)
  .map(({ name, aliases, intervals }) => ({
    name,
    label: labelOf(name, aliases),
    steps: normalizeSteps(intervals.map((interval) => interval.semitones)),
    common: COMMON.includes(name),
  }))
  .sort(
    (a, b) =>
      (a.common ? COMMON.indexOf(a.name) : COMMON.length) -
      (b.common ? COMMON.indexOf(b.name) : COMMON.length),
  )

const choiceOf = (name: string) =>
  SCALE_CHOICES.find((choice) => choice.name === name)

export const makeScale = (
  tonic: number,
  name: string,
  fit: ScaleFit = "up",
): ScaleJSON | null => {
  const choice = choiceOf(name)
  return choice === undefined
    ? null
    : { tonic, name, steps: [...choice.steps], fit }
}

/** "D dorian"; a scale from a file the library doesn't know keeps its name. */
export const scaleLabel = (scale: Pick<ScaleJSON, "tonic" | "name">) =>
  `${TONICS[scale.tonic]} ${choiceOf(scale.name)?.label ?? scale.name}`

export const sameScale = (
  a: Pick<ScaleJSON, "tonic" | "name"> | null,
  b: Pick<ScaleJSON, "tonic" | "name"> | null,
) => a?.tonic === b?.tonic && a?.name === b?.name

export interface ScaleGuess {
  tonic: number
  name: string
}

// A pitch class sounding less than this share of the whole is taken for a
// passing note, which the scale needn't hold.
const PASSING = 0.03
const GUESSES = 4

/**
 * The scales that best fit a histogram of how much each pitch class sounds,
 * best first. Those holding every pitch class that matters come first: the
 * common ones before the rest, one holding just those notes before a wider
 * one, then the tonic key-finding (Krumhansl–Schmuckler, from MusicTheoryJS)
 * thinks likeliest, then the smallest. After them, the likeliest major and
 * minor keys, which fit whatever else by moving it.
 */
export const guessScales = (weights: readonly number[]): ScaleGuess[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) {
    return []
  }
  const keys = detectKey(weights)
  const keyRank = (tonic: number, name: string) => {
    const mode = name === "major" ? "major" : name === "minor" ? "minor" : null
    const rank = keys.findIndex(
      (key) => key.tonic === tonic && (mode === null || key.mode === mode),
    )
    return rank < 0 ? keys.length : rank
  }

  const heard = TONICS.map((_, pitch) => pitch).filter(
    (pitch) => weights[pitch] / total >= PASSING,
  )
  const containing = scalesContaining(
    heard.map((pitch) => noteNumberToName(pitch + 60)),
  )
    .map((match) => ({ tonic: match.tonic.midi % 12, name: match.name }))
    .filter(({ name }) => choiceOf(name) !== undefined)
    .map((guess) => {
      const choice = choiceOf(guess.name) as ScaleChoice
      return {
        guess,
        common: choice.common ? 0 : 1,
        // holding nothing but the notes heard
        exact: choice.steps.length === heard.length ? 0 : 1,
        rank: keyRank(guess.tonic, guess.name),
        size: choice.steps.length,
      }
    })
    .sort(
      (a, b) =>
        a.common - b.common ||
        a.exact - b.exact ||
        a.rank - b.rank ||
        a.size - b.size,
    )
    .map(({ guess }) => guess)

  const byKey = keys.slice(0, GUESSES).map((key) => ({
    tonic: key.tonic,
    name: key.mode,
  }))

  const guesses: ScaleGuess[] = []
  for (const guess of [...containing, ...byKey]) {
    if (!guesses.some((each) => sameScale(each, guess))) {
      guesses.push(guess)
    }
  }
  return guesses.slice(0, GUESSES)
}

/** How much each pitch class sounds in a set of notes, one each. */
export const weightsOfNotes = (notes: Iterable<number>): number[] => {
  const weights = new Array<number>(12).fill(0)
  for (const note of notes) {
    weights[note % 12]++
  }
  return weights
}
