import { MAX_NOTE_NUMBER, MIN_NOTE_NUMBER } from "../entities/noteName"

/**
 * What is let through from a MIDI input, and how. It describes the connection
 * to a keyboard rather than the music, so it belongs to the setup and is
 * never saved in a patch.
 */
export interface MIDIFilterJSON {
  // 1-16, the channels to listen on. Empty means nothing gets through.
  channels: number[]
  // the notes to keep, inclusive, before transposing
  noteLow: number
  noteHigh: number
  // semitones added to what arrives
  transpose: number
  // 0-127, the controllers to keep
  ccs: number[]
}

export const ALL_CHANNELS = Array.from({ length: 16 }, (_, i) => i + 1)
export const ALL_CCS = Array.from({ length: 128 }, (_, i) => i)
export const MIN_TRANSPOSE = -48
export const MAX_TRANSPOSE = 48

export const createDefaultMIDIFilter = (): MIDIFilterJSON => ({
  channels: [...ALL_CHANNELS],
  noteLow: MIN_NOTE_NUMBER,
  noteHigh: MAX_NOTE_NUMBER,
  transpose: 0,
  ccs: [...ALL_CCS],
})

export interface FilterableNote {
  type: "noteOn" | "noteOff"
  channel: number
  note: number
  velocity: number
}

export interface FilterableCC {
  type: "cc"
  channel: number
  cc: number
  value: number
}

export type FilterableMessage = FilterableNote | FilterableCC

/**
 * Applies the filter to one message. Returns what should be acted on, or null
 * when the message is filtered out.
 *
 * The range is tested against the note as it arrived and the transpose is
 * applied after, so moving the range never leaves a note on: a note and its
 * note-off are judged the same way. A transposed note that would leave MIDI's
 * range is dropped rather than wrapped.
 */
export const filterMIDIMessage = (
  message: FilterableMessage,
  filter: MIDIFilterJSON,
): FilterableMessage | null => {
  if (!filter.channels.includes(message.channel)) {
    return null
  }
  if (message.type === "cc") {
    return filter.ccs.includes(message.cc) ? message : null
  }
  if (message.note < filter.noteLow || message.note > filter.noteHigh) {
    return null
  }
  const note = message.note + filter.transpose
  if (note < MIN_NOTE_NUMBER || note > MAX_NOTE_NUMBER) {
    return null
  }
  return note === message.note ? message : { ...message, note }
}
