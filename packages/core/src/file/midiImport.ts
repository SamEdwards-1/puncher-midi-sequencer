import { nextEnvelopeId } from "../commands/patchCommands"
import { stepCount } from "../engine/loopRange"
import { dropRepeats } from "../entities/envelope"
import { MAX_NOTE_NUMBER, MIN_NOTE_NUMBER } from "../entities/noteName"
import { MAX_PACE_BEATS } from "../entities/paces"
import {
  EnvelopeJSON,
  NOTES_PER_STEP,
  PatchJSON,
  StepIndex,
} from "../entities/types"
import { isControlPosition } from "../midi/ccNames"
import { MIDIFilterJSON } from "../midi/filter"
import { ImportedMidi } from "./midiRead"

// General MIDI keeps its drums on channel 10.
export const DRUM_CHANNEL = 10

const MIN_TEMPO = 20
const MAX_TEMPO = 400

/** Notes on one channel of one track: something an import can take. */
export interface MidiSource {
  track: number
  channel: number
  // the track's name, if it has one
  name: string
  notes: number
  low: number
  high: number
}

/** A controller a file sends, by number and channel. */
export interface MidiFileCC {
  cc: number
  channel: number
  // how many changes it makes
  changes: number
}

export const sourceKey = ({
  track,
  channel,
}: {
  track: number
  channel: number
}) => `${track}:${channel}`

const ccKey = ({ cc, channel }: { cc: number; channel: number }) =>
  `${channel}:${cc}`

/**
 * Each track's notes, a source to each channel they are on, in the file's
 * order: a type 0 file's single track usually carries every part, one to a
 * channel, so a channel is the part, and a type 1 file usually has one part
 * a track.
 */
export const midiSources = (midi: ImportedMidi): MidiSource[] =>
  midi.tracks.flatMap((track) => {
    const byChannel = new Map<number, MidiSource>()
    for (const { channel, note } of track.notes) {
      const source = byChannel.get(channel)
      if (source === undefined) {
        byChannel.set(channel, {
          track: track.index,
          channel,
          name: track.name,
          notes: 1,
          low: note,
          high: note,
        })
      } else {
        source.notes++
        source.low = Math.min(source.low, note)
        source.high = Math.max(source.high, note)
      }
    }
    return [...byChannel.values()].sort((a, b) => a.channel - b.channel)
  })

/**
 * The controllers a file sends that an envelope can hold — a knob's or
 * pedal's position, not bank selects, data entry or channel mode commands —
 * by channel and number, whichever tracks they are on.
 */
export const midiCCs = (midi: ImportedMidi): MidiFileCC[] => {
  const found = new Map<string, MidiFileCC>()
  for (const track of midi.tracks) {
    for (const { cc, channel } of track.ccs) {
      if (!isControlPosition(cc)) {
        continue
      }
      const key = ccKey({ cc, channel })
      const entry = found.get(key)
      if (entry === undefined) {
        found.set(key, { cc, channel, changes: 1 })
      } else {
        entry.changes++
      }
    }
  }
  return [...found.values()].sort(
    (a, b) => a.channel - b.channel || a.cc - b.cc,
  )
}

/**
 * A file made ready to import, once, however often the choices change.
 * Every note of every track in one list, by start and then key, kept as
 * columns of numbers — its start and end in beats, its key and channel,
 * and which of `sources` it belongs to — so going through them all, on
 * every drag of the range, is quick; the longest note's length, so what
 * sounds at a time can be found from the start times alone; each
 * controller's changes in time order; and the parts and controllers to
 * choose from.
 */
export interface PreparedMidi {
  midi: ImportedMidi
  count: number
  starts: Float64Array
  ends: Float64Array
  keys: Uint8Array
  channels: Uint8Array
  sourceOf: Uint16Array
  longest: number
  changes: Map<string, { beat: number; value: number }[]>
  sources: MidiSource[]
  ccs: MidiFileCC[]
}

