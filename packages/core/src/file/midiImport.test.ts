import { describe, expect, it } from "vitest"
import { addEnvelope } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON } from "../entities/types"
import { createDefaultMIDIFilter } from "../midi/filter"
import {
  controlChange,
  MidiFileTrack,
  noteOff,
  noteOn,
  writeMidiFile,
} from "./midiFile"
import {
  dealNotes,
  importMidi,
  importPlan,
  MidiImportOptions,
  midiCCs,
  midiSources,
  NOTE_FILTERED,
  NOTE_OUTSIDE,
  NOTE_UNCHOSEN,
  prepareMidi,
} from "./midiImport"
import { ImportedMidi, readMidiFile } from "./midiRead"

const PPQ = 480

// a note on `channel` from `start` for `length` beats
const note = (
  channel: number,
  key: number,
  start: number,
  length: number,
  velocity = 100,
) => [
  { tick: start * PPQ, data: noteOn(channel, key, velocity) },
  { tick: (start + length) * PPQ, data: noteOff(channel, key) },
]

const cc = (channel: number, number: number, value: number, beat: number) => ({
  tick: beat * PPQ,
  data: controlChange(channel, number, value),
})

const read = (tracks: MidiFileTrack[], bpm = 96): ImportedMidi => {
  const result = readMidiFile(writeMidiFile({ ppq: PPQ, bpm, tracks }))
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.midi
}

describe("reading a MIDI file", () => {
  it("reads each track's notes and CCs in beats, with its tempo and metre", () => {
    const midi = read([
      {
        name: "Bass",
        events: [...note(2, 36, 0, 1, 90), cc(2, 74, 64, 0.5)],
      },
    ])
    expect(midi.bpm).toBe(96)
    expect(midi.timeSignature).toEqual([4, 4])
    // the tempo track comes first, empty
    expect(midi.tracks.map(({ name }) => name)).toEqual(["Tempo", "Bass"])
    expect(midi.tracks[1].notes).toEqual([
      { channel: 2, note: 36, velocity: 90, start: 0, end: 1 },
    ])
    expect(midi.tracks[1].ccs).toEqual([
      { channel: 2, cc: 74, value: 64, beat: 0.5 },
    ])
    expect(midi.lengthBeats).toBe(1)
  })

  it("reads running status, and a note on at no velocity as a note off", () => {
    // type 0, 96 a beat: C and E, the E written under running status and
    // ended by a note on at velocity 0
    const track = [
      0x00, 0x90, 60, 100, 0x00, 64, 100, 0x60, 0x80, 60, 0, 0x30, 0x90, 64, 0,
      0x00, 0xff, 0x2f, 0x00,
    ]
    const bytes = new Uint8Array([
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
      ...track,
    ])
    const result = readMidiFile(bytes)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.midi.tracks[0].notes).toEqual([
        { channel: 1, note: 60, velocity: 100, start: 0, end: 1 },
        { channel: 1, note: 64, velocity: 100, start: 0, end: 1.5 },
      ])
      expect(result.midi.bpm).toBeNull()
    }
  })

  it("says why a file can't be read", () => {
    expect(readMidiFile(new TextEncoder().encode("hello"))).toMatchObject({
      ok: false,
      error: "That isn't a MIDI file.",
    })
    const cut = writeMidiFile({
      ppq: PPQ,
      bpm: 120,
      tracks: [{ name: "Lead", events: note(1, 60, 0, 1) }],
    }).slice(0, 40)
    expect(readMidiFile(cut).ok).toBe(false)
  })
})

