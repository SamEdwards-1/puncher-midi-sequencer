import { describe, expect, it } from "vitest"
import { CC_NAMES, ccName } from "./ccNames"

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
