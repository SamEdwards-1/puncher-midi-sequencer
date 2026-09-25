import { describe, expect, it } from "vitest"
import { addEnvelope } from "../commands/patchCommands"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON } from "../entities/types"
import {
  exportBeats,
  exportMidi,
  exportStepMidi,
  MidiExportOptions,
  passSteps,
  sequenceCCs,
} from "./midiExport"
import { noteOff, noteOn, variableLength, writeMidiFile } from "./midiFile"

interface ReadEvent {
  tick: number
  data: number[]
}

interface ReadTrack {
  name: string
  events: ReadEvent[]
}

// Reads back what writeMidiFile writes: no running status, and meta events
// kept whole.
const readMidiFile = (bytes: Uint8Array) => {
  let at = 0
  const take = (count: number) => {
    const slice = [...bytes.slice(at, at + count)]
    at += count
    return slice
  }
  const word = (count: number) =>
    take(count).reduce((value, byte) => value * 256 + byte, 0)
  const vlq = () => {
    let value = 0
    for (;;) {
      const [byte] = take(1)
      value = value * 128 + (byte & 0x7f)
      if (byte < 0x80) {
        return value
      }
    }
  }
  const id = () => String.fromCharCode(...take(4))

  expect(id()).toBe("MThd")
  expect(word(4)).toBe(6)
  const format = word(2)
  const count = word(2)
  const ppq = word(2)
  const tracks: ReadTrack[] = []
  for (let track = 0; track < count; track++) {
    expect(id()).toBe("MTrk")
    const end = word(4) + at
    let tick = 0
    let name = ""
    const events: ReadEvent[] = []
    while (at < end) {
      tick += vlq()
      const [status] = take(1)
      if (status === 0xff) {
        const [type] = take(1)
        const data = take(vlq())
        if (type === 0x03) {
          name = new TextDecoder().decode(new Uint8Array(data))
        } else if (type !== 0x2f) {
          // every track ends the same way; the rest is kept
          events.push({ tick, data: [0xff, type, ...data] })
        }
      } else {
        const size = (status & 0xf0) === 0xc0 ? 1 : 2
        events.push({ tick, data: [status, ...take(size)] })
      }
    }
    tracks.push({ name, events })
  }
  return { format, ppq, tracks }
}

const notes = (track: ReadTrack) =>
  track.events.filter(({ data }) => (data[0] & 0xe0) === 0x80)

describe("a MIDI file", () => {
  it("writes lengths seven bits a byte", () => {
    expect(variableLength(0)).toEqual([0])
    expect(variableLength(127)).toEqual([0x7f])
    expect(variableLength(128)).toEqual([0x81, 0x00])
    expect(variableLength(0x3fff)).toEqual([0xff, 0x7f])
    expect(variableLength(0x200000)).toEqual([0x81, 0x80, 0x80, 0x00])
  })

  it("starts with a tempo track, then a track for each part", () => {
    const file = readMidiFile(
      writeMidiFile({
        ppq: 480,
        bpm: 120,
        tracks: [{ name: "Lead", events: [] }],
      }),
    )
    expect(file.format).toBe(1)
    expect(file.ppq).toBe(480)
    expect(file.tracks.map(({ name }) => name)).toEqual(["Tempo", "Lead"])
    // half a second to a quarter note, and 4/4
    expect(file.tracks[0].events.slice(0, 2)).toEqual([
      { tick: 0, data: [0xff, 0x51, 0x07, 0xa1, 0x20] },
      { tick: 0, data: [0xff, 0x58, 4, 2, 24, 8] },
    ])
  })

  it("lets a note end before the same key starts again at that tick", () => {
    const file = readMidiFile(
      writeMidiFile({
        ppq: 480,
        bpm: 120,
        tracks: [
          {
            name: "Lead",
            events: [
              { tick: 480, data: noteOn(1, 60, 100) },
              { tick: 0, data: noteOn(1, 60, 100) },
              { tick: 480, data: noteOff(1, 60) },
            ],
          },
        ],
      }),
    )
    expect(notes(file.tracks[1])).toEqual([
      { tick: 0, data: [0x90, 60, 100] },
      { tick: 480, data: [0x80, 60, 0] },
      { tick: 480, data: [0x90, 60, 100] },
    ])
  })
})

