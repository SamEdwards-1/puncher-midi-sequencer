import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON } from "../entities/types"
import { loopEndIndex, playableSteps, viewIndex } from "./loopRange"

const patchWith = (notes: Record<number, number[]>): PatchJSON => {
  const patch = createDefaultPatch()
  for (const [index, value] of Object.entries(notes)) {
    patch.steps[Number(index)].notes = value
  }
  return patch
}

describe("loopEndIndex", () => {
  it("recorded stops at the last step holding anything", () => {
    const patch = patchWith({ 0: [60], 5: [62] })
    expect(loopEndIndex(patch)).toBe(5)

    patch.steps[9].state = "rest"
    expect(loopEndIndex(patch)).toBe(9)

    // an envelope with no points sends nothing, so it doesn't count
    patch.steps[14].envelopes = [{ id: 2, cc: 74, channel: 1, points: [] }]
    expect(loopEndIndex(patch)).toBe(9)

    patch.steps[12].envelopes = [
      { id: 1, cc: 74, channel: 1, points: [{ time: 0, value: 100 }] },
    ]
    expect(loopEndIndex(patch)).toBe(12)
  })

  it("recorded falls back to step 0 when nothing is recorded", () => {
    expect(loopEndIndex(createDefaultPatch())).toBe(0)
  })

  it("all uses the whole grid for the current size", () => {
    const patch = patchWith({ 0: [60] })
    patch.loop.mode = "all"
    expect(loopEndIndex(patch)).toBe(63)
    patch.size = "small"
    expect(loopEndIndex(patch)).toBe(15)
  })

  it("custom uses the chosen end, capped to the grid", () => {
    const patch = patchWith({ 0: [60] })
    patch.loop = { mode: "custom", end: 5 }
    expect(loopEndIndex(patch)).toBe(5)

    patch.size = "small"
    patch.loop.end = 40
    expect(loopEndIndex(patch)).toBe(15)
  })
})

describe("playableSteps", () => {
  it("leaves out skipped steps", () => {
    const patch = patchWith({ 0: [60], 3: [62] })
    patch.steps[1].state = "skip"
    expect(playableSteps(patch, false)).toEqual([0, 2, 3])
  })

  it("applies flip when reading step state", () => {
    const patch = patchWith({ 0: [60], 9: [62] })
    // stored step 8 is (row 1, col 0); flipped it is visited at position 1
    patch.steps[8].state = "skip"
    expect(playableSteps(patch, false)).toContain(1)
    expect(playableSteps(patch, true)).not.toContain(1)
  })
})

describe("viewIndex", () => {
  it("swaps rows and columns when flipped", () => {
    expect(viewIndex(1, "large", false)).toBe(1)
    expect(viewIndex(1, "large", true)).toBe(8)
    expect(viewIndex(8, "large", true)).toBe(1)
    expect(viewIndex(1, "small", true)).toBe(4)
    expect(viewIndex(5, "small", true)).toBe(5)
  })
})
