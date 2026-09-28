import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON } from "../entities/types"
import {
  gridRows,
  gridWidth,
  loopEndIndex,
  playableSteps,
  viewIndex,
} from "./loopRange"

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
    patch.size = 16
    expect(loopEndIndex(patch)).toBe(15)
  })

  it("custom uses the chosen end, capped to the grid", () => {
    const patch = patchWith({ 0: [60] })
    patch.loop = { mode: "custom", end: 5 }
    expect(loopEndIndex(patch)).toBe(5)

    patch.size = 16
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
    expect(viewIndex(1, 64, false)).toBe(1)
    expect(viewIndex(1, 64, true)).toBe(8)
    expect(viewIndex(8, 64, true)).toBe(1)
    expect(viewIndex(1, 16, true)).toBe(4)
    expect(viewIndex(5, 16, true)).toBe(5)
  })

  it("reads a grid with a short last row a column at a time", () => {
    // 0 1 2
    // 3 4
    const read = (size: number) =>
      Array.from({ length: size }, (_, index) => viewIndex(index, size, true))
    expect(read(5)).toEqual([0, 3, 1, 4, 2])
    // 0 1 2 3
    // 4 5 6 7
    // 8 9
    expect(read(10)).toEqual([0, 4, 8, 1, 5, 9, 2, 6, 3, 7])
    expect(read(1)).toEqual([0])
  })

  it("visits every step once, flipped or not, at any size", () => {
    for (let size = 1; size <= 64; size++) {
      const read = Array.from({ length: size }, (_, index) =>
        viewIndex(index, size, true),
      )
      expect(
        [...read].sort((a, b) => a - b),
        `size ${size}`,
      ).toEqual(Array.from({ length: size }, (_, index) => index))
    }
  })
})

describe("the grid's shape", () => {
  it("is as near square as the steps allow", () => {
    expect([gridWidth(16), gridRows(16)]).toEqual([4, 4])
    expect([gridWidth(64), gridRows(64)]).toEqual([8, 8])
    expect([gridWidth(1), gridRows(1)]).toEqual([1, 1])
    expect([gridWidth(5), gridRows(5)]).toEqual([3, 2])
    expect([gridWidth(17), gridRows(17)]).toEqual([5, 4])
  })
})
