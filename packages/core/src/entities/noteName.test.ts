import { describe, expect, it } from "vitest"
import { noteNameToNumber, noteNumberToName } from "./noteName"

describe("noteNumberToName", () => {
  it("uses C4 = 60", () => {
    expect(noteNumberToName(60)).toBe("C4")
    expect(noteNumberToName(61)).toBe("C#4")
    expect(noteNumberToName(0)).toBe("C-1")
    expect(noteNumberToName(127)).toBe("G9")
  })
})

describe("noteNameToNumber", () => {
  it("parses names, sharps, and flats", () => {
    expect(noteNameToNumber("C4")).toBe(60)
    expect(noteNameToNumber("c#4")).toBe(61)
    expect(noteNameToNumber("Db4")).toBe(61)
    expect(noteNameToNumber("C-1")).toBe(0)
  })

  it("rejects invalid or out-of-range names", () => {
    expect(noteNameToNumber("H4")).toBeNull()
    expect(noteNameToNumber("C")).toBeNull()
    expect(noteNameToNumber("Cb-1")).toBeNull()
    expect(noteNameToNumber("G#9")).toBeNull()
  })

  it("round-trips every MIDI note", () => {
    for (let n = 0; n <= 127; n++) {
      expect(noteNameToNumber(noteNumberToName(n))).toBe(n)
    }
  })
})
