import { createDefaultMIDIFilter } from "@midiseq/core"
import { describe, expect, it, vi } from "vitest"
import {
  MIDIInput,
  MIDIInputPort,
  parseInputMessage,
  parseNoteMessage,
} from "./MIDIInput"

describe("parseInputMessage", () => {
  it("reads note on and note off with 1-based channels", () => {
    expect(parseInputMessage([0x90, 60, 100])).toEqual({
      type: "noteOn",
      channel: 1,
      note: 60,
      velocity: 100,
    })
    expect(parseInputMessage([0x8f, 60, 0])).toEqual({
      type: "noteOff",
      channel: 16,
      note: 60,
      velocity: 0,
    })
  })

  it("treats note on at velocity 0 as note off", () => {
    expect(parseInputMessage([0x90, 60, 0])?.type).toBe("noteOff")
  })

  it("reads controllers", () => {
    expect(parseInputMessage([0xb2, 74, 10])).toEqual({
      type: "cc",
      channel: 3,
      cc: 74,
      value: 10,
    })
  })

  it("reads the clock tick a tempo can be read from", () => {
    expect(parseInputMessage([0xf8])).toEqual({ type: "clock" })
  })

  it("ignores everything else", () => {
    expect(parseInputMessage([0xf1, 0x00])).toBeNull()
    // start and stop are not ours to obey
    expect(parseInputMessage([0xfa])).toBeNull()
    expect(parseInputMessage([0xfc])).toBeNull()
    expect(parseInputMessage([])).toBeNull()
    // notes only, for the callers that want just those
    expect(parseNoteMessage([0xb0, 74, 10])).toBeNull()
    expect(parseNoteMessage([0xf8])).toBeNull()
    expect(parseNoteMessage([0x90, 60, 100])?.type).toBe("noteOn")
  })
})

describe("MIDIInput", () => {
  const openPort = (): MIDIInputPort => ({ onmidimessage: null })

  it("passes notes from every open port to listeners", () => {
    const input = new MIDIInput()
    const listener = vi.fn()
    input.on(listener)

    const first = openPort()
    const second = openPort()
    input.setPorts([first, second])
    first.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) })
    second.onmidimessage?.({ data: new Uint8Array([0x90, 64, 100]) })

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith({
      type: "noteOn",
      channel: 1,
      note: 64,
      velocity: 100,
    })
  })

  it("lets go of a port that is no longer chosen, and keeps the rest", () => {
    const input = new MIDIInput()
    const first = openPort()
    const second = openPort()
    input.setPorts([first, second])
    const stillOpen = second.onmidimessage

    input.setPorts([second])
    expect(first.onmidimessage).toBeNull()
    // the one that stayed is not disturbed
    expect(second.onmidimessage).toBe(stillOpen)

    input.setPorts([])
    expect(second.onmidimessage).toBeNull()
  })

  it("only hands on what the filter allows", () => {
    const input = new MIDIInput()
    const listener = vi.fn()
    input.on(listener)
    input.setFilter({
      ...createDefaultMIDIFilter(),
      channels: [2],
      noteLow: 60,
      noteHigh: 72,
      transpose: 12,
      ccs: [74],
    })

    // wrong channel
    input.handleMessage([0x90, 64, 100])
    // below the range
    input.handleMessage([0x91, 48, 100])
    // a controller that isn't allowed
    input.handleMessage([0xb1, 7, 100])
    expect(listener).not.toHaveBeenCalled()

    input.handleMessage([0x91, 64, 100])
    expect(listener).toHaveBeenCalledWith({
      type: "noteOn",
      channel: 2,
      note: 76,
      velocity: 100,
    })

    input.handleMessage([0xb1, 74, 30])
    expect(listener).toHaveBeenLastCalledWith({
      type: "cc",
      channel: 2,
      cc: 74,
      value: 30,
    })
  })

  it("stops calling a listener that unsubscribed", () => {
    const input = new MIDIInput()
    const listener = vi.fn()
    const off = input.on(listener)
    off()
    input.handleMessage([0x90, 60, 100])
    expect(listener).not.toHaveBeenCalled()
  })
})
