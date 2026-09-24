import { beforeEach, describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON } from "../entities/types"
import { oneStepPatch, stepNotes } from "./stepPreview"

describe("a step's notes", () => {
  let patch: PatchJSON

  // a quarter-note step on step 5, played by voice 1 in 8ths at half length
  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "4th"
    patch.steps[5].notes = [60, 64]
    patch.voices[0] = { ...patch.voices[0], pace: "8th", length: 0.5 }
  })

  it("places each voice's notes at its pace and length, across the step", () => {
    expect(stepNotes(patch, 5)).toEqual([
      { voice: 0, note: 60, start: 0, end: 0.25 },
      { voice: 0, note: 60, start: 0.5, end: 0.75 },
    ])
  })

  it("follows the voice's rule, offset and dots", () => {
    patch.voices[0] = { ...patch.voices[0], rule: "up", offset: 12 }
    patch.voices[0].pattern[1] = { ...patch.voices[0].pattern[1], on: false }
    patch.voices[0].pattern[0] = { ...patch.voices[0].pattern[0], ratchet: 2 }

    // a half-note step, so four 8th-note dots: a ratchet of two strikes the
    // first dot's note twice, the second dot is silent, and "up" climbs on
    patch.pace = "2nd"
    expect(stepNotes(patch, 5).map(({ note, start }) => [note, start])).toEqual(
      [
        [72, 0],
        [72, 0.125],
        [76, 0.5],
        [72, 0.75],
      ],
    )
  })

  it("plays every enabled voice, each marked as its own", () => {
    patch.voices[2] = { ...patch.voices[2], enabled: true, pace: "4th" }
    const voices = new Set(stepNotes(patch, 5).map((note) => note.voice))
    expect([...voices]).toEqual([0, 2])
  })

  it("cuts a note still sounding at the step's end", () => {
    patch.voices[0] = { ...patch.voices[0], pace: "2nd", length: 1 }
    expect(stepNotes(patch, 5)).toEqual([
      { voice: 0, note: 60, start: 0, end: 1 },
    ])
  })

  it("plays nothing on a rest or a step without notes", () => {
    expect(stepNotes(patch, 4)).toEqual([])
    patch.steps[5].state = "rest"
    expect(stepNotes(patch, 5)).toEqual([])
  })

  it("comes out the same every time, chance and all", () => {
    patch.voices[0] = { ...patch.voices[0], rule: "random", pace: "32nd" }
    patch.voices[0].pattern[3] = {
      ...patch.voices[0].pattern[3],
      probability: 50,
    }
    expect(stepNotes(patch, 5)).toEqual(stepNotes(patch, 5))
  })

  it("keeps every note of a long, busy step", () => {
    // sixteen bars of four voices in 32nd triplets, all with envelopes
    // sampled underneath, is more than one render of the engine will take
    patch.pace = "16bar"
    patch.steps[5].envelopes = [
      {
        id: 1,
        cc: 1,
        channel: 1,
        points: [
          { time: 0, value: 0 },
          { time: 1, value: 127 },
        ],
      },
    ]
    patch.voices = patch.voices.map((voice) => ({
      ...voice,
      enabled: true,
      pace: "32ndT",
    }))
    const notes = stepNotes(patch, 5)
    expect(notes).toHaveLength(64 * 12 * 4)
    expect(Math.max(...notes.map((note) => note.start))).toBeCloseTo(
      1 - 1 / (64 * 12),
    )
  })

  it("puts the step first, jumpless, in a loop of one", () => {
    patch.steps[5].jump = { rule: { kind: "always" }, dest: 9, normal: 2 }
    const one = oneStepPatch(patch, 5)

    expect(one.steps[0].notes).toEqual([60, 64])
    expect(one.steps[0].jump).toEqual({
      rule: { kind: "always" },
      dest: null,
      normal: null,
    })
    expect(one.loop).toEqual({ mode: "custom", end: 0 })
    // the patch itself is untouched
    expect(patch.steps[0].notes).toEqual([])
  })
})
