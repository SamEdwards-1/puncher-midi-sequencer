import { SEQUENCER_SCALES } from "@midiseq/core"
import { describe, expect, it } from "vitest"
import {
  guessScales,
  SCALE_CHOICES,
  SEQUENCER_SCALE_CHOICES,
  weightsOfNotes,
} from "./scales"

describe("the sequencer's scales", () => {
  it("are the library's own, step for step", () => {
    // the engine fits notes to the steps core keeps, so they must agree
    for (const { name, steps } of SEQUENCER_SCALES) {
      const library = SCALE_CHOICES.find((choice) => choice.name === name)
      expect(library?.steps, name).toEqual(steps)
    }
    expect(SEQUENCER_SCALE_CHOICES.map(({ name }) => name)).toEqual(
      SEQUENCER_SCALES.map(({ name }) => name),
    )
  })

  it("are all a guess for the sequencer is taken from", () => {
    // D, F, G, A, C: F major pentatonic, which F major blues holds too —
    // a guess from the whole library, but not a scale the sequencer offers
    const weights = weightsOfNotes([62, 65, 67, 69, 72])
    const names = new Set(
      SEQUENCER_SCALE_CHOICES.map(({ name }) => name) as string[],
    )
    const guesses = guessScales(weights, SEQUENCER_SCALE_CHOICES)
    expect(guesses.length).toBeGreaterThan(0)
    expect(guesses.every(({ name }) => names.has(name))).toBe(true)
  })
})
