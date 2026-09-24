import { describe, expect, it } from "vitest"
import { CC_NAMES, ccName, isControlPosition } from "./ccNames"

describe("CC names", () => {
  it("covers every controller", () => {
    expect(CC_NAMES).toHaveLength(128)
  })

  it("puts the well-known ones at their own number", () => {
    expect(ccName(1)).toBe("Modulation Wheel (MSB)")
    expect(ccName(7)).toBe("Volume (MSB)")
    expect(ccName(10)).toBe("Pan Position (MSB)")
    expect(ccName(11)).toBe("Expression (MSB)")
    expect(ccName(64)).toBe("Hold Pedal")
    expect(ccName(74)).toBe("Brightness")
    expect(ccName(91)).toBe("Reverb Level")
    expect(ccName(123)).toBe("All Notes Off")
    expect(ccName(127)).toBe("Poly Operation")
  })
})

describe("isControlPosition", () => {
  it("takes what knobs, faders, wheels and pedals send", () => {
    for (const cc of [1, 2, 7, 10, 11, 64, 71, 74, 91, 119]) {
      expect(isControlPosition(cc)).toBe(true)
    }
  })

  it("leaves out the channel mode messages, which are commands", () => {
    for (let cc = 120; cc <= 127; cc++) {
      expect(isControlPosition(cc)).toBe(false)
    }
  })

  it("leaves out the numbers that only mean something in sequence", () => {
    for (const cc of [0, 32, 6, 38, 96, 97, 98, 99, 100, 101]) {
      expect(isControlPosition(cc)).toBe(false)
    }
  })
})
