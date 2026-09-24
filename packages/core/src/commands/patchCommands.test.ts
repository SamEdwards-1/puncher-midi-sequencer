import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import {
  addEnvelope,
  addStepNote,
  clearPatch,
  clearStep,
  freeVoiceChannel,
  nextFreeCC,
  pasteStep,
  removeEnvelope,
  removeStepNote,
  setDotVelocity,
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
  updateEnvelope,
} from "./patchCommands"

const flat = (value: number) => [{ time: 0, value }]

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

  it("add, edit and remove a step's envelopes", () => {
    const patch = createDefaultPatch()
    const withCC = addEnvelope(patch, 3, {
      cc: 74,
      channel: 1,
      points: flat(100),
    })
    const [envelope] = withCC.steps[3].envelopes
    expect(envelope).toMatchObject({ cc: 74, points: flat(100) })

    const ramp = [
      { time: 0, value: 0 },
      { time: 1, value: 127 },
    ]
    const updated = updateEnvelope(withCC, 3, envelope.id, {
      cc: 71,
      points: ramp,
    })
    expect(updated.steps[3].envelopes[0]).toMatchObject({
      cc: 71,
      points: ramp,
    })
    expect(removeEnvelope(updated, 3, envelope.id).steps[3].envelopes).toEqual(
      [],
    )
  })

  it("give each envelope its own id across the patch", () => {
    const patch = createDefaultPatch()
    const envelope = { cc: 1, channel: 1, points: flat(0) }
    const twice = addEnvelope(addEnvelope(patch, 0, envelope), 9, envelope)

    expect(twice.steps[0].envelopes[0].id).not.toBe(
      twice.steps[9].envelopes[0].id,
    )
  })

  it("offer the next CC a step isn't using on a channel, brightness first", () => {
    const patch = createDefaultPatch()
    expect(nextFreeCC(patch.steps[0], 1)).toBe(74)

    const one = addEnvelope(patch, 0, { cc: 74, channel: 1, points: [] })
    expect(nextFreeCC(one.steps[0], 1)).toBe(75)
    // other channels' and other steps' CCs don't count
    expect(nextFreeCC(one.steps[0], 2)).toBe(74)
    expect(nextFreeCC(one.steps[1], 1)).toBe(74)

    let full = patch
    for (let cc = 74; cc < 128; cc++) {
      full = addEnvelope(full, 0, { cc, channel: 1, points: [] })
    }
    // past 127 it starts again from 0
    expect(nextFreeCC(full.steps[0], 1)).toBe(0)
  })

  it("set a dot's velocity as an accent or as its own", () => {
    // voice 2 at 64, accents of 20
    const patch = createDefaultPatch()
    const accented = setDotVelocity(patch, 1, 3, 85, 20)
    expect(accented.voices[1].pattern[3]).toMatchObject({
      accent: "+",
      velocityOffset: 0,
    })

    const own = setDotVelocity(accented, 1, 3, 70, 20)
    expect(own.voices[1].pattern[3]).toMatchObject({
      accent: "none",
      velocityOffset: 6,
    })
    // relative to its own voice's velocity, and only that dot
    const louder = setVoice(patch, 1, { velocity: 100 })
    expect(
      setDotVelocity(louder, 1, 3, 70, 20).voices[1].pattern[3],
    ).toMatchObject({ velocityOffset: -30 })
    expect(own.voices[1].pattern[2]).toBe(patch.voices[1].pattern[2])
    expect(own.voices[0]).toBe(patch.voices[0])
  })

  it("never give two voices one channel", () => {
    // voices on 1 to 4
    const patch = createDefaultPatch()
    expect(freeVoiceChannel(patch, 0, 9)).toBe(9)
    // stepping up onto a taken channel carries on to the next free one
    expect(freeVoiceChannel(patch, 0, 2)).toBe(5)
    // and stepping down, downward
    const high = setVoice(patch, 3, { channel: 8 })
    expect(freeVoiceChannel(high, 3, 3)).toBe(8)
    expect(freeVoiceChannel(high, 3, 7)).toBe(7)
    // with nothing free that way, it stays where it is
    expect(freeVoiceChannel(patch, 1, 1)).toBe(2)
  })

  it("copy a step onto another and clear one", () => {
    const source = addEnvelope(
      setStepState(setStepNotes(createDefaultPatch(), 0, [60, 64]), 0, "rest"),
      0,
      {
        cc: 74,
        channel: 1,
        points: [
          { time: 0, value: 10 },
          { time: 0.5, value: 100 },
        ],
      },
    )
    const pasted = pasteStep(source, 5, source.steps[0])

    expect(pasted.steps[5].notes).toEqual([60, 64])
    expect(pasted.steps[5].state).toBe("rest")
    expect(pasted.steps[5].envelopes[0]).toMatchObject({
      cc: 74,
      points: source.steps[0].envelopes[0].points,
    })
    // the copy has its own id and its own points, so the two stay separate
    expect(pasted.steps[5].envelopes[0].id).not.toBe(
      source.steps[0].envelopes[0].id,
    )
    expect(pasted.steps[5].envelopes[0].points).not.toBe(
      source.steps[0].envelopes[0].points,
    )

    const cleared = clearStep(pasted, 5)
    expect(cleared.steps[5]).toMatchObject({ notes: [], envelopes: [] })
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
    expect(cleared.steps.every((step) => step.envelopes.length === 0)).toBe(
      true,
    )
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
