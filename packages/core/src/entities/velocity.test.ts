import { describe, expect, it } from "vitest"
import { playedVelocity, shownAccent, velocityToDot } from "./velocity"

// a voice at 64 with an accent amount of 20: accents at 84 and 44
const toDot = (velocity: number) => velocityToDot(64, 20, velocity)
const plain = { accent: "none" as const, velocityOffset: 0 }

describe("dot velocities", () => {
  it("play at the voice's velocity, moved by the dot's offset and accent", () => {
    expect(playedVelocity(64, 20, plain)).toBe(64)
    expect(playedVelocity(64, 20, { accent: "+", velocityOffset: 0 })).toBe(84)
    expect(playedVelocity(64, 20, { accent: "-", velocityOffset: 5 })).toBe(49)
    expect(playedVelocity(64, 20, { accent: "none", velocityOffset: 7 })).toBe(
      71,
    )
  })

  it("never play outside 1 to 127", () => {
    expect(playedVelocity(120, 20, { accent: "+", velocityOffset: 0 })).toBe(
      127,
    )
    expect(playedVelocity(10, 20, { accent: "-", velocityOffset: 0 })).toBe(1)
  })

  describe("drawn", () => {
    it("on an accent's velocity make that accent", () => {
      expect(toDot(84)).toEqual({ accent: "+", velocityOffset: 0 })
      expect(toDot(44)).toEqual({ accent: "-", velocityOffset: 0 })
    })

    it("a couple either side of one still make it", () => {
      expect(toDot(86)).toEqual({ accent: "+", velocityOffset: 0 })
      expect(toDot(82)).toEqual({ accent: "+", velocityOffset: 0 })
      expect(toDot(42)).toEqual({ accent: "-", velocityOffset: 0 })
      // but not three
      expect(toDot(87)).toEqual({ accent: "none", velocityOffset: 23 })
    })

    it("near the voice's own make a plain dot", () => {
      expect(toDot(64)).toEqual(plain)
      expect(toDot(66)).toEqual(plain)
      expect(toDot(62)).toEqual(plain)
    })

    it("anywhere else are the dot's own, as an offset from the voice's", () => {
      expect(toDot(71)).toEqual({ accent: "none", velocityOffset: 7 })
      expect(toDot(20)).toEqual({ accent: "none", velocityOffset: -44 })
      // and play back as drawn
      expect(playedVelocity(64, 20, toDot(71))).toBe(71)
    })

    it("never below 1, which would be a note-off", () => {
      expect(toDot(0)).toEqual({ accent: "none", velocityOffset: -63 })
    })

    it("stay plain where a small accent amount crowds the levels", () => {
      // accents at 65 and 63: 64 is plain, 65 the accent
      expect(velocityToDot(64, 1, 64)).toEqual(plain)
      expect(velocityToDot(64, 1, 65)).toEqual({
        accent: "+",
        velocityOffset: 0,
      })
    })

    it("count an accent clipped at the top of the range", () => {
      // 120 + 20 plays as 127
      expect(velocityToDot(120, 20, 127)).toEqual({
        accent: "+",
        velocityOffset: 0,
      })
    })
  })

  describe("shown", () => {
    it("as the accent a dot was given", () => {
      expect(shownAccent(64, 20, { accent: "+", velocityOffset: 0 })).toBe("+")
      expect(shownAccent(64, 20, plain)).toBe("none")
    })

    it("as an accent where a dot's own velocity lands on or near one", () => {
      expect(shownAccent(64, 20, { accent: "none", velocityOffset: 20 })).toBe(
        "+",
      )
      expect(shownAccent(64, 20, { accent: "none", velocityOffset: -19 })).toBe(
        "-",
      )
      // once the accent amount moves under it
      expect(shownAccent(64, 25, { accent: "none", velocityOffset: 20 })).toBe(
        "none",
      )
    })

    it("as plain for a velocity between the levels", () => {
      expect(shownAccent(64, 20, { accent: "none", velocityOffset: 7 })).toBe(
        "none",
      )
    })

    it("as plain for a plain dot, even where accents are clipped to it", () => {
      expect(shownAccent(127, 20, plain)).toBe("none")
    })
  })
})
