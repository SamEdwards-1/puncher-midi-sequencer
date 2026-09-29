import { describe, expect, it } from "vitest"
import { generatePatchName } from "./patchName"

describe("generatePatchName", () => {
  it("is two capitalised words", () => {
    for (let index = 0; index < 50; index++) {
      expect(generatePatchName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    }
  })

  it("takes the first and last words at the ends of the range", () => {
    expect(generatePatchName(() => 0)).toBe("Amber Anchor")
    expect(generatePatchName(() => 0.999999)).toBe("Winter Wren")
  })

  it("varies", () => {
    const names = new Set(Array.from({ length: 20 }, () => generatePatchName()))
    expect(names.size).toBeGreaterThan(1)
  })
})
