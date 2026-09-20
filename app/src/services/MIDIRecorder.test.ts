import { createDefaultPatch } from "@midiseq/core"
import { beforeEach, describe, expect, it } from "vitest"
import { SequencerStore } from "../stores/SequencerStore"
import { MIDIInput } from "./MIDIInput"
import { MIDIRecorder, ReceiveChannel } from "./MIDIRecorder"

const noteOn = (note: number, channel = 1) => [0x90 + channel - 1, note, 100]
const noteOff = (note: number, channel = 1) => [0x80 + channel - 1, note, 0]

describe("MIDIRecorder", () => {
  let store: SequencerStore
  let input: MIDIInput
  let recorder: MIDIRecorder
  let channel: ReceiveChannel

  const play = (...messages: number[][]) => {
    for (const message of messages) {
      input.handleMessage(message)
    }
  }

  beforeEach(() => {
    store = new SequencerStore()
    store.patch = createDefaultPatch()
    input = new MIDIInput()
    channel = "omni"
    recorder = new MIDIRecorder(store, input, () => channel)
    recorder.setRecording(true)
  })

  it("records a chord onto one step and moves on", () => {
    play(
      noteOn(60),
      noteOn(64),
      noteOn(67),
      noteOff(64),
      noteOff(60),
      noteOff(67),
    )

    expect(store.patch.steps[0].notes).toEqual([60, 64, 67])
    expect(recorder.target).toBe(1)
  })

  it("records single notes onto consecutive steps", () => {
    play(noteOn(60), noteOff(60), noteOn(62), noteOff(62))

    expect(store.patch.steps[0].notes).toEqual([60])
    expect(store.patch.steps[1].notes).toEqual([62])
    expect(recorder.target).toBe(2)
  })

  it("replaces the notes already on a step", () => {
    store.patch = {
      ...store.patch,
      steps: store.patch.steps.map((step, index) =>
        index === 0 ? { ...step, notes: [40, 41] } : step,
      ),
    }
    play(noteOn(60), noteOff(60))
    expect(store.patch.steps[0].notes).toEqual([60])
  })

  it("keeps the first notes played when the chord is over the limit", () => {
    store.patch = { ...store.patch, maxNotesPerStep: 2 }
    play(
      noteOn(67),
      noteOn(60),
      noteOn(64),
      noteOff(67),
      noteOff(60),
      noteOff(64),
    )

    expect(store.patch.steps[0].notes).toEqual([60, 67])
  })

  it("ignores other channels unless omni", () => {
    channel = 2
    play(noteOn(60, 1), noteOff(60, 1))
    expect(store.patch.steps[0].notes).toEqual([])

    play(noteOn(62, 2), noteOff(62, 2))
    expect(store.patch.steps[0].notes).toEqual([62])
  })

  it("ignores input until recording is armed", () => {
    recorder.setRecording(false)
    play(noteOn(60), noteOff(60))
    expect(store.patch.steps[0].notes).toEqual([])
  })

  it("records onto the step that was picked", () => {
    recorder.setTarget(5)
    play(noteOn(60), noteOff(60))
    expect(store.patch.steps[5].notes).toEqual([60])
    expect(recorder.target).toBe(6)
  })

  it("wraps around the end of the grid", () => {
    store.patch = { ...store.patch, size: "small" }
    recorder.setTarget(15)
    play(noteOn(60), noteOff(60))
    expect(recorder.target).toBe(0)
  })

  it("keeps a chord that was still held when recording stopped", () => {
    play(noteOn(60), noteOn(64))
    recorder.setRecording(false)
    expect(store.patch.steps[0].notes).toEqual([60, 64])
  })
})
