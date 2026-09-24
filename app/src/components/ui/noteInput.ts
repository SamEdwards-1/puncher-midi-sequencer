import { noteNameToNumber, noteNumberToName } from "@midiseq/core"

// Everything a note name can be made of: a letter, an accidental, and an
// octave that can be negative. Anything else is dropped as it is typed, so
// the field can only ever hold something that looks like a note.
export const sanitizeNoteText = (text: string): string =>
  text.replace(/[^A-Ga-g#b\-0-9]/g, "").slice(0, 5)

const OCTAVE_LESS = /^([A-Ga-g])([#b]?)$/

/**
 * Reads what was typed into a note field. A name with an octave means that
 * note; a bare letter keeps the octave the field was already on, so moving
 * from C4 to G is G4 rather than a jump to some other register. Anything that
 * isn't a note — or lands outside MIDI's range — returns null, which leaves
 * the field as it was.
 */
export const parseNoteText = (text: string, current: number): number | null => {
  const trimmed = text.trim()
  const match = OCTAVE_LESS.exec(trimmed)
  if (match === null) {
    return noteNameToNumber(trimmed)
  }
  // the octave of the note being edited, as its own name spells it
  const octave = noteNumberToName(current).replace(/^[A-G]#?/, "")
  return noteNameToNumber(`${match[1]}${match[2]}${octave}`)
}
