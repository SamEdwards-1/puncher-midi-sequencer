import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import {
  addStepCC,
  addStepNote,
  clearPatch,
  clearStep,
  pasteStep,
  removeStepCC,
  removeStepNote,
  setJump,
  setModOut,
  setPatternStep,
  setSequencer,
  setStepNote,
  setStepNotes,
  setStepState,
  setVoice,
  togglePatternStep,
  transposeStep,
  trimStepsToLimit,
  updateStepCC,
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

  it("de-duplicate a step's notes and keep the order they were entered", () => {
    const patch = createDefaultPatch()
    const next = setStepNotes(patch, 2, [67, 60, 60, 64, 72])

    // four is what the engine reads, not what may be stored
    expect(next.steps[2].notes).toEqual([67, 60, 64, 72])
  })

  it("add, edit, remove and transpose notes", () => {
    const patch = createDefaultPatch()
    const added = addStepNote(addStepNote(patch, 0, 64), 0, 60)
    expect(added.steps[0].notes).toEqual([64, 60])

    const edited = setStepNote(added, 0, 0, 62)
    expect(edited.steps[0].notes).toEqual([62, 60])

    expect(removeStepNote(edited, 0, 1).steps[0].notes).toEqual([62])
    expect(transposeStep(edited, 0, 12).steps[0].notes).toEqual([74, 72])
  })

  it("keep a note in place while it is edited", () => {
    const patch = setStepNotes(createDefaultPatch(), 0, [57, 60, 64])

    // raising the first note past the second must not reorder the rows
    const raised = setStepNote(patch, 0, 0, 62)
    expect(raised.steps[0].notes).toEqual([62, 60, 64])
  })

  it("skip over a pitch the step already holds", () => {
    const patch = setStepNotes(createDefaultPatch(), 0, [59, 60])

    // 59 + 1 lands on 60, which is taken, so it carries on to 61
    expect(setStepNote(patch, 0, 0, 60).steps[0].notes).toEqual([61, 60])

    // and downwards it carries on the other way
    const upper = setStepNotes(createDefaultPatch(), 0, [61, 60])
    expect(setStepNote(upper, 0, 0, 60).steps[0].notes).toEqual([59, 60])
  })

  it("leave a note alone when there is no free pitch that way", () => {
    const patch = setStepNotes(createDefaultPatch(), 0, [126, 127])
    expect(setStepNote(patch, 0, 0, 127)).toBe(patch)
  })

  it("keep every note when transposing over a neighbour", () => {
    const patch = setStepNotes(createDefaultPatch(), 0, [59, 60])
    expect(transposeStep(patch, 0, 1).steps[0].notes).toEqual([60, 61])
  })

  it("keep notes inside the MIDI range and the 16-note store", () => {
    const patch = createDefaultPatch()
    const high = setStepNotes(patch, 0, [120, 125])
    // both hit the ceiling and merge into one
    expect(transposeStep(high, 0, 12).steps[0].notes).toEqual([127])

    const many = setStepNotes(
      patch,
      0,
      Array.from({ length: 20 }, (_, i) => i),
    )
    expect(many.steps[0].notes).toHaveLength(16)
  })

  it("add, edit and remove step CCs", () => {
    const patch = createDefaultPatch()
    const withCC = addStepCC(patch, 3, { cc: 74, value: 100, channel: 1 })
    const [cc] = withCC.steps[3].ccs
    expect(cc).toMatchObject({ cc: 74, value: 100 })

    const updated = updateStepCC(withCC, 3, cc.id, { value: 20 })
    expect(updated.steps[3].ccs[0].value).toBe(20)
    expect(removeStepCC(updated, 3, cc.id).steps[3].ccs).toEqual([])
  })

  it("give each CC its own id", () => {
    const patch = createDefaultPatch()
    const event = {
      cc: 1,
      value: 0,
      channel: 1 as const,
      output: "all" as const,
    }
    const twice = addStepCC(addStepCC(patch, 0, event), 0, event)

    const [first, second] = twice.steps[0].ccs
    expect(first.id).not.toBe(second.id)
  })

  it("copy a step onto another and clear one", () => {
    const source = addStepCC(
      setStepState(setStepNotes(createDefaultPatch(), 0, [60, 64]), 0, "rest"),
      0,
      { cc: 74, value: 100, channel: 1 },
    )
    const pasted = pasteStep(source, 5, source.steps[0])

    expect(pasted.steps[5].notes).toEqual([60, 64])
    expect(pasted.steps[5].state).toBe("rest")
    expect(pasted.steps[5].ccs[0]).toMatchObject({ cc: 74, value: 100 })
    // the copy has its own id, so the two CCs stay separate
    expect(pasted.steps[5].ccs[0].id).not.toBe(source.steps[0].ccs[0].id)

    const cleared = clearStep(pasted, 5)
    expect(cleared.steps[5]).toMatchObject({ notes: [], ccs: [] })
    // clearing leaves the state and jump alone
    expect(cleared.steps[5].state).toBe("rest")
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

  it("clear the whole sequence without touching how it plays", () => {
    let patch = createDemoPatch()
    patch = setVoice(patch, 1, { rule: "rise", patternLength: 3 })
    patch = setPatternStep(patch, 1, 0, { ratchet: 4 })

    const cleared = clearPatch(patch)

    // nothing of the music is left
    expect(cleared.steps.every((step) => step.notes.length === 0)).toBe(true)
    expect(cleared.steps.every((step) => step.ccs.length === 0)).toBe(true)
    expect(cleared.steps.every((step) => step.state === "normal")).toBe(true)
    expect(cleared.steps.every((step) => step.jump.dest === null)).toBe(true)
    expect(cleared.voices).toEqual(createDefaultPatch().voices)

    // how it is played is not the music
    expect(cleared.pace).toBe(patch.pace)
    expect(cleared.tempo).toBe(patch.tempo)
    expect(cleared.size).toBe(patch.size)
    expect(cleared.loop).toEqual(patch.loop)
    expect(cleared.name).toBe(patch.name)
  })

  it("trim the notes no voice can reach for good", () => {
    // a file from before the count was fixed can hold more than four
    const patch = setStepNotes(createDefaultPatch(), 0, [48, 55, 60, 64, 72])

    // loading one keeps them all
    expect(patch.steps[0].notes).toHaveLength(5)
    // the lowest survive, since those are the ones the engine was playing
    expect(trimStepsToLimit(patch).steps[0].notes).toEqual([48, 55, 60, 64])
  })
})
