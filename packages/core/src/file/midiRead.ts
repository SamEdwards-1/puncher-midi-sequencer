/**
 * Reading a Standard MIDI File — type 0 or 1 — into what an import needs:
 * each track's notes and controller changes, timed in beats, with the tempo
 * and metre it starts at. Everything else a file can hold (system exclusive,
 * pitch bend, lyrics and the rest) is read past.
 */

export interface ImportedNote {
  channel: number
  note: number
  velocity: number
  // in beats from the file's start
  start: number
  end: number
}

export interface ImportedCC {
  channel: number
  cc: number
  value: number
  beat: number
}

export interface ImportedTrack {
  // its place in the file, from 0
  index: number
  name: string
  notes: ImportedNote[]
  ccs: ImportedCC[]
}

export interface ImportedMidi {
  // the tempo and metre it starts in, if it says
  bpm: number | null
  timeSignature: [number, number] | null
  tracks: ImportedTrack[]
  // to the end of the last note or event
  lengthBeats: number
}

export type MidiReadResult =
  | { ok: true; midi: ImportedMidi }
  | { ok: false; error: string }

class Reader {
  at = 0
  constructor(
    readonly bytes: Uint8Array,
    readonly end = bytes.length,
  ) {}

  get done() {
    return this.at >= this.end
  }

  byte(): number {
    if (this.at >= this.end) {
      throw new Error("The file ends partway through.")
    }
    return this.bytes[this.at++]
  }

  word(count: number): number {
    let value = 0
    for (let index = 0; index < count; index++) {
      value = value * 256 + this.byte()
    }
    return value
  }

  text(count: number): string {
    const slice = this.bytes.slice(this.at, this.at + count)
    this.skip(count)
    return new TextDecoder().decode(slice)
  }

  skip(count: number) {
    if (this.at + count > this.end) {
      throw new Error("The file ends partway through.")
    }
    this.at += count
  }

  // seven bits a byte, the high bit set on all but the last
  variable(): number {
    let value = 0
    for (let count = 0; count < 4; count++) {
      const byte = this.byte()
      value = value * 128 + (byte & 0x7f)
      if (byte < 0x80) {
        return value
      }
    }
    throw new Error("A length runs on too long.")
  }
}

// The data bytes each kind of channel message carries.
const dataLength = (status: number) =>
  (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2

interface RawTrack {
  name: string
  // as ImportedNote, but timed in ticks
  notes: ImportedNote[]
  ccs: (Omit<ImportedCC, "beat"> & { tick: number })[]
  tempo: number | null
  timeSignature: [number, number] | null
  lastTick: number
}

const readTrack = (reader: Reader): RawTrack => {
  const track: RawTrack = {
    name: "",
    notes: [],
    ccs: [],
    tempo: null,
    timeSignature: null,
    lastTick: 0,
  }
  // notes still sounding, by channel and key, oldest first: a slot for each
  // of the 16 × 128, found by number rather than by a key built per note
  const open: ({ velocity: number; start: number }[] | undefined)[] = []
  let tick = 0
  let running = 0

  const release = (channel: number, note: number, at: number) => {
    const started = open[(channel - 1) * 128 + note]?.shift()
    if (started !== undefined) {
      track.notes.push({
        channel,
        note,
        velocity: started.velocity,
        start: started.start,
        end: Math.max(at, started.start),
      })
    }
  }

  while (!reader.done) {
    tick += reader.variable()
    let status = reader.bytes[reader.at]
    if (status >= 0x80) {
      reader.at++
    } else {
      // running status: the last channel message's status carries on
      if (running === 0) {
        throw new Error("A track starts without a status.")
      }
      status = running
    }

    if (status === 0xff) {
      const type = reader.byte()
      const length = reader.variable()
      if (type === 0x03 && track.name === "") {
        track.name = reader.text(length).trim()
      } else if (type === 0x51 && length === 3 && track.tempo === null) {
        track.tempo = 60_000_000 / reader.word(3)
      } else if (type === 0x58 && length >= 2 && track.timeSignature === null) {
        const numerator = reader.byte()
        const power = reader.byte()
        track.timeSignature = [numerator, 2 ** power]
        reader.skip(length - 2)
      } else if (type === 0x2f) {
        reader.skip(length)
        break
      } else {
        reader.skip(length)
      }
      continue
    }
    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.variable())
      continue
    }
    if (status > 0xf0) {
      // system common and realtime bytes have no place in a file; step past
      continue
    }

    running = status
    const channel = (status & 0x0f) + 1
    const kind = status & 0xf0
    const first = reader.byte()
    const second = dataLength(status) === 2 ? reader.byte() : 0
    track.lastTick = Math.max(track.lastTick, tick)

    if (kind === 0x90 && second > 0) {
      const slot = (channel - 1) * 128 + first
      const started = open[slot]
      if (started === undefined) {
        open[slot] = [{ velocity: second, start: tick }]
      } else {
        started.push({ velocity: second, start: tick })
      }
    } else if (kind === 0x80 || (kind === 0x90 && second === 0)) {
      release(channel, first, tick)
    } else if (kind === 0xb0) {
      track.ccs.push({ channel, cc: first, value: second, tick })
    }
  }

  // a note never released ends with its track
  open.forEach((started, slot) => {
    const channel = Math.floor(slot / 128) + 1
    const note = slot % 128
    for (const each of started ?? []) {
      track.notes.push({
        channel,
        note,
        velocity: each.velocity,
        start: each.start,
        end: Math.max(tick, each.start),
      })
    }
  })
  track.lastTick = Math.max(track.lastTick, tick)
  return track
}

