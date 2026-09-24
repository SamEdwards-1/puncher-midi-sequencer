import { describe, expect, it } from "vitest"
import { parseNoteText, sanitizeNoteText } from "./noteInput"

describe("sanitizeNoteText", () => {
  it("keeps only what a note name is made of", () => {
    expect(sanitizeNoteText("C#4")).toBe("C#4")
    expect(sanitizeNoteText("c b -1")).toBe("cb-1")
    expect(sanitizeNoteText("X!*z9")).toBe("9")
    expect(sanitizeNoteText("C#4444444")).toBe("C#444")
  })
})

describe("parseNoteText", () => {
  it("reads a name with its octave", () => {
    expect(parseNoteText("C4", 60)).toBe(60)
    expect(parseNoteText("c#4", 60)).toBe(61)
    expect(parseNoteText("Db4", 60)).toBe(61)
    expect(parseNoteText("C-1", 60)).toBe(0)
    expect(parseNoteText(" G9 ", 60)).toBe(127)
  })

  it("keeps the octave it is already on when none is typed", () => {
    expect(parseNoteText("G", 60)).toBe(67)
    expect(parseNoteText("g", 60)).toBe(67)
    expect(parseNoteText("F#", 60)).toBe(66)
    // from C#4, a bare letter stays in octave 4
    expect(parseNoteText("A", 61)).toBe(69)
    // and from the bottom of the range, in octave -1
    expect(parseNoteText("D", 2)).toBe(2)
  })

  it("refuses what is not a note, leaving the field alone", () => {
    expect(parseNoteText("", 60)).toBeNull()
    expect(parseNoteText("H4", 60)).toBeNull()
    expect(parseNoteText("4", 60)).toBeNull()
    expect(parseNoteText("-", 60)).toBeNull()
  })

  it("refuses an octave outside MIDI's range", () => {
    expect(parseNoteText("C10", 60)).toBeNull()
    expect(parseNoteText("G#9", 60)).toBeNull()
    expect(parseNoteText("Cb-1", 60)).toBeNull()
  })
})