export const prepareMidi = (midi: ImportedMidi): PreparedMidi => {
  const sources = midiSources(midi)
  const sourceIndex = new Map(
    sources.map((source, index) => [sourceKey(source), index]),
  )

  let count = 0
  for (const track of midi.tracks) {
    count += track.notes.length
  }
  // gathered in file order, then put in time order through an index
  const starts = new Float64Array(count)
  const ends = new Float64Array(count)
  const keys = new Uint8Array(count)
  const channels = new Uint8Array(count)
  const sourceOf = new Uint16Array(count)
  let at = 0
  let longest = 0
  for (const track of midi.tracks) {
    for (const { channel, note, start, end } of track.notes) {
      starts[at] = start
      ends[at] = end
      keys[at] = note
      channels[at] = channel
      sourceOf[at] =
        sourceIndex.get(sourceKey({ track: track.index, channel })) ?? 0
      longest = Math.max(longest, end - start)
      at++
    }
  }
  const order = new Uint32Array(count)
  for (let index = 0; index < count; index++) {
    order[index] = index
  }
  order.sort((a, b) => starts[a] - starts[b] || keys[a] - keys[b])
  const sorted = <T extends Float64Array | Uint8Array | Uint16Array>(
    column: T,
  ): T => {
    const out = new (column.constructor as new (length: number) => T)(count)
    for (let index = 0; index < count; index++) {
      out[index] = column[order[index]]
    }
    return out
  }

  const changes = new Map<string, { beat: number; value: number }[]>()
  for (const track of midi.tracks) {
    for (const { channel, cc, value, beat } of track.ccs) {
      const key = ccKey({ cc, channel })
      const list = changes.get(key)
      if (list === undefined) {
        changes.set(key, [{ beat, value }])
      } else {
        list.push({ beat, value })
      }
    }
  }
  for (const list of changes.values()) {
    list.sort((a, b) => a.beat - b.beat)
  }

  return {
    midi,
    count,
    starts: sorted(starts),
    ends: sorted(ends),
    keys: sorted(keys),
    channels: sorted(channels),
    sourceOf: sorted(sourceOf),
    longest,
    changes,
    sources,
    ccs: midiCCs(midi),
  }
}

