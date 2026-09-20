import { describe, expect, it, vi } from "vitest"
import { MIDIInput, MIDIInputPort, parseNoteMessage } from "./MIDIInput"

describe("parseNoteMessage", () => {
  it("reads note on and note off with 1-based channels", () => {
    expect(parseNoteMessage([0x90, 60, 100])).toEqual({
      type: "noteOn",
      channel: 1,
      note: 60,
      velocity: 100,
    })
    expect(parseNoteMessage([0x8f, 60, 0])).toEqual({
      type: "noteOff",
      channel: 16,
      note: 60,
      velocity: 0,
    })
  })

  it("treats note on at velocity 0 as note off", () => {
    expect(parseNoteMessage([0x90, 60, 0])?.type).toBe("noteOff")
  })

  it("ignores everything else", () => {
    expect(parseNoteMessage([0xb0, 74, 10])).toBeNull()
    expect(parseNoteMessage([0xf8])).toBeNull()
  })
})

describe("MIDIInput", () => {
  it("passes notes from the chosen port to listeners", () => {
    const input = new MIDIInput()
    const listener = vi.fn()
    input.on(listener)

    const port: MIDIInputPort = { onmidimessage: null }
    input.setPort(port)
    port.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) })

    expect(listener).toHaveBeenCalledWith({
      type: "noteOn",
      channel: 1,
      note: 60,
      velocity: 100,
    })
  })

  it("lets go of the previous port", () => {
    const input = new MIDIInput()
    const first: MIDIInputPort = { onmidimessage: null }
    const second: MIDIInputPort = { onmidimessage: null }
    input.setPort(first)
    input.setPort(second)

    expect(first.onmidimessage).toBeNull()
    expect(second.onmidimessage).not.toBeNull()

    input.setPort(null)
    expect(second.onmidimessage).toBeNull()
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
