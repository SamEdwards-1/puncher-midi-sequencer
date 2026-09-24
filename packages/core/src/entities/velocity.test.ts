import { describe, expect, it } from "vitest"
import {
  playedVelocity,
  shownAccent,
  typedVelocityToDot,
  velocityToDot,
} from "./velocity"

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

    it("within a quarter of the accent amount of one snap onto it", () => {
      // 20 / 4: five either side
      expect(toDot(89)).toEqual({ accent: "+", velocityOffset: 0 })
      expect(toDot(79)).toEqual({ accent: "+", velocityOffset: 0 })
      expect(toDot(39)).toEqual({ accent: "-", velocityOffset: 0 })
      // but not six
      expect(toDot(90)).toEqual({ accent: "none", velocityOffset: 26 })
      // a larger accent amount pulls from further off
      expect(velocityToDot(64, 40, 96)).toEqual({
        accent: "+",
        velocityOffset: 0,
      })
    })

    it("near the voice's own snap onto a plain dot", () => {
      expect(toDot(64)).toEqual(plain)
      expect(toDot(69)).toEqual(plain)
      expect(toDot(59)).toEqual(plain)
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

    const own = (velocityOffset: number, accentAmount = 20) =>
      shownAccent(64, accentAmount, { accent: "none", velocityOffset })

    it("as the level a dot's own velocity is nearest", () => {
      // past halfway to an accent, it reads as that accent
      expect(own(11)).toBe("+")
      expect(own(58)).toBe("+")
      expect(own(-11)).toBe("-")
      expect(own(-60)).toBe("-")
      // short of halfway, it is still the voice's own
      expect(own(9)).toBe("none")
      expect(own(-9)).toBe("none")
    })

    it("as plain exactly halfway, so only a clear lean reads as an accent", () => {
      expect(own(10)).toBe("none")
      expect(own(-10)).toBe("none")
    })

    it("again when the accent amount moves under it", () => {
      expect(own(20, 20)).toBe("+")
      expect(own(20, 50)).toBe("none")
    })

    it("as plain for a plain dot, even where accents are clipped to it", () => {
      expect(shownAccent(127, 20, plain)).toBe("none")
    })
  })

  it("keep a typed velocity exactly, an accent only when it lands on one", () => {
    const typed = (velocity: number) => typedVelocityToDot(64, 20, velocity)
    expect(typed(84)).toEqual({ accent: "+", velocityOffset: 0 })
    expect(typed(64)).toEqual(plain)
    // near an accent, but not on it: no snap, unlike a drawn velocity
    expect(typed(83)).toEqual({ accent: "none", velocityOffset: 19 })
    expect(typed(200)).toEqual({ accent: "none", velocityOffset: 63 })
  })
})
