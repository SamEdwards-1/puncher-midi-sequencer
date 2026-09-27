import { MAX_NOTE_NUMBER, MIN_NOTE_NUMBER } from "./noteName"

/**
 * A patch's scale: its tonic as a pitch class, 0 for C to 11 for B; its
 * name, as the app's scale library knows it; its steps, the semitones above
 * the tonic of each degree, from 0; and how notes outside it are fitted as
 * they are imported or recorded. Notes edited by hand are let be, and only
 * marked when outside it. The steps are what the notes are checked against,
 * so a file carries its own scale whatever names the library comes to use.
 */
export interface ScaleJSON {
  tonic: number
  name: string
  steps: number[]
  // what becomes of the notes outside it that are imported or recorded
  fit: ScaleFit
}

/**
 * What becomes of a note outside the scale: moved up to the nearest note in
 * it, down to the nearest, left out, or let be.
 */
export type ScaleFit = "up" | "down" | "exclude" | "ignore"
export const SCALE_FITS: ScaleFit[] = ["up", "down", "exclude", "ignore"]

const pitchClass = (note: number) => ((note % 12) + 12) % 12

export const inScale = (scale: ScaleJSON, note: number) =>
  scale.steps.includes(pitchClass(note - scale.tonic))

/**
 * The nearest note in the scale from `note`, walking one way, `note` itself
 * if it is in; null if the walk leaves the keyboard first.
 */
export const scaleNoteToward = (
  scale: ScaleJSON,
  note: number,
  direction: 1 | -1,
): number | null => {
  // a scale has a note in every octave, so twelve steps always find one
  for (let moved = 0; moved < 12; moved++) {
    const candidate = note + moved * direction
    if (candidate < MIN_NOTE_NUMBER || candidate > MAX_NOTE_NUMBER) {
      return null
    }
    if (inScale(scale, candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * A note fitted to the scale: kept if it is in, or the fit ignores the
 * scale; else moved up or down to the nearest note that is, or null where
 * it is to be left out. One that can't move its way without leaving the
 * keyboard goes the other way.
 */
export const fitToScale = (
  scale: ScaleJSON,
  note: number,
  fit: ScaleFit,
): number | null => {
  if (fit === "ignore" || inScale(scale, note)) {
    return note
  }
  if (fit === "exclude") {
    return null
  }
  const direction = fit === "up" ? 1 : -1
  return (
    scaleNoteToward(scale, note, direction) ??
    scaleNoteToward(scale, note, direction === 1 ? -1 : 1)
  )
}

/**
 * Tidies a scale's steps: whole semitones within the octave, each once,
 * lowest first, always with the tonic's own 0.
 */
export const normalizeSteps = (steps: readonly number[]): number[] =>
  [...new Set([0, ...steps.map((step) => pitchClass(Math.round(step)))])].sort(
    (a, b) => a - b,
  )
