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

  it("fills a step to the limit before moving on", () => {
    play(noteOn(60), noteOff(60), noteOn(64), noteOff(64))

    // two of the four are down, so the step is still the target
    expect(store.patch.steps[0].notes).toEqual([60, 64])
    expect(recorder.target).toBe(0)

    play(noteOn(67), noteOff(67), noteOn(71), noteOff(71))

    expect(store.patch.steps[0].notes).toEqual([60, 64, 67, 71])
    expect(recorder.target).toBe(1)
  })

  it("takes a chord as the notes it holds", () => {
    play(
      noteOn(60),
      noteOn(64),
      noteOn(67),
      noteOff(64),
      noteOff(60),
      noteOff(67),
    )

    expect(store.patch.steps[0].notes).toEqual([60, 64, 67])
    expect(recorder.target).toBe(0)
  })

  it("fills the step as each note is played, without waiting for release", () => {
    play(noteOn(60))
    expect(store.patch.steps[0].notes).toEqual([60])

    play(noteOn(64))
    expect(store.patch.steps[0].notes).toEqual([60, 64])
  })

  it("carries what won't fit onto the next step", () => {
    store.patch = { ...store.patch, maxNotesPerStep: 2 }
    play(noteOn(67), noteOn(60), noteOn(64))

    expect(store.patch.steps[0].notes).toEqual([60, 67])
    expect(store.patch.steps[1].notes).toEqual([64])
    expect(recorder.target).toBe(1)
  })

  it("moves on when a pitch the step already has is played again", () => {
    play(noteOn(60), noteOff(60), noteOn(60), noteOff(60))

    expect(store.patch.steps[0].notes).toEqual([60])
    expect(store.patch.steps[1].notes).toEqual([60])
    expect(recorder.target).toBe(1)
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

  it("starts a fresh step after the take is stopped and armed again", () => {
    play(noteOn(60), noteOff(60))
    recorder.setRecording(false)
    recorder.setRecording(true)
    play(noteOn(64), noteOff(64))

    expect(store.patch.steps[0].notes).toEqual([64])
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
    store.patch = { ...store.patch, maxNotesPerStep: 1 }
    recorder.setTarget(5)
    play(noteOn(60), noteOff(60))

    expect(store.patch.steps[5].notes).toEqual([60])
    expect(recorder.target).toBe(6)
  })

  it("wraps around the end of the grid", () => {
    store.patch = { ...store.patch, size: "small", maxNotesPerStep: 1 }
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
