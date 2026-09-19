const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const

const SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

export const MIN_NOTE_NUMBER = 0
export const MAX_NOTE_NUMBER = 127

// Scientific pitch notation: note number 60 is C4
export const noteNumberToName = (noteNumber: number): string => {
  const octave = Math.floor(noteNumber / 12) - 1
  return `${NOTE_NAMES[((noteNumber % 12) + 12) % 12]}${octave}`
}

export const noteNameToNumber = (name: string): number | null => {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim())
  if (match === null) {
    return null
  }
  const [, letter, accidental, octave] = match
  const offset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0
  const noteNumber =
    (Number.parseInt(octave, 10) + 1) * 12 +
    SEMITONES[letter.toUpperCase()] +
    offset
  if (noteNumber < MIN_NOTE_NUMBER || noteNumber > MAX_NOTE_NUMBER) {
    return null
  }
  return noteNumber
}