/** The first index whose time is at or past `time`, in a list in time order. */
export const firstAtOrAfter = <T>(
  list: ArrayLike<T>,
  time: number,
  timeOf: (item: T) => number,
): number => {
  let low = 0
  let high = list.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (timeOf(list[middle]) < time) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

export interface MidiImportOptions {
  // the parts whose notes go in, merged
  sources: readonly { track: number; channel: number }[]
  // the controllers that become envelopes
  ccs: readonly { cc: number; channel: number }[]
  // what the notes and controllers pass through, as the MIDI input's
  // filter does; everything, if none
  filter?: MIDIFilterJSON
  // the stretch of the file taken, in beats: the notes that start in it
  start: number
  end: number
  // how many notes each step takes; the sequencer's Step notes from here on
  notesPerStep: number
  // the step the first of them go into
  fromStep: StepIndex
  // go round them again until the grid is full
  loop: boolean
  // the tempo to take, or null to keep the patch's
  bpm: number | null
}

/**
 * A step's worth of the file: its notes, lowest first and as the filter
 * transposes them, and the stretch it came from — from its first note to
 * the next step's, or the range's end.
 */
export interface ImportChunk {
  notes: number[]
  start: number
  end: number
}

// What became of a note, where it isn't dealt into a step.
export const NOTE_UNCHOSEN = -3
export const NOTE_FILTERED = -2
export const NOTE_OUTSIDE = -1

export interface Dealt {
  chunks: ImportChunk[]
  // one for each prepared note: the chunk it went to, or why it went
  // nowhere — its part wasn't chosen, the filter kept it out, or it starts
  // outside the stretch
  fates: Int32Array
}

/**
 * The chosen parts' notes that the filter lets through and that start in
 * the stretch, dealt into steps in the order they play — a chord lowest
 * first — `notesPerStep` at a time, however long each lasts. A step keeps
 * each key once, as recording does: a note it already has adds nothing, and
 * it waits for the rest. Every note's fate is kept, for the preview. The
 * filter is the MIDI input's: a note's channel and key as it is, then
 * transposed, dropped if that takes it off the keyboard.
 */
export const dealNotes = (
  prepared: PreparedMidi,
  options: Pick<
    MidiImportOptions,
    "sources" | "start" | "end" | "notesPerStep" | "filter"
  >,
): Dealt => {
  const { count, starts, keys, channels, sourceOf } = prepared
  const chosen = new Uint8Array(prepared.sources.length)
  const wanted = new Set(options.sources.map(sourceKey))
  prepared.sources.forEach((source, index) => {
    chosen[index] = wanted.has(sourceKey(source)) ? 1 : 0
  })
  const { filter } = options
  const heard = new Uint8Array(17)
  if (filter === undefined) {
    heard.fill(1)
  } else {
    for (const channel of filter.channels) {
      heard[channel] = 1
    }
  }
  const low = filter?.noteLow ?? MIN_NOTE_NUMBER
  const high = filter?.noteHigh ?? MAX_NOTE_NUMBER
  const transpose = filter?.transpose ?? 0
  const per = Math.max(1, options.notesPerStep)

  const fates = new Int32Array(count)
  const chunkStarts: number[] = []
  const chunkKeys: number[][] = []
  let current: number[] | null = null
  for (let index = 0; index < count; index++) {
    if (chosen[sourceOf[index]] === 0) {
      fates[index] = NOTE_UNCHOSEN
      continue
    }
    const key = keys[index]
    const moved = key + transpose
    if (
      heard[channels[index]] === 0 ||
      key < low ||
      key > high ||
      moved < MIN_NOTE_NUMBER ||
      moved > MAX_NOTE_NUMBER
    ) {
      fates[index] = NOTE_FILTERED
      continue
    }
    const start = starts[index]
    if (start < options.start || start >= options.end) {
      fates[index] = NOTE_OUTSIDE
      continue
    }
    if (current === null) {
      current = []
      chunkKeys.push(current)
      chunkStarts.push(start)
    }
    fates[index] = chunkKeys.length - 1
    if (current.includes(moved)) {
      continue
    }
    current.push(moved)
    if (current.length === per) {
      current = null
    }
  }

  return {
    chunks: chunkKeys.map((notes, index) => ({
      notes: notes.sort((a, b) => a - b),
      start: chunkStarts[index],
      end: chunkStarts[index + 1] ?? options.end,
    })),
    fates,
  }
}

export interface ImportPlan extends Dealt {
  // the steps filled: from the first, this many
  firstStep: StepIndex
  filled: number
  // how many of the chunks find a step; those after are left out
  placed: number
  // there are more than the grid has room for
  cut: boolean
}

/**
 * How an import would land, before it does: the notes dealt into steps,
 * and how many of those steps the grid has room for from `fromStep`, going
 * round them again to its end if looping. The grid can be any size.
 */
export const importPlan = (
  patch: PatchJSON,
  prepared: PreparedMidi,
  options: MidiImportOptions,
): ImportPlan => {
  const dealt = dealNotes(prepared, options)
  const room = Math.max(0, stepCount(patch.size) - options.fromStep)
  const count = dealt.chunks.length
  return {
    ...dealt,
    firstStep: options.fromStep,
    filled: count === 0 ? 0 : options.loop ? room : Math.min(count, room),
    placed: Math.min(count, room),
    cut: count > room,
  }
}

/**
 * A MIDI file into the steps, as one edit. The chosen notes are dealt into
 * steps from `fromStep` on (see dealNotes) — once, or over and over until
 * the grid is full. The chosen CCs the filter lets through become stepped
 * envelopes over the stretch each step's notes came from, starting from
 * the value in force as it opens and timed in beats from there, as
 * envelopes are. A filled step's notes and envelopes are replaced and it
 * plays normally; its jump is kept. Step Notes becomes the count dealt, and
 * the tempo the file's if asked; the pace is left alone.
 */
export const importMidi = (
  patch: PatchJSON,
  prepared: PreparedMidi,
  options: MidiImportOptions,
): PatchJSON => {
  const plan = importPlan(patch, prepared, options)
  const { filter } = options
  const ccs = options.ccs
    .filter(
      ({ cc, channel }) =>
        filter === undefined ||
        (filter.channels.includes(channel) && filter.ccs.includes(cc)),
    )
    .map(({ cc, channel }) => ({
      cc,
      channel,
      changes: prepared.changes.get(ccKey({ cc, channel })) ?? [],
    }))
  const beatOf = (change: { beat: number }) => change.beat

  let nextId = nextEnvelopeId(patch)
  const steps = patch.steps.map((step, index) => {
    const offset = index - plan.firstStep
    if (offset < 0 || offset >= plan.filled) {
      return step
    }
    const {
      notes,
      start: from,
      end: to,
    } = plan.chunks[offset % plan.chunks.length]

    const envelopes: EnvelopeJSON[] = ccs.flatMap(
      ({ cc, channel, changes }) => {
        const first = firstAtOrAfter(changes, from, beatOf)
        const past = firstAtOrAfter(changes, to, beatOf)
        const before = changes[first - 1]
        const inside = changes.slice(first, past)
        const points = dropRepeats([
          ...(before !== undefined && inside[0]?.beat !== from
            ? [{ time: 0, value: before.value }]
            : []),
          ...inside.map(({ beat, value }) => ({
            time: Math.min(MAX_PACE_BEATS, beat - from),
            value,
          })),
        ])
        return points.length === 0
          ? []
          : [{ id: nextId++, cc, channel, shape: "steps" as const, points }]
      },
    )

    return { ...step, state: "normal" as const, notes, envelopes }
  })

  return {
    ...patch,
    maxNotesPerStep: Math.min(
      NOTES_PER_STEP,
      Math.max(1, options.notesPerStep),
    ),
    tempo:
      options.bpm === null
        ? patch.tempo
        : Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(options.bpm))),
    steps,
  }
}