describe("importing a MIDI file", () => {
  // each import prepares the file first, as the dialog does once
  const importFile = (
    patch: PatchJSON,
    midi: ImportedMidi,
    options: MidiImportOptions,
  ) => importMidi(patch, prepareMidi(midi), options)
  const planFile = (
    patch: PatchJSON,
    midi: ImportedMidi,
    options: MidiImportOptions,
  ) => importPlan(patch, prepareMidi(midi), options)
  const plain = (): PatchJSON => createDefaultPatch()
  // a C major scale up an octave, a note a beat, with the bass's two notes
  // under it on channel 2
  const scale = () =>
    read([
      {
        name: "Lead",
        events: [60, 62, 64, 65, 67, 69, 71, 72].flatMap((key, beat) =>
          note(1, key, beat, 0.9),
        ),
      },
      {
        name: "Bass",
        events: [...note(2, 36, 0, 4), ...note(2, 43, 4, 4)],
      },
    ])
  const options = (
    change: Partial<MidiImportOptions> = {},
  ): MidiImportOptions => ({
    sources: [{ track: 1, channel: 1 }],
    ccs: [],
    start: 0,
    end: 8,
    notesPerStep: 4,
    fromStep: 0,
    loop: false,
    bpm: null,
    ...change,
  })

  it("lists each track's parts by channel, and the CCs a knob could send", () => {
    const midi = read([
      {
        name: "Keys",
        events: [
          ...note(1, 60, 0, 1),
          ...note(2, 72, 0, 1),
          cc(1, 1, 20, 0),
          cc(1, 1, 40, 1),
          // a bank select, which is no envelope
          cc(1, 0, 3, 0),
        ],
      },
    ])
    expect(midiSources(midi)).toEqual([
      { track: 1, channel: 1, name: "Keys", notes: 1, low: 60, high: 60 },
      { track: 1, channel: 2, name: "Keys", notes: 1, low: 72, high: 72 },
    ])
    expect(midiCCs(midi)).toEqual([{ cc: 1, channel: 1, changes: 2 }])
  })

  it("deals the notes into steps in the order they play, however long they last", () => {
    const patch = importFile(plain(), scale(), options())
    expect(patch.steps.slice(0, 3).map(({ notes }) => notes)).toEqual([
      [60, 62, 64, 65],
      [67, 69, 71, 72],
      [],
    ])
  })

  it("takes as many notes a step as asked, and makes that Step Notes", () => {
    const patch = importFile(plain(), scale(), options({ notesPerStep: 3 }))
    expect(patch.steps.slice(0, 3).map(({ notes }) => notes)).toEqual([
      [60, 62, 64],
      [65, 67, 69],
      [71, 72],
    ])
    expect(patch.maxNotesPerStep).toBe(3)
  })

  it("merges the parts chosen, a chord lowest first", () => {
    const patch = importFile(
      plain(),
      scale(),
      options({
        sources: [
          { track: 1, channel: 1 },
          { track: 2, channel: 2 },
        ],
      }),
    )
    // the bass's C starts with the lead's, and its G with the lead's G
    expect(patch.steps.slice(0, 3).map(({ notes }) => notes)).toEqual([
      [36, 60, 62, 64],
      [43, 65, 67, 69],
      [71, 72],
    ])
  })

  it("keeps each key once a step, waiting for the rest", () => {
    const repeats = read([
      {
        name: "Riff",
        events: [60, 60, 64, 60, 67, 72, 60, 64].flatMap((key, beat) =>
          note(1, key, beat, 0.5),
        ),
      },
    ])
    const patch = importFile(plain(), repeats, options())
    expect(patch.steps.slice(0, 2).map(({ notes }) => notes)).toEqual([
      [60, 64, 67, 72],
      [60, 64],
    ])
  })

  it("takes only the notes that start in the stretch", () => {
    const patch = importFile(plain(), scale(), options({ start: 2, end: 5 }))
    expect(patch.steps[0].notes).toEqual([64, 65, 67])
    expect(patch.steps[1].notes).toEqual([])
  })

  it("plans how many steps the notes fill, and where they're cut", () => {
    const small = { ...plain(), size: "small" as const }
    // 4 by 4: sixteen steps
    const two = planFile(small, scale(), options())
    expect(two.chunks.map(({ start, end }) => [start, end])).toEqual([
      [0, 4],
      [4, 8],
    ])
    expect(two).toMatchObject({ firstStep: 0, filled: 2, cut: false })

    const many = planFile(
      small,
      scale(),
      options({ notesPerStep: 1, fromStep: 10 }),
    )
    expect(many).toMatchObject({
      firstStep: 10,
      filled: 6,
      placed: 6,
      cut: true,
    })
  })

  it("goes round the notes again until the grid is full", () => {
    const patch = importFile(
      { ...plain(), size: "small" },
      scale(),
      options({ loop: true, fromStep: 1 }),
    )
    expect(patch.steps.slice(0, 4).map(({ notes }) => notes)).toEqual([
      [],
      [60, 62, 64, 65],
      [67, 69, 71, 72],
      [60, 62, 64, 65],
    ])
    // fifteen steps from the second, so the last is the notes' first
    expect(patch.steps[15].notes).toEqual([60, 62, 64, 65])
  })

  it("turns the CCs chosen into stepped envelopes over each step's stretch", () => {
    const midi = read([
      {
        name: "Keys",
        events: [
          ...[60, 62, 64, 65, 67, 69, 71, 72].flatMap((key, beat) =>
            note(1, key, beat, 0.9),
          ),
          cc(1, 74, 10, 1.5),
          cc(1, 74, 90, 5),
          cc(1, 7, 100, 0),
        ],
      },
    ])
    const patch = importFile(
      plain(),
      midi,
      options({ ccs: [{ cc: 74, channel: 1 }] }),
    )
    // the first step's notes span beats 0 to 4, the second's 4 to 8
    expect(patch.steps[0].envelopes).toMatchObject([
      {
        cc: 74,
        channel: 1,
        shape: "steps",
        points: [{ time: 1.5, value: 10 }],
      },
    ])
    // the second opens at 10, then jumps a beat in
    expect(patch.steps[1].envelopes[0].points).toEqual([
      { time: 0, value: 10 },
      { time: 1, value: 90 },
    ])
    // the volume wasn't chosen
    expect(
      patch.steps.flatMap(({ envelopes }) => envelopes).some((e) => e.cc === 7),
    ).toBe(false)
    const ids = patch.steps.flatMap(({ envelopes }) =>
      envelopes.map((e) => e.id),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("replaces what the filled steps held, and leaves the rest", () => {
    let start = plain()
    start.steps[0] = { ...start.steps[0], notes: [48], state: "rest" }
    start.steps[9] = { ...start.steps[9], notes: [50] }
    start = addEnvelope(start, 0, {
      cc: 1,
      channel: 1,
      points: [{ time: 0, value: 5 }],
    })
    const patch = importFile(start, scale(), options({ end: 1 }))
    expect(patch.steps[0]).toMatchObject({
      notes: [60],
      state: "normal",
      envelopes: [],
    })
    expect(patch.steps[9].notes).toEqual([50])
  })

  it("leaves the pace alone, and takes the tempo if asked", () => {
    const start = { ...plain(), pace: "8th" as const }
    const kept = importFile(start, scale(), options())
    expect(kept.pace).toBe("8th")
    expect(kept.tempo).toBe(120)

    const taken = importFile(start, scale(), options({ bpm: 96.4 }))
    expect(taken.tempo).toBe(96)
  })

  it("keeps out what the filter keeps out, transposing what it lets through", () => {
    const filter = {
      ...createDefaultMIDIFilter(),
      noteLow: 62,
      noteHigh: 71,
      transpose: 12,
    }
    const patch = importFile(plain(), scale(), options({ filter }))
    // D to B, an octave up; C and the top C are kept out
    expect(patch.steps.slice(0, 3).map(({ notes }) => notes)).toEqual([
      [74, 76, 77, 79],
      [81, 83],
      [],
    ])

    const quiet = importFile(
      plain(),
      scale(),
      options({ filter: { ...createDefaultMIDIFilter(), channels: [2] } }),
    )
    expect(quiet.steps[0].notes).toEqual([])
  })

  it("says what became of every note", () => {
    const prepared = prepareMidi(scale())
    const { fates } = dealNotes(prepared, {
      ...options({ start: 1, notesPerStep: 2 }),
      sources: [{ track: 1, channel: 1 }],
      filter: { ...createDefaultMIDIFilter(), noteHigh: 71 },
    })
    const byKey = Object.fromEntries(
      Array.from({ length: prepared.count }, (_, index) => {
        const source = prepared.sources[prepared.sourceOf[index]]
        return [
          `${source.track}:${source.channel}/${prepared.keys[index]}`,
          fates[index],
        ]
      }),
    )
    expect(byKey).toEqual({
      // the bass wasn't chosen
      "2:2/36": NOTE_UNCHOSEN,
      "2:2/43": NOTE_UNCHOSEN,
      // C starts before the stretch; the top C is filtered out
      "1:1/60": NOTE_OUTSIDE,
      "1:1/72": NOTE_FILTERED,
      // two a step
      "1:1/62": 0,
      "1:1/64": 0,
      "1:1/65": 1,
      "1:1/67": 1,
      "1:1/69": 2,
      "1:1/71": 2,
    })
  })

  it("fits a grid of any size, and says how many steps find room", () => {
    // 4 by 4, from step 15 of 16: room for two
    const small = { ...plain(), size: "small" as const }
    const plan = planFile(
      small,
      scale(),
      options({ notesPerStep: 2, fromStep: 14 }),
    )
    expect(plan).toMatchObject({ filled: 2, placed: 2, cut: true })
    expect(plan.chunks).toHaveLength(4)
    // looping can't make room either: the steps after the grid's end are
    // still left out
    expect(
      planFile(
        small,
        scale(),
        options({ notesPerStep: 2, fromStep: 14, loop: true }),
      ),
    ).toMatchObject({ filled: 2, placed: 2, cut: true })
    const patch = importFile(
      small,
      scale(),
      options({ notesPerStep: 2, fromStep: 14 }),
    )
    expect(patch.steps[14].notes).toEqual([60, 62])
    expect(patch.steps[15].notes).toEqual([64, 65])
    // the grid's steps past its size are never touched
    expect(patch.steps[16].notes).toEqual([])
  })

  it("reads and deals a file of 150,000 notes", () => {
    const events = Array.from({ length: 150_000 }, (_, index) =>
      note(1 + (index % 4), 36 + (index % 48), index / 8, 0.1),
    ).flat()
    const started = performance.now()
    const midi = read([{ name: "Busy", events }])
    const prepared = prepareMidi(midi)
    expect(prepared.count).toBe(150_000)
    // in time order, whatever order the tracks came in
    expect(
      prepared.starts.every(
        (start, index) => index === 0 || start >= prepared.starts[index - 1],
      ),
    ).toBe(true)
    expect(midi.lengthBeats).toBeCloseTo(149_999 / 8 + 0.1)
    const plan = importPlan(plain(), prepared, {
      ...options({ end: midi.lengthBeats }),
      sources: prepared.sources,
    })
    expect(plan.chunks.length).toBeGreaterThan(64)
    expect(plan.placed).toBe(64)
    // well inside what a dialog can wait for
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
