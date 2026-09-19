import { describe, expect, it } from "vitest"
import { VoiceIndex, VoiceRule } from "../entities/types"
import { createRng } from "./rng"
import { initialCursor, pickNote, RuleCursor } from "./voiceRules"

const NOTES = [60, 64, 67, 72]

const play = (
  rule: VoiceRule,
  count: number,
  notes = NOTES,
  voiceIndex: VoiceIndex = 0,
) => {
  const rng = createRng(1)
  let cursor: RuleCursor = initialCursor(rule, notes.length)
  const played: (number | null)[] = []
  for (let i = 0; i < count; i++) {
    const result = pickNote(rule, notes, cursor, voiceIndex, rng)
    cursor = result.cursor
    played.push(result.note)
  }
  return played
}

describe("pickNote", () => {
  it("nth plays the note matching the voice, clamped to the top", () => {
    expect(play("nth", 1, NOTES, 0)).toEqual([60])
    expect(play("nth", 1, NOTES, 2)).toEqual([67])
    expect(play("nth", 2, [60, 64], 3)).toEqual([64, 64])
  })

  it("lowest and highest stay put", () => {
    expect(play("lowest", 3)).toEqual([60, 60, 60])
    expect(play("highest", 3)).toEqual([72, 72, 72])
  })

  it("up and down wrap around", () => {
    expect(play("up", 6)).toEqual([60, 64, 67, 72, 60, 64])
    expect(play("down", 6)).toEqual([72, 67, 64, 60, 72, 67])
  })

  it("updown and downup turn without repeating the end notes", () => {
    expect(play("updown", 8)).toEqual([60, 64, 67, 72, 67, 64, 60, 64])
    expect(play("downup", 8)).toEqual([72, 67, 64, 60, 64, 67, 72, 67])
  })

  it("updown+ and downup+ repeat the end notes", () => {
    expect(play("updown+", 9)).toEqual([60, 64, 67, 72, 72, 67, 64, 60, 60])
    expect(play("downup+", 9)).toEqual([72, 67, 64, 60, 60, 64, 67, 72, 72])
  })

  it("rise goes up two and down one", () => {
    expect(play("rise", 6)).toEqual([60, 67, 64, 72, 67, 60])
  })

  it("fall goes down two and up one", () => {
    expect(play("fall", 6)).toEqual([72, 64, 67, 60, 64, 72])
  })

  it("random stays inside the step's notes", () => {
    for (const note of play("random", 50)) {
      expect(NOTES).toContain(note)
    }
  })

  it("copes with one note and with none", () => {
    for (const rule of ["up", "updown", "rise", "fall", "downup+"] as const) {
      expect(play(rule, 3, [60])).toEqual([60, 60, 60])
    }
    expect(play("up", 2, [])).toEqual([null, null])
  })
})
