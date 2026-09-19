import { describe, expect, it } from "vitest"
import {
  allNotesOffBytes,
  controlChangeBytes,
  noteOffBytes,
  noteOnBytes,
} from "./messages"

describe("MIDI messages", () => {
  it("encodes channel voice messages with 1-based channels", () => {
    expect(noteOnBytes(1, 60, 100)).toEqual([0x90, 60, 100])
    expect(noteOnBytes(16, 60, 100)).toEqual([0x9f, 60, 100])
    expect(noteOffBytes(2, 64)).toEqual([0x81, 64, 0])
    expect(controlChangeBytes(10, 74, 127)).toEqual([0xb9, 74, 127])
  })

  it("encodes All Notes Off as CC 123", () => {
    expect(allNotesOffBytes(3)).toEqual([0xb2, 123, 0])
  })

  it("keeps data bytes within 7 bits", () => {
    expect(noteOnBytes(1, 200, 300)).toEqual([0x90, 200 & 0x7f, 300 & 0x7f])
  })
})