// Where the file's last note ends or last CC changes. A loop rather than
// Math.max(...all), which runs out of stack on a big enough file.
const lastBeat = (tracks: ImportedTrack[]) => {
  let last = 0
  for (const track of tracks) {
    for (const note of track.notes) {
      last = Math.max(last, note.end)
    }
    for (const cc of track.ccs) {
      last = Math.max(last, cc.beat)
    }
  }
  return last
}

/**
 * The file's tracks with their notes and CCs in beats. Only the first tempo
 * and time signature are kept: an import takes the file's timing in beats,
 * so a tempo change moves nothing, and only the starting tempo is offered.
 */
export const readMidiFile = (bytes: Uint8Array): MidiReadResult => {
  try {
    const reader = new Reader(bytes)
    if (reader.text(4) !== "MThd") {
      return { ok: false, error: "That isn't a MIDI file." }
    }
    const headerLength = reader.word(4)
    const format = reader.word(2)
    const count = reader.word(2)
    const division = reader.word(2)
    reader.skip(headerLength - 6)
    if (format > 1) {
      return {
        ok: false,
        error: "Only type 0 and type 1 MIDI files can be imported.",
      }
    }
    if (division & 0x8000) {
      return {
        ok: false,
        error: "This file is timed in SMPTE frames rather than beats.",
      }
    }
    const ppq = division

    const raw: RawTrack[] = []
    while (raw.length < count && !reader.done) {
      const id = reader.text(4)
      const length = reader.word(4)
      const end = reader.at + length
      if (id === "MTrk") {
        // a reader of its own, so a track can't read into the next
        const track = new Reader(bytes, Math.min(end, bytes.length))
        track.at = reader.at
        raw.push(readTrack(track))
      }
      reader.at = end
    }

    const beats = (tick: number) => tick / ppq
    const tracks: ImportedTrack[] = raw.map((track, index) => ({
      index,
      name: track.name,
      notes: track.notes
        .map((note) => ({
          ...note,
          start: beats(note.start),
          end: beats(note.end),
        }))
        .sort((a, b) => a.start - b.start || a.note - b.note),
      ccs: track.ccs
        .map(({ tick, ...cc }) => ({ ...cc, beat: beats(tick) }))
        .sort((a, b) => a.beat - b.beat),
    }))
    return {
      ok: true,
      midi: {
        bpm: raw.find((track) => track.tempo !== null)?.tempo ?? null,
        timeSignature:
          raw.find((track) => track.timeSignature !== null)?.timeSignature ??
          null,
        tracks,
        lengthBeats: lastBeat(tracks),
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "It couldn't be read.",
    }
  }
}
