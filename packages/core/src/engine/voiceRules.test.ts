import { describe, expect, it } from "vitest"
import { VOICE_RULES } from "../entities/modulation"
import { VoiceIndex, VoiceRule } from "../entities/types"
import { createRng } from "./rng"
import {
  initialCursor,
  pickNote,
  RuleCursor,
  rulePositions,
} from "./voiceRules"

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

  it("outside in and inside out visit each note from their respective starting points", () => {
    expect(play("outsidein", 8)).toEqual([60, 72, 64, 67, 60, 72, 64, 67])
    expect(play("insideout", 8)).toEqual([64, 67, 60, 72, 64, 67, 60, 72])
    expect(play("outsidein", 6, [60, 64, 67])).toEqual([60, 67, 64, 60, 67, 64])
    expect(play("insideout", 6, [60, 64, 67])).toEqual([64, 67, 60, 64, 67, 60])
  })

  it("ends alternates the lowest and highest notes", () => {
    expect(play("ends", 6)).toEqual([60, 72, 60, 72, 60, 72])
  })

  it("shuffle plays each note once per cycle and avoids a repeat at the boundary", () => {
    const played = play("shuffle", 40) as number[]
    for (let start = 0; start < played.length; start += NOTES.length) {
      expect(
        [...played.slice(start, start + NOTES.length)].sort((a, b) => a - b),
      ).toEqual(NOTES)
      if (start > 0) expect(played[start]).not.toBe(played[start - 1])
    }
  })

  it("walk moves one note position at a time without wrapping", () => {
    const played = play("walk", 50) as number[]
    for (let index = 1; index < played.length; index++) {
      expect(
        Math.abs(
          NOTES.indexOf(played[index]) - NOTES.indexOf(played[index - 1]),
        ),
      ).toBe(1)
    }
  })

  it("no repeat picks randomly without playing the same note twice in a row", () => {
    const played = play("norepeat", 50) as number[]
    for (let index = 1; index < played.length; index++) {
      expect(NOTES).toContain(played[index])
      expect(played[index]).not.toBe(played[index - 1])
    }
  })

  it("no repeat avoids the same pitch when the chord changes", () => {
    const rng = createRng(1)
    const first = pickNote(
      "norepeat",
      NOTES,
      initialCursor("norepeat", 4),
      0,
      rng,
    )
    const previous = first.note as number
    const changed = [previous - 1, previous, previous + 1]
    const next = pickNote("norepeat", changed, first.cursor, 0, rng)
    expect(next.note).not.toBe(previous)
  })

  it("copes with one note and with none", () => {
    for (const rule of [
      "up",
      "updown",
      "rise",
      "fall",
      "downup+",
      "outsidein",
      "insideout",
      "ends",
      "shuffle",
      "walk",
      "norepeat",
    ] as const) {
      expect(play(rule, 3, [60])).toEqual([60, 60, 60])
      expect(play(rule, 2, [])).toEqual([null, null])
    }
  })
})

describe("rulePositions", () => {
  it("names exactly the positions pickNote comes to", () => {
    for (const rule of VOICE_RULES) {
      for (let count = 0; count <= 4; count++) {
        for (const voice of [0, 1, 2, 3] as const) {
          const notes = NOTES.slice(0, count)
          const played = new Set(
            play(rule, 200, notes, voice).map((note) =>
              notes.indexOf(note as number),
            ),
          )
          played.delete(-1)
          expect(rulePositions(rule, count, voice), `${rule} ${count}`).toEqual(
            [...played].sort(),
          )
        }
      }
    }
  })
})
