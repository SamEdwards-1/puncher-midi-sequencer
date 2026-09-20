import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import {
  setJump,
  setModOut,
  setPatternStep,
  setSequencer,
  setStepNotes,
  setStepState,
  setVoice,
  togglePatternStep,
  trimStepsToLimit,
} from "./patchCommands"

describe("patch commands", () => {
  it("leave the original patch untouched", () => {
    const patch = createDefaultPatch()
    const next = setSequencer(patch, { tempo: 90 })

    expect(next.tempo).toBe(90)
    expect(patch.tempo).toBe(120)
    // untouched parts are shared, so snapshots stay cheap
    expect(next.steps).toBe(patch.steps)
  })

  it("edit one voice without disturbing the others", () => {
    const patch = createDefaultPatch()
    const next = setVoice(patch, 1, { pace: "16th", enabled: true })

    expect(next.voices[1]).toMatchObject({ pace: "16th", enabled: true })
    expect(next.voices[0]).toBe(patch.voices[0])
  })

  it("edit and toggle a pattern dot", () => {
    const patch = createDefaultPatch()
    const accented = setPatternStep(patch, 0, 3, { accent: "+" })
    expect(accented.voices[0].pattern[3].accent).toBe("+")
    expect(accented.voices[0].pattern[2]).toBe(patch.voices[0].pattern[2])

    const toggled = togglePatternStep(accented, 0, 3)
    expect(toggled.voices[0].pattern[3].on).toBe(false)
    expect(togglePatternStep(toggled, 0, 3).voices[0].pattern[3].on).toBe(true)
  })

  it("sort, de-duplicate and cap a step's notes", () => {
    const patch = { ...createDefaultPatch(), maxNotesPerStep: 3 }
    const next = setStepNotes(patch, 2, [67, 60, 60, 64, 72])

    expect(next.steps[2].notes).toEqual([60, 64, 67])
  })

  it("set a step's state and jump", () => {
    const patch = createDefaultPatch()
    expect(setStepState(patch, 4, "skip").steps[4].state).toBe("skip")

    const jumped = setJump(patch, 4, { dest: 9 })
    expect(jumped.steps[4].jump).toEqual({
      rule: { kind: "always" },
      dest: 9,
      normal: null,
    })
  })

  it("edit a mod out by its source", () => {
    const patch = createDefaultPatch()
    const next = setModOut(patch, "phase", { enabled: true, cc: 30 })

    const phase = next.modOuts.find((modOut) => modOut.source === "phase")
    expect(phase).toMatchObject({ enabled: true, cc: 30 })
    expect(next.modOuts[0]).toBe(patch.modOuts[0])
  })

  it("trim notes above the limit for good", () => {
    const patch = setStepNotes(
      { ...createDefaultPatch(), maxNotesPerStep: 16 },
      0,
      [48, 55, 60, 64, 72],
    )
    const lowered = { ...patch, maxNotesPerStep: 2 }

    // lowering the limit alone keeps the notes
    expect(lowered.steps[0].notes).toHaveLength(5)
    expect(trimStepsToLimit(lowered).steps[0].notes).toEqual([48, 55])
  })
})
