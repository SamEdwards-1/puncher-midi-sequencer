import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "./defaults"
import {
  fitToScale,
  inScale,
  normalizeSteps,
  ScaleJSON,
  scaleNoteToward,
} from "./scale"
import { PatchSchema } from "./schema"

const C_MAJOR: ScaleJSON = {
  tonic: 0,
  name: "major",
  steps: [0, 2, 4, 5, 7, 9, 11],
  fit: "up",
}
const D_MINOR_PENTATONIC: ScaleJSON = {
  tonic: 2,
  name: "minorPentatonic",
  steps: [0, 3, 5, 7, 10],
  fit: "up",
}

describe("scales", () => {
  it("know their notes in every octave", () => {
    expect(inScale(C_MAJOR, 60)).toBe(true)
    expect(inScale(C_MAJOR, 61)).toBe(false)
    expect(inScale(C_MAJOR, 11)).toBe(true)
    // D F G A C
    expect(
      [62, 65, 67, 69, 72].every((n) => inScale(D_MINOR_PENTATONIC, n)),
    ).toBe(true)
    expect(inScale(D_MINOR_PENTATONIC, 64)).toBe(false)
  })

  it("fit a note up, down, or leave it out", () => {
    expect(fitToScale(C_MAJOR, 61, "up")).toBe(62)
    expect(fitToScale(C_MAJOR, 61, "down")).toBe(60)
    expect(fitToScale(C_MAJOR, 61, "exclude")).toBeNull()
    // or let it be
    expect(fitToScale(C_MAJOR, 61, "ignore")).toBe(61)
    // a note already in is kept, whatever the fit
    expect(fitToScale(C_MAJOR, 64, "exclude")).toBe(64)
    // the pentatonic has no E: up to F, or down to D
    expect(fitToScale(D_MINOR_PENTATONIC, 64, "up")).toBe(65)
    expect(fitToScale(D_MINOR_PENTATONIC, 64, "down")).toBe(62)
  })

  it("turn back at the keyboard's ends", () => {
    // a scale of C# alone has none above G9, the keyboard's top
    const top: ScaleJSON = { ...C_MAJOR, tonic: 1, steps: [0] }
    expect(scaleNoteToward(top, 127, 1)).toBeNull()
    expect(fitToScale(top, 127, "up")).toBe(121)
  })

  it("tidy their steps", () => {
    expect(normalizeSteps([7, 4, 4, 12, 14])).toEqual([0, 2, 4, 7])
  })

  it("are kept in a patch, and missing from older ones", () => {
    const parsed = PatchSchema.parse({
      ...createDefaultPatch(),
      scale: { tonic: 2, name: "dorian", steps: [9, 0, 2, 3, 5, 7, 10] },
    })
    expect(parsed.scale).toEqual({
      tonic: 2,
      name: "dorian",
      steps: [0, 2, 3, 5, 7, 9, 10],
      fit: "up",
    })

    const { scale: _, ...older } = createDefaultPatch()
    expect(PatchSchema.parse(older).scale).toBeNull()

    expect(
      PatchSchema.safeParse({
        ...createDefaultPatch(),
        scale: { tonic: 12, name: "major", steps: [0] },
      }).success,
    ).toBe(false)
  })
})
