import { describe, expect, it } from "vitest"
import { createDefaultPatch } from "../entities/defaults"
import { createDemoPatch } from "../entities/demoPatch"
import { ScaleJSON } from "../entities/scale"
import { ModulationJSON, ModulationTarget } from "../entities/types"
import {
  addEnvelope,
  addModulationEnvelope,
  addStepNote,
  clearPatch,
  clearStep,
  deleteStep,
  editPattern,
  freeVoiceChannel,
  insertStep,
  nextFreeCC,
  pasteStep,
  removeEnvelope,
  removeModulation,
  removeStepNote,
  setDotVelocity,
  setJump,
  setModOut,
  setModulation,
  setPatternStep,
  setScale,
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

  it("shifts short patterns around and drops an edge dot at length 16", () => {
    const patch = createDefaultPatch()
    const marked = setVoice(patch, 0, {
      patternLength: 3,
      pattern: patch.voices[0].pattern.map((dot, index) => ({
        ...dot,
        velocityOffset: index + 1,
      })),
    })
    const right = editPattern(marked, 0, 1, "shift-right")
    expect(
      right.voices[0].pattern.slice(0, 3).map((dot) => dot.velocityOffset),
    ).toEqual([3, 1, 2])
    expect(
      editPattern(right, 0, 1, "shift-left").voices[0].pattern.slice(0, 3),
    ).toEqual(marked.voices[0].pattern.slice(0, 3))
    expect(right.voices[0].pattern[3]).toBe(marked.voices[0].pattern[3])
    expect(marked.voices[0].pattern[0].velocityOffset).toBe(1)

    const full = setVoice(marked, 0, { patternLength: 16 })
    const shifted = editPattern(full, 0, 0, "shift-right")
    expect(shifted.voices[0].pattern[0].velocityOffset).toBe(0)
    expect(shifted.voices[0].pattern[15].velocityOffset).toBe(15)
  })

  it("swaps neighbors and inserts silent dots as one voice edit", () => {
    const patch = createDefaultPatch()
    const marked = setVoice(patch, 1, {
      patternLength: 3,
      pattern: patch.voices[1].pattern.map((dot, index) => ({
        ...dot,
        velocityOffset: index + 1,
      })),
    })
    const swapped = editPattern(marked, 1, 1, "swap-left")
    expect(
      swapped.voices[1].pattern.slice(0, 3).map((dot) => dot.velocityOffset),
    ).toEqual([2, 1, 3])
    expect(editPattern(marked, 1, 0, "swap-left")).toBe(marked)
    const inserted = editPattern(marked, 1, 1, "insert-before")
    expect(inserted.voices[1].patternLength).toBe(4)
    expect(
      inserted.voices[1].pattern.slice(0, 4).map((dot) => dot.velocityOffset),
    ).toEqual([1, 0, 2, 3])
    expect(inserted.voices[1].pattern[1].on).toBe(false)
    expect(inserted.voices[0]).toBe(marked.voices[0])
    expect(
      editPattern(marked, 1, 2, "insert-after").voices[1].pattern[3].on,
    ).toBe(false)
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

  describe("with a scale", () => {
    const C_MAJOR: ScaleJSON = {
      tonic: 0,
      name: "major",
      steps: [0, 2, 4, 5, 7, 9, 11],
      fit: "up",
    }
    const scaled = (notes: number[]) => ({
      ...setStepNotes(createDefaultPatch(), 0, notes),
      scale: C_MAJOR,
    })

    it("edit notes by semitones, in the scale or out of it", () => {
      const patch = scaled([64])
      expect(setStepNote(patch, 0, 0, 66).steps[0].notes).toEqual([66])
      expect(transposeStep(patch, 0, 1).steps[0].notes).toEqual([65])
      expect(addStepNote(patch, 0, 61).steps[0].notes).toEqual([64, 61])
    })

    it("add a note above one already there", () => {
      expect(addStepNote(scaled([64]), 0, 64).steps[0].notes).toEqual([64, 65])
    })

    it("leave the notes be as a scale is chosen", () => {
      const patch = setStepNotes(createDefaultPatch(), 0, [60, 61, 66])
      const chosen = setScale(patch, C_MAJOR)
      expect(chosen.scale).toBe(C_MAJOR)
      expect(chosen.steps).toBe(patch.steps)
      expect(setScale(chosen, null).scale).toBeNull()
    })
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
    // a new envelope steps unless told otherwise
    expect(
      addEnvelope(patch, 3, { cc: 1, channel: 1, points: [] }).steps[3]
        .envelopes[0].shape,
    ).toBe("steps")
    expect(
      addEnvelope(patch, 3, { cc: 1, channel: 1, shape: "ramps", points: [] })
        .steps[3].envelopes[0].shape,
    ).toBe("ramps")
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

  describe("inserting and deleting a step", () => {
    // steps 0 to 3 hold 60 to 63, so each can be told by its note
    const numbered = () => {
      let patch = createDefaultPatch()
      for (let step = 0; step < 4; step++) {
        patch = setStepNotes(patch, step, [60 + step])
      }
      return patch
    }
    const notes = (patch: ReturnType<typeof createDefaultPatch>) =>
      patch.steps.slice(0, 5).map((step) => step.notes[0] ?? null)

    it("insert an empty step, moving the rest along", () => {
      const next = insertStep(numbered(), 1)
      expect(notes(next)).toEqual([60, null, 61, 62, 63])
      expect(next.steps).toHaveLength(64)
    })

    it("drop only the last step the patch stores", () => {
      let patch = setStepNotes(createDefaultPatch(), 62, [70])
      patch = setStepNotes(patch, 63, [71])
      const next = insertStep(patch, 0)
      expect(next.steps[63].notes).toEqual([70])
      expect(next.steps).toHaveLength(64)
    })

    it("delete a step, pulling the rest back with no gap", () => {
      const next = deleteStep(numbered(), 1)
      expect(notes(next)).toEqual([60, 62, 63, null, null])
      expect(next.steps).toHaveLength(64)
      expect(next.steps[63]).toEqual(createDefaultPatch().steps[63])
    })

    it("keep jumps pointing at the steps they pointed at", () => {
      let patch = numbered()
      patch = setJump(patch, 0, { dest: 3, normal: 2 })
      patch = setJump(patch, 3, { dest: 0 })

      const inserted = insertStep(patch, 1)
      expect(inserted.steps[0].jump).toMatchObject({ dest: 4, normal: 3 })
      // the step that jumps moved too, and still goes back to the first
      expect(inserted.steps[4].jump.dest).toBe(0)

      const deleted = deleteStep(patch, 1)
      expect(deleted.steps[0].jump).toMatchObject({ dest: 2, normal: 1 })
      expect(deleted.steps[2].jump.dest).toBe(0)
    })

    it("drop a jump to the step deleted, or pushed off the end", () => {
      const patch = setJump(numbered(), 0, { dest: 2, normal: 2 })
      expect(deleteStep(patch, 2).steps[0].jump).toMatchObject({
        dest: null,
        normal: null,
      })

      const toLast = setJump(createDefaultPatch(), 0, { dest: 63 })
      expect(insertStep(toLast, 5).steps[0].jump.dest).toBeNull()
    })

    it("grow or shrink a custom loop with the steps in it", () => {
      const patch = setSequencer(numbered(), {
        loop: { mode: "custom", end: 3 },
      })
      expect(insertStep(patch, 3).loop.end).toBe(4)
      expect(insertStep(patch, 4).loop.end).toBe(3)
      expect(deleteStep(patch, 3).loop.end).toBe(2)
      expect(deleteStep(patch, 4).loop.end).toBe(3)

      // it stays within the steps there are
      const whole = setSequencer(patch, { loop: { mode: "custom", end: 63 } })
      expect(insertStep(whole, 0).loop.end).toBe(63)
      const first = setSequencer(patch, { loop: { mode: "custom", end: 0 } })
      expect(deleteStep(first, 0).loop.end).toBe(0)

      // a loop that isn't custom finds its own end
      const recorded = numbered()
      expect(insertStep(recorded, 0).loop).toBe(recorded.loop)
    })
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

describe("modulation commands", () => {
  const PACE: ModulationTarget = { kind: "voice", voice: 0, setting: "pace" }
  // seven paces, 4th to 16th: CC 64 stands for an 8th
  const paces: ModulationJSON = { target: PACE, cc: 3, from: "4th", to: "16th" }
  const modulated = () =>
    addEnvelope(setModulation(createDefaultPatch(), paces), 2, {
      cc: 3,
      channel: 1,
      points: [
        { time: 0, value: 64 },
        { time: 1, value: 127 },
      ],
    })

  it("give a setting one modulation, changed in place", () => {
    const patch = setModulation(modulated(), { ...paces, to: "32nd" })
    expect(patch.modulations).toEqual([{ ...paces, to: "32nd" }])
  })

  it("keep what a step plays when the range changes, where the range reaches it", () => {
    // 4th to 8th: the 8th is now the last value, and the 16th beyond it
    const patch = setModulation(modulated(), { ...paces, to: "8th" })
    expect(
      patch.steps[2].envelopes[0].points.map(({ value }) => value),
    ).toEqual([127, 127])
  })

  it("move the envelopes a modulation drives on to its new CC", () => {
    const patch = setModulation(modulated(), { ...paces, cc: 9 })
    expect(patch.steps[2].envelopes[0]).toMatchObject({
      cc: 9,
      points: [
        { time: 0, value: 64 },
        { time: 1, value: 127 },
      ],
    })
  })

  it("leave a modulation's envelopes when it is removed", () => {
    const patch = removeModulation(modulated(), PACE)
    expect(patch.modulations).toEqual([])
    expect(patch.steps[2].envelopes).toHaveLength(1)
  })

  it("remove a modulation with the last envelope for its CC", () => {
    const patch = modulated()
    const removed = removeEnvelope(patch, 2, patch.steps[2].envelopes[0].id)
    expect(removed.steps[2].envelopes).toEqual([])
    expect(removed.modulations).toEqual([])
  })

  it("keep a modulation while another step has an envelope for its CC, on any channel", () => {
    const patch = addEnvelope(modulated(), 6, {
      cc: 3,
      channel: 2,
      points: [{ time: 0, value: 0 }],
    })
    const removed = removeEnvelope(patch, 2, patch.steps[2].envelopes[0].id)
    expect(removed.modulations).toEqual([paces])
    // and a plain CC's envelope takes no modulation with it
    const plain = addEnvelope(modulated(), 4, {
      cc: 74,
      channel: 1,
      points: [{ time: 0, value: 0 }],
    })
    expect(
      removeEnvelope(plain, 4, plain.steps[4].envelopes[0].id).modulations,
    ).toEqual([paces])
  })

  it("start a step's envelope at the setting's own value, once", () => {
    const patch = addModulationEnvelope(
      setModulation(createDefaultPatch(), paces),
      5,
      PACE,
    )
    // the voice's own pace is an 8th
    expect(patch.steps[5].envelopes).toMatchObject([
      { cc: 3, channel: 1, shape: "steps", points: [{ time: 0, value: 64 }] },
    ])
    expect(addModulationEnvelope(patch, 5, PACE)).toBe(patch)
  })

  it("clear the voices' modulations with the voices, and keep the sequencer's and the actions'", () => {
    const sequencer: ModulationJSON = {
      target: { kind: "sequencer", setting: "pace" },
      cc: 9,
      from: "1bar",
      to: "8th",
    }
    const sync: ModulationJSON = {
      target: { kind: "action", setting: "sync", voice: 2 },
      cc: 10,
      from: false,
      to: true,
    }
    const patch = setModulation(setModulation(modulated(), sequencer), sync)
    expect(clearPatch(patch).modulations).toEqual([sequencer, sync])
  })
})
