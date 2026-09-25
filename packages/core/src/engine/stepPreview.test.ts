import { beforeEach, describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { PatchJSON } from "../entities/types"
import {
  noteCollisions,
  oneStepPatch,
  previewStep,
  StepNote,
  stepNotes,
} from "./stepPreview"

describe("a step's notes", () => {
  let patch: PatchJSON

  // A quarter-note step on step 5, played by voice 1 in 8ths at half
  // length. Sync Voices starts the voices from their first dots on every
  // step, so the step reads the same wherever the sequence leads to it;
  // where they come in without it is tested below.
  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "4th"
    patch.syncVoices = true
    patch.steps[5].notes = [60, 64]
    patch.voices[0] = { ...patch.voices[0], pace: "8th", length: 0.5 }
  })

  it("places each voice's notes at its pace and length, across the step", () => {
    expect(stepNotes(patch, 5)).toEqual([
      { voice: 0, note: 60, velocity: 64, dot: 0, start: 0, end: 0.25 },
      { voice: 0, note: 60, velocity: 64, dot: 1, start: 0.5, end: 0.75 },
    ])
  })

  it("gives each note its velocity and the dot that played it", () => {
    patch.pace = "2nd"
    patch.voices[0].pattern[0] = {
      ...patch.voices[0].pattern[0],
      ratchet: 2,
      accent: "+",
    }
    patch.voices[0].pattern[2] = {
      ...patch.voices[0].pattern[2],
      velocityOffset: -10,
    }
    const notes = stepNotes(patch, 5)

    // both ratchet hits come from the first dot, accented
    expect(notes.map(({ dot, velocity }) => [dot, velocity])).toEqual([
      [0, 84],
      [0, 84],
      [1, 64],
      [2, 54],
      [3, 64],
    ])
    // and an accent follows the accent amount it is given
    expect(stepNotes(patch, 5, { accentAmount: 30 })[0].velocity).toBe(94)
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
      { voice: 0, note: 60, velocity: 64, dot: 0, start: 0, end: 1 },
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

describe("where the voices are when a step lands", () => {
  let patch: PatchJSON

  // a bar-long step with 16-dot patterns in 8ths: eight dots a step, so the
  // patterns come round every other step
  beforeEach(() => {
    patch = createDefaultPatch()
    patch.pace = "1bar"
    for (const step of [0, 1, 2]) {
      patch.steps[step].notes = [60]
    }
  })

  it("comes in partway through a pattern, as the sequence reaches it", () => {
    expect(previewStep(patch, 0).voiceDots[0]).toBe(0)
    expect(previewStep(patch, 1).voiceDots[0]).toBe(8)
    // round again on the third step
    expect(previewStep(patch, 2).voiceDots[0]).toBe(0)
    expect(stepNotes(patch, 1).map(({ dot }) => dot)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15,
    ])
  })

  it("counts each voice at its own pace and pattern length", () => {
    patch.voices[1] = {
      ...patch.voices[1],
      enabled: true,
      pace: "4th",
      patternLength: 6,
    }
    // four quarters a step: 4 dots in, then 8, round a pattern of six
    expect(previewStep(patch, 1).voiceDots[1]).toBe(4)
    expect(previewStep(patch, 2).voiceDots[1]).toBe(2)
  })

  it("follows the direction and skips that lead to the step", () => {
    patch.steps[0].state = "skip"
    // step 1 is now where the sequence starts
    expect(previewStep(patch, 1).voiceDots[0]).toBe(0)
    patch.steps[0].state = "normal"
    patch.direction = "bwd"
    // backwards over the recorded steps: 0, then 2, then 1, two steps and
    // so a whole pattern in, rather than one
    expect(previewStep(patch, 1).voiceDots[0]).toBe(0)
    expect(previewStep(patch, 2).voiceDots[0]).toBe(8)
  })

  it("starts every step from the first dots under Sync Voices", () => {
    patch.syncVoices = true
    expect(previewStep(patch, 1).voiceDots[0]).toBe(0)
    expect(stepNotes(patch, 1)[0].dot).toBe(0)
  })

  it("shows a step the sequence never reaches as it plays on its own", () => {
    patch.steps[1].state = "skip"
    expect(previewStep(patch, 1).voiceDots).toEqual([0, 0, 0, 0])
    expect(stepNotes(patch, 1)[0].dot).toBe(0)
  })
})

describe("collisions between voices", () => {
  const note = (
    voice: 0 | 1 | 2 | 3,
    key: number,
    start: number,
    end: number,
    dot = 0,
  ): StepNote => ({ voice, note: key, velocity: 64, dot, start, end })

  it("finds voices sounding the same key at the same time", () => {
    expect(
      noteCollisions([
        note(0, 60, 0, 0.25),
        note(1, 60, 0.1, 0.3, 2),
        // another key, and the same key once the others have ended
        note(2, 64, 0, 0.25),
        note(2, 60, 0.5, 0.75),
      ]),
    ).toEqual([
      {
        note: 60,
        start: 0,
        end: 0.3,
        dots: [
          { voice: 0, dot: 0 },
          { voice: 1, dot: 2 },
        ],
      },
    ])
  })

  it("keeps separate collisions apart, in time order", () => {
    const found = noteCollisions([
      note(0, 60, 0.5, 0.75, 4),
      note(3, 60, 0.6, 0.8, 1),
      note(1, 67, 0, 0.25),
      note(2, 67, 0, 0.25),
    ])
    expect(found.map(({ note: key, start }) => [key, start])).toEqual([
      [67, 0],
      [60, 0.5],
    ])
  })

  it("chains a collision through each voice that joins it", () => {
    const [only, ...rest] = noteCollisions([
      note(0, 60, 0, 0.3),
      note(1, 60, 0.2, 0.5),
      note(2, 60, 0.45, 0.7),
    ])
    expect(rest).toEqual([])
    expect(only.dots.map(({ voice }) => voice)).toEqual([0, 1, 2])
    expect([only.start, only.end]).toEqual([0, 0.7])
  })

  it("is no collision when a voice strikes its own key again, or notes only touch", () => {
    expect(
      noteCollisions([
        note(0, 60, 0, 0.5, 0),
        note(0, 60, 0.5, 1, 1),
        // starts just as voice 1's ends
        note(1, 62, 0, 0.5),
        note(2, 62, 0.5, 1),
      ]),
    ).toEqual([])
  })

  it("counts a dot's ratchet hits once", () => {
    const [collision] = noteCollisions([
      note(0, 60, 0, 0.1, 3),
      note(0, 60, 0.1, 0.2, 3),
      note(1, 60, 0, 0.2, 0),
    ])
    expect(collision.dots).toEqual([
      { voice: 0, dot: 3 },
      { voice: 1, dot: 0 },
    ])
  })

  it("finds them in what a step plays", () => {
    const patch = createDefaultPatch()
    patch.pace = "4th"
    patch.steps[0].notes = [60]
    // two voices in step, on different channels, playing the one note
    patch.voices[1] = { ...patch.voices[1], enabled: true }
    // 8ths at half length on a quarter-note step: two notes each, a rest
    // between, so two collisions
    expect(noteCollisions(stepNotes(patch, 0))).toEqual([
      {
        note: 60,
        start: 0,
        end: 0.25,
        dots: [
          { voice: 0, dot: 0 },
          { voice: 1, dot: 0 },
        ],
      },
      {
        note: 60,
        start: 0.5,
        end: 0.75,
        dots: [
          { voice: 0, dot: 1 },
          { voice: 1, dot: 1 },
        ],
      },
    ])
  })
})
