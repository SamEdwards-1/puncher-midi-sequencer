import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { ModOutJSON } from "../entities/types"
import { recordedExtent, scaleModValue, sequencerModValues } from "./modOuts"

const modOut = (min: number, max: number): ModOutJSON => ({
  source: "seqX",
  enabled: true,
  cc: 20,
  min,
  max,
  smoothing: 0,
})

describe("scaleModValue", () => {
  it("maps 0..1 onto the output range", () => {
    expect(scaleModValue(0, modOut(0, 127))).toBe(0)
    expect(scaleModValue(1, modOut(0, 127))).toBe(127)
    expect(scaleModValue(0.5, modOut(0, 100))).toBe(50)
  })

  it("supports inverted ranges and clamps out-of-range readings", () => {
    expect(scaleModValue(0, modOut(127, 0))).toBe(127)
    expect(scaleModValue(1, modOut(127, 0))).toBe(0)
    expect(scaleModValue(2, modOut(0, 127))).toBe(127)
    expect(scaleModValue(-1, modOut(0, 127))).toBe(0)
  })
})

describe("sequencerModValues", () => {
  it("reads x and y against the greatest recorded index, top is low", () => {
    const patch = createDefaultPatch()
    patch.steps[0].notes = [60]
    // step 19 is row 2, column 3
    patch.steps[19].notes = [62]
    expect(recordedExtent(patch)).toEqual({ x: 3, y: 2 })

    expect(sequencerModValues(patch, 0, false)).toEqual({
      seqX: 0,
      seqY: 0,
      phase: 0,
    })
    const atEnd = sequencerModValues(patch, 19, false)
    expect(atEnd.seqX).toBe(1)
    expect(atEnd.seqY).toBe(1)
    expect(atEnd.phase).toBe(1)
  })

  it("reports zero when nothing is recorded", () => {
    expect(sequencerModValues(createDefaultPatch(), 0, false)).toEqual({
      seqX: 0,
      seqY: 0,
      phase: 0,
    })
  })
})
