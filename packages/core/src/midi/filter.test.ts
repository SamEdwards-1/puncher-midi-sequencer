import { describe, expect, it } from "vitest"
import {
  createDefaultMIDIFilter,
  filterMIDIMessage,
  MIDIFilterJSON,
} from "./filter"

const note = (note: number, channel = 1) =>
  ({ type: "noteOn", channel, note, velocity: 100 }) as const

const cc = (cc: number, channel = 1) =>
  ({ type: "cc", channel, cc, value: 64 }) as const

const filter = (changes: Partial<MIDIFilterJSON> = {}): MIDIFilterJSON => ({
  ...createDefaultMIDIFilter(),
  ...changes,
})

describe("filterMIDIMessage", () => {
  it("lets everything through by default", () => {
    expect(filterMIDIMessage(note(60), filter())).toEqual(note(60))
    expect(filterMIDIMessage(cc(74), filter())).toEqual(cc(74))
  })

  it("keeps only the channels it listens on", () => {
    const only3 = filter({ channels: [3] })
    expect(filterMIDIMessage(note(60, 3), only3)).toEqual(note(60, 3))
    expect(filterMIDIMessage(note(60, 1), only3)).toBeNull()
    expect(filterMIDIMessage(cc(74, 1), only3)).toBeNull()
    // no channels at all means nothing gets in
    expect(filterMIDIMessage(note(60), filter({ channels: [] }))).toBeNull()
  })

  it("keeps only the notes inside the range", () => {
    const middle = filter({ noteLow: 48, noteHigh: 72 })
    expect(filterMIDIMessage(note(48), middle)).toEqual(note(48))
    expect(filterMIDIMessage(note(72), middle)).toEqual(note(72))
    expect(filterMIDIMessage(note(47), middle)).toBeNull()
    expect(filterMIDIMessage(note(73), middle)).toBeNull()
  })

  it("transposes what it lets through", () => {
    expect(filterMIDIMessage(note(60), filter({ transpose: 12 }))).toEqual(
      note(72),
    )
    expect(filterMIDIMessage(note(60), filter({ transpose: -12 }))).toEqual(
      note(48),
    )
  })

  it("judges the range before transposing, so a note-off always matches", () => {
    const up = filter({ noteLow: 60, noteHigh: 72, transpose: 12 })
    // 60 is inside the range and comes out as 72
    expect(filterMIDIMessage(note(60), up)).toEqual(note(72))
    // and 72, which 60 became, is judged on what arrived rather than on that
    expect(filterMIDIMessage(note(72), up)).toEqual(note(84))
    expect(filterMIDIMessage(note(59), up)).toBeNull()
  })

  it("drops a note transposed out of MIDI's range", () => {
    expect(filterMIDIMessage(note(120), filter({ transpose: 12 }))).toBeNull()
    expect(filterMIDIMessage(note(5), filter({ transpose: -12 }))).toBeNull()
  })

  it("keeps only the controllers it allows, untransposed", () => {
    const some = filter({ ccs: [1, 74], transpose: 12 })
    expect(filterMIDIMessage(cc(74), some)).toEqual(cc(74))
    expect(filterMIDIMessage(cc(7), some)).toBeNull()
  })
})
