import { noteOffBytes, noteOnBytes } from "@midiseq/core"

interface HeldNote {
  voices: Set<number>
  onTime: number
}

export interface HeldNoteKey {
  channel: number
  note: number
}

const keyOf = (channel: number, note: number) => channel * 128 + note

/**
 * Keeps the combined "All" output unambiguous when several voices share it:
 * - two voices starting the same note at the same time send one note-on
 * - retriggering a held note sends a note-off first
 * - the note-off goes out only when the last voice holding the note lets go
 */
export class AllOutDedupe {
  private readonly held = new Map<number, HeldNote>()

  noteOn(
    voice: number,
    channel: number,
    note: number,
    velocity: number,
    time: number,
  ): number[][] {
    const key = keyOf(channel, note)
    const entry = this.held.get(key)
    if (entry === undefined) {
      this.held.set(key, { voices: new Set([voice]), onTime: time })
      return [noteOnBytes(channel, note, velocity)]
    }
    if (entry.onTime === time && !entry.voices.has(voice)) {
      entry.voices.add(voice)
      return []
    }
    entry.voices.add(voice)
    entry.onTime = time
    return [noteOffBytes(channel, note), noteOnBytes(channel, note, velocity)]
  }

  noteOff(voice: number, channel: number, note: number): number[][] {
    const key = keyOf(channel, note)
    const entry = this.held.get(key)
    if (entry === undefined || !entry.voices.delete(voice)) {
      return []
    }
    if (entry.voices.size > 0) {
      return []
    }
    this.held.delete(key)
    return [noteOffBytes(channel, note)]
  }

  heldNotes(): HeldNoteKey[] {
    return [...this.held.keys()].map((key) => ({
      channel: Math.floor(key / 128),
      note: key % 128,
    }))
  }

  reset() {
    this.held.clear()
  }
}