describe("exporting the sequence", () => {
  // a quarter-note step holding middle C, played by voice 1 in 8ths at half
  // length: the loop is the one recorded step
  const quarter = (): PatchJSON => {
    const patch = createDefaultPatch()
    patch.pace = "4th"
    patch.steps[0].notes = [60]
    return patch
  }
  const everything: MidiExportOptions = {
    voices: [0, 1, 2, 3],
    ccs: [],
    layout: "perVoice",
    passes: 1,
  }

  it("runs a pass through the steps its loop plays", () => {
    const patch = quarter()
    expect(passSteps(patch)).toBe(1)
    expect(exportBeats(patch, 3)).toBe(3)
    patch.steps[1].notes = [62]
    expect(passSteps(patch)).toBe(2)
  })

  it("writes each voice's notes on its channel, after its instrument", () => {
    const patch = quarter()
    patch.voices[0].program = 33
    const file = readMidiFile(exportMidi(patch, { ...everything, voices: [0] }))
    const [, voice] = file.tracks
    expect(voice.name).toBe("Voice 1")
    expect(voice.events[0]).toEqual({ tick: 0, data: [0xc0, 33] })
    // two 8ths at half length: an eighth of a beat each, in ticks
    expect(notes(voice)).toEqual([
      { tick: 0, data: [0x90, 60, 64] },
      { tick: 120, data: [0x80, 60, 0] },
      { tick: 240, data: [0x90, 60, 64] },
      { tick: 360, data: [0x80, 60, 0] },
    ])
  })

  it("plays as many passes as asked", () => {
    const file = readMidiFile(
      exportMidi(quarter(), { ...everything, voices: [0], passes: 3 }),
    )
    expect(notes(file.tracks[1])).toHaveLength(12)
  })

  it("leaves out the voices and CCs not chosen", () => {
    let patch = quarter()
    patch.voices[1].enabled = true
    patch.voices[1].channel = 5
    patch = addEnvelope(patch, 0, {
      cc: 74,
      channel: 2,
      points: [{ time: 0, value: 90 }],
    })

    const all = readMidiFile(
      exportMidi(patch, { ...everything, ccs: [{ cc: 74, channel: 2 }] }),
    )
    expect(all.tracks.map(({ name }) => name)).toEqual([
      "Tempo",
      "Voice 1",
      "Voice 2",
      "Voice 3",
      "Voice 4",
      "CCs",
    ])
    // voice 2 on its own channel; the CC on the envelope's
    expect(notes(all.tracks[2])[0].data[0]).toBe(0x94)
    expect(all.tracks[5].events).toEqual([{ tick: 0, data: [0xb1, 74, 90] }])

    const some = readMidiFile(
      exportMidi(patch, { ...everything, voices: [1], ccs: [] }),
    )
    expect(some.tracks.map(({ name }) => name)).toEqual(["Tempo", "Voice 2"])
  })

  it("comes out the same from the same seed", () => {
    const patch = quarter()
    patch.voices[0].rule = "random"
    patch.steps[0].notes = [60, 64, 67]
    const options = { ...everything, passes: 4, seed: 7 }
    expect(exportMidi(patch, options)).toEqual(exportMidi(patch, options))
  })

  it("releases a note still sounding at the end", () => {
    const patch = quarter()
    patch.voices[0].length = 1
    patch.voices[0].pace = "2nd"
    const [, voice] = readMidiFile(
      exportMidi(patch, { ...everything, voices: [0] }),
    ).tracks
    expect(notes(voice)).toEqual([
      { tick: 0, data: [0x90, 60, 64] },
      { tick: 480, data: [0x80, 60, 0] },
    ])
  })

  describe("its CCs", () => {
    const withCCs = () => {
      let patch = quarter()
      patch.steps[1].notes = [64]
      patch = addEnvelope(patch, 0, {
        cc: 74,
        channel: 2,
        points: [{ time: 0, value: 90 }],
      })
      patch = addEnvelope(patch, 1, {
        cc: 74,
        channel: 2,
        points: [{ time: 0, value: 30 }],
      })
      patch = addEnvelope(patch, 1, {
        cc: 1,
        channel: 1,
        points: [{ time: 0, value: 10 }],
      })
      return patch
    }

    it("lists each controller the sequence sends, once, with what sends it", () => {
      const patch = withCCs()
      patch.modOuts = patch.modOuts.map((mod) =>
        mod.source === "seqX" ? { ...mod, enabled: true, cc: 1 } : mod,
      )
      expect(sequenceCCs(patch)).toEqual([
        { cc: 1, channel: 1, steps: [1], mods: ["seqX"] },
        { cc: 74, channel: 2, steps: [0, 1], mods: [] },
      ])
    })

    it("writes only the controllers chosen", () => {
      const patch = withCCs()
      const ccs = (chosen: MidiExportOptions["ccs"]) =>
        readMidiFile(
          exportMidi(patch, { ...everything, voices: [], ccs: chosen }),
        ).tracks.at(-1)?.events ?? []

      expect(ccs([{ cc: 74, channel: 2 }])).toEqual([
        { tick: 0, data: [0xb1, 74, 90] },
        { tick: 480, data: [0xb1, 74, 30] },
      ])
      expect(ccs([{ cc: 1, channel: 1 }])).toEqual([
        { tick: 480, data: [0xb0, 1, 10] },
      ])
      // on another channel, CC 74 is another controller
      expect(ccs([{ cc: 74, channel: 1 }])).toEqual([])
    })
  })

  it("puts everything on one track when asked", () => {
    let patch = quarter()
    patch.voices[1].enabled = true
    patch.voices[1].channel = 5
    patch.name = "Bassline"
    patch = addEnvelope(patch, 0, {
      cc: 74,
      channel: 2,
      points: [{ time: 0, value: 90 }],
    })
    const file = readMidiFile(
      exportMidi(patch, {
        ...everything,
        voices: [0, 1],
        ccs: [{ cc: 74, channel: 2 }],
        layout: "combined",
      }),
    )
    expect(file.tracks.map(({ name }) => name)).toEqual(["Tempo", "Bassline"])
    const [, only] = file.tracks
    // both instruments, both voices' notes on their channels, and the CC
    expect(
      only.events
        .filter(({ data }) => (data[0] & 0xf0) === 0xc0)
        .map(({ data }) => data[0]),
    ).toEqual([0xc0, 0xc4])
    const channels = new Set(notes(only).map(({ data }) => data[0] & 0x0f))
    expect([...channels].sort()).toEqual([0, 4])
    expect(only.events).toContainEqual({ tick: 0, data: [0xb1, 74, 90] })
  })

  describe("one step", () => {
    // bar-long steps of 8ths, so step 2 comes in on each voice's ninth dot,
    // with its own brightness and step 1 a mod wheel
    const bars = () => {
      let patch = createDefaultPatch()
      patch.pace = "1bar"
      patch.steps[0].notes = [60]
      patch.steps[1].notes = [64]
      patch = addEnvelope(patch, 0, {
        cc: 1,
        channel: 1,
        points: [{ time: 0, value: 10 }],
      })
      patch = addEnvelope(patch, 1, {
        cc: 74,
        channel: 1,
        points: [
          { time: 0, value: 20 },
          { time: 2, value: 100 },
        ],
      })
      return patch
    }

    it("writes a step's own notes, from its start and a step long", () => {
      const [, voice] = readMidiFile(
        exportStepMidi(bars(), 1, { ...everything, voices: [0] }),
      ).tracks
      const played = notes(voice)
      // eight 8ths of E, the first at the file's start, the last released
      // within the bar
      expect(played.filter(({ data }) => data[0] === 0x90)).toHaveLength(8)
      expect(played[0]).toEqual({ tick: 0, data: [0x90, 64, 64] })
      expect(Math.max(...played.map(({ tick }) => tick))).toBeLessThanOrEqual(
        4 * 480,
      )
      expect(played.every(({ data }) => data[1] === 64)).toBe(true)
    })

    it("writes the step's CCs, and not another step's", () => {
      const file = readMidiFile(
        exportStepMidi(bars(), 1, {
          ...everything,
          voices: [],
          ccs: [
            { cc: 74, channel: 1 },
            { cc: 1, channel: 1 },
          ],
        }),
      )
      const ccs = file.tracks.at(-1)?.events ?? []
      expect(ccs[0]).toEqual({ tick: 0, data: [0xb0, 74, 20] })
      expect(ccs.some(({ data }) => data[1] === 1)).toBe(false)
      // it rises to 100 by beat 2
      expect(ccs).toContainEqual({ tick: 960, data: [0xb0, 74, 100] })
    })

    it("names the one track for the step", () => {
      const patch = bars()
      patch.name = "Bassline"
      const file = readMidiFile(
        exportStepMidi(patch, 1, { ...everything, layout: "combined" }),
      )
      expect(file.tracks.map(({ name }) => name)).toEqual([
        "Tempo",
        "Bassline step 2",
      ])
    })

    it("lists only that step's CCs, with the mods every step sends", () => {
      const patch = bars()
      patch.modOuts = patch.modOuts.map((mod) =>
        mod.source === "phase" ? { ...mod, enabled: true, cc: 20 } : mod,
      )
      expect(
        sequenceCCs(patch, [1]).map(({ cc, channel }) => [cc, channel]),
      ).toEqual([
        [20, 1],
        [74, 1],
      ])
    })
  })
})
