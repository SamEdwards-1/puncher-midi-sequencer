import { describe, expect, it } from "vitest"
import { AllOutDedupe } from "./AllOutDedupe"

const ON = [0x90, 60, 100]
const OFF = [0x80, 60, 0]

describe("AllOutDedupe", () => {
  it("sends one note-on when two voices start the same note together", () => {
    const dedupe = new AllOutDedupe()
    expect(dedupe.noteOn(0, 1, 60, 100, 10)).toEqual([ON])
    expect(dedupe.noteOn(1, 1, 60, 100, 10)).toEqual([])
  })

  it("sends a note-off before retriggering a held note", () => {
    const dedupe = new AllOutDedupe()
    dedupe.noteOn(0, 1, 60, 100, 10)
    expect(dedupe.noteOn(1, 1, 60, 100, 20)).toEqual([OFF, ON])
  })

  it("releases only when the last holding voice lets go", () => {
    const dedupe = new AllOutDedupe()
    dedupe.noteOn(0, 1, 60, 100, 10)
    dedupe.noteOn(1, 1, 60, 100, 10)
    expect(dedupe.noteOff(0, 1, 60)).toEqual([])
    expect(dedupe.noteOff(1, 1, 60)).toEqual([OFF])
    expect(dedupe.noteOff(1, 1, 60)).toEqual([])
  })

  it("treats channels independently", () => {
    const dedupe = new AllOutDedupe()
    expect(dedupe.noteOn(0, 1, 60, 100, 10)).toHaveLength(1)
    expect(dedupe.noteOn(1, 2, 60, 100, 10)).toHaveLength(1)
  })

  it("lists and forgets held notes", () => {
    const dedupe = new AllOutDedupe()
    dedupe.noteOn(0, 2, 64, 100, 0)
    expect(dedupe.heldNotes()).toEqual([{ channel: 2, note: 64 }])
    dedupe.reset()
    expect(dedupe.heldNotes()).toEqual([])
  })
})
