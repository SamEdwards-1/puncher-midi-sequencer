/**
 * A Standard MIDI File, type 1: a track for the tempo and metre, then one per
 * part, each a list of timed events. Written from scratch — the format is
 * small — so nothing else is needed to hand a sequence to a DAW.
 */

export interface MidiFileEvent {
  // from the file's start, in ticks
  tick: number
  // the bytes after the delta time: a status byte and its data, or a meta
  // event from 0xff
  data: number[]
}

export interface MidiFileTrack {
  name: string
  events: MidiFileEvent[]
}

export interface MidiFileSpec {
  // ticks to a quarter note
  ppq: number
  bpm: number
  tracks: MidiFileTrack[]
}

// 480 a beat divides by the 48ths the engine reads envelopes on, and by
// every pace down to the 32nd triplet, so nothing is rounded.
export const MIDI_FILE_PPQ = 480

// A number as MIDI writes lengths and times: seven bits a byte, the high bit
// set on every byte but the last.
export const variableLength = (value: number): number[] => {
  let rest = Math.max(0, Math.floor(value))
  const bytes = [rest & 0x7f]
  rest >>= 7
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80)
    rest >>= 7
  }
  return bytes
}

const text = (value: string): number[] => [...new TextEncoder().encode(value)]

const meta = (type: number, data: number[]): number[] => [
  0xff,
  type,
  ...variableLength(data.length),
  ...data,
]

const trackName = (name: string) => meta(0x03, text(name))

const uint32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]

const uint16 = (value: number) => [(value >> 8) & 0xff, value & 0xff]

const chunk = (id: string, body: number[]): number[] => [
  ...text(id),
  ...uint32(body.length),
  ...body,
]

// A note off sorts before anything else at its tick, so a note ending just
// as the same key starts again is not cut short by its own release.
const order = (event: MidiFileEvent) =>
  (event.data[0] & 0xf0) === 0x80 ? 0 : 1

const trackChunk = (track: MidiFileTrack): number[] => {
  const events = [...track.events].sort(
    (a, b) => a.tick - b.tick || order(a) - order(b),
  )
  const body: number[] = [0, ...trackName(track.name)]
  let last = 0
  for (const { tick, data } of events) {
    const at = Math.max(last, Math.round(tick))
    body.push(...variableLength(at - last), ...data)
    last = at
  }
  body.push(0, ...meta(0x2f, []))
  return chunk("MTrk", body)
}

/** The file's bytes: a header, the tempo track, and each part's track. */
export const writeMidiFile = ({
  ppq,
  bpm,
  tracks,
}: MidiFileSpec): Uint8Array<ArrayBuffer> => {
  const tempo: MidiFileTrack = {
    name: "Tempo",
    events: [
      {
        tick: 0,
        // microseconds to a quarter note, in three bytes
        data: meta(0x51, uint32(Math.round(60_000_000 / bpm)).slice(1)),
      },
      // 4/4, a click every quarter, eight 32nds to a quarter
      { tick: 0, data: meta(0x58, [4, 2, 24, 8]) },
    ],
  }
  const all = [tempo, ...tracks]
  return new Uint8Array([
    ...chunk("MThd", [...uint16(1), ...uint16(all.length), ...uint16(ppq)]),
    ...all.flatMap(trackChunk),
  ])
}

export const noteOn = (channel: number, note: number, velocity: number) => [
  0x90 | (channel - 1),
  note & 0x7f,
  velocity & 0x7f,
]

export const noteOff = (channel: number, note: number) => [
  0x80 | (channel - 1),
  note & 0x7f,
  0,
]

export const controlChange = (channel: number, cc: number, value: number) => [
  0xb0 | (channel - 1),
  cc & 0x7f,
  value & 0x7f,
]

export const programChange = (channel: number, program: number) => [
  0xc0 | (channel - 1),
  program & 0x7f,
]
