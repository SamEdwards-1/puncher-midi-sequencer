import { createDefaultPatch, setStepNotes } from "@midiseq/core"
import { describe, expect, it } from "vitest"
import {
  areaPath,
  cellAt,
  hitPoint,
  hitSegment,
  isBlackKey,
  keyRange,
  linePath,
  Plot,
  patchNoteSpan,
  timeAtX,
  toX,
  toY,
  valueAtY,
} from "./envelopeGeometry"

// 100 by 127 inside a 10 pixel inset, so a unit of time or value is easy
const plot: Plot = { width: 120, height: 147, pad: 10 }
const ramp = [
  { time: 0.2, value: 27 },
  { time: 0.8, value: 127 },
]

describe("envelope geometry", () => {
  it("maps the step across and the CC value up, inside the inset", () => {
    expect(toX(plot, 0)).toBe(10)
    expect(toX(plot, 1)).toBe(110)
    expect(toY(plot, 127)).toBe(10)
    expect(toY(plot, 0)).toBe(137)
    expect(timeAtX(plot, toX(plot, 0.3))).toBeCloseTo(0.3)
    expect(valueAtY(plot, toY(plot, 90))).toBeCloseTo(90)
  })

  it("keeps a position outside the plot inside the step and the CC range", () => {
    expect(timeAtX(plot, -50)).toBe(0)
    expect(timeAtX(plot, 500)).toBe(1)
    expect(valueAtY(plot, -50)).toBe(127)
    expect(valueAtY(plot, 500)).toBe(0)
  })

  it("finds the point under the mouse, the later of two overlapping", () => {
    expect(hitPoint(ramp, plot, toX(plot, 0.2) + 3, toY(plot, 27))).toBe(0)
    expect(hitPoint(ramp, plot, toX(plot, 0.5), toY(plot, 77))).toBeNull()

    const stacked = [
      { time: 0.5, value: 60 },
      { time: 0.5, value: 60 },
    ]
    expect(hitPoint(stacked, plot, toX(plot, 0.5), toY(plot, 60))).toBe(1)
  })

  it("finds the segment under the mouse, numbered as moveSegment counts", () => {
    // halfway along the slope
    expect(hitSegment(ramp, plot, toX(plot, 0.5), toY(plot, 77))).toBe(0)
    // the flat stretch into the first point, and out of the last
    expect(hitSegment(ramp, plot, toX(plot, 0.05), toY(plot, 27))).toBe(-1)
    expect(hitSegment(ramp, plot, toX(plot, 0.95), toY(plot, 127))).toBe(1)
    // and nothing well away from the line
    expect(hitSegment(ramp, plot, toX(plot, 0.5), toY(plot, 10))).toBeNull()
    expect(hitSegment([], plot, 50, 50)).toBeNull()
  })

  it("draws the line flat to both ends of the step", () => {
    expect(linePath(ramp, plot)).toBe("M10,110 L30,110 L90,10 L110,10")
    expect(areaPath(ramp, plot)).toBe(
      "M10,110 L30,110 L90,10 L110,10 L110,137 L10,137 Z",
    )
    expect(linePath([], plot)).toBe("")
  })

  it("finds the grid cell a time falls in", () => {
    const grid = [0, 0.25, 0.5, 0.75, 1]
    expect(cellAt(grid, 0)).toBe(0)
    expect(cellAt(grid, 0.3)).toBe(1)
    expect(cellAt(grid, 0.75)).toBe(3)
    // the step's end belongs to the last cell
    expect(cellAt(grid, 1)).toBe(3)
  })

  it("spans the notes of every step, not just the one on show", () => {
    let patch = setStepNotes(createDefaultPatch(), 0, [60, 64])
    patch = setStepNotes(patch, 9, [48])
    patch = setStepNotes(patch, 40, [79])
    // only voice 1 plays, at no offset
    expect(patchNoteSpan(patch)).toEqual([48, 48, 79, 79])
  })

  it("reaches as far as the playing voices' offsets take the keys", () => {
    const patch = setStepNotes(createDefaultPatch(), 0, [60, 64])
    patch.voices[0].enabled = true
    patch.voices[1].enabled = true
    patch.voices[1].offset = -24
    patch.voices[2].offset = 36
    patch.voices[3].enabled = true
    patch.voices[3].offset = 12
    // voice 3 is off, so its three octaves up play nothing
    const span = patchNoteSpan(patch)
    expect([Math.min(...span), Math.max(...span)]).toEqual([36, 76])
  })

  it("never reaches past the MIDI keys", () => {
    const patch = setStepNotes(createDefaultPatch(), 0, [120])
    patch.voices[0].enabled = true
    patch.voices[0].offset = 24
    expect(Math.max(...patchNoteSpan(patch))).toBe(127)
  })

  it("leaves out notes no voice can play", () => {
    // past the step's note limit, and on a step outside a small grid
    let patch = setStepNotes(createDefaultPatch(), 0, [60, 62, 64, 65, 96])
    patch = setStepNotes(patch, 20, [20])
    patch = { ...patch, size: "small" }
    expect(patchNoteSpan(patch)).toEqual([60, 60, 65, 65])
    expect(patchNoteSpan(createDefaultPatch())).toEqual([])
  })

  it("shows exactly the lowest key to the highest, nothing either side", () => {
    // G4 at the bottom, C6 at the top
    expect(keyRange([67, 72, 84])).toEqual({ low: 67, high: 84 })
    // a single key fills the roll
    expect(keyRange([60])).toEqual({ low: 60, high: 60 })
    // with nothing to show, the octave around middle C
    expect(keyRange([])).toEqual({ low: 54, high: 66 })
  })

  it("knows the black keys", () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
    ])
  })
})
