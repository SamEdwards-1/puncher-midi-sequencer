import { describe, expect, it } from "vitest"
import { ManualTicker } from "../test/fakes"
import RootStore from "./RootStore"

// The demo patch runs one step a bar; at 120 BPM that is 2000 ms, and the
// first step lands 50 ms after Play.
const STEP_MS = 2000
const START_DELAY_MS = 50

describe("recording controllers while the sequence plays", () => {
  const setup = () => {
    let now = 1000
    const ticker = new ManualTicker()
    const rootStore = new RootStore({
      requestMIDIAccess: null,
      ticker,
      now: () => now,
    })
    const at = (ms: number) => {
      now = 1000 + START_DELAY_MS + ms
      ticker.tick()
    }
    const envelope = (step: number, cc: number) =>
      rootStore.sequencerStore.patch.steps[step].envelopes.find(
        (current) => current.cc === cc,
      )
    return { rootStore, at, envelope }
  }

  it("puts a point where the engine will play it back", () => {
    const { rootStore, at, envelope } = setup()
    rootStore.player.play()
    rootStore.recorder.setRecording(true)

    // half way through the first step
    at(STEP_MS / 2)
    rootStore.midiInput.handleMessage([0xb0, 20, 99])

    // two beats into a four-beat step
    expect(envelope(0, 20)?.points).toEqual([{ time: 2, value: 99 }])
  })

  it("follows the playhead onto the next step", () => {
    const { rootStore, at, envelope } = setup()
    rootStore.player.play()
    rootStore.recorder.setRecording(true)

    at(STEP_MS / 4)
    rootStore.midiInput.handleMessage([0xb0, 20, 10])
    // a quarter of the way into whichever step comes next
    at(STEP_MS + STEP_MS / 4)
    rootStore.midiInput.handleMessage([0xb0, 20, 90])

    const second = rootStore.player.position
    expect(second).not.toBe(0)
    expect(envelope(0, 20)?.points).toEqual([{ time: 1, value: 10 }])
    expect(envelope(second ?? -1, 20)?.points).toEqual([{ time: 1, value: 90 }])
  })

  it("plays back what it recorded, on the step and at the value played", () => {
    const { rootStore, at } = setup()
    rootStore.player.play()
    rootStore.recorder.setRecording(true)
    at(0)
    rootStore.midiInput.handleMessage([0xb0, 20, 64])
    rootStore.recorder.setRecording(false)
    rootStore.player.stop()

    // round again from the top: the step sends the recorded value on landing
    const sent: number[][] = []
    rootStore.player.setOutputs({
      all: [{ send: (data: number[]) => sent.push(data) }],
      voices: [null, null, null, null],
    })
    rootStore.player.play()
    at(10)
    expect(sent).toContainEqual([0xb0, 20, 64])
  })

  it("undoes a whole take at once", () => {
    const { rootStore, at } = setup()
    const before = rootStore.sequencerStore.patch
    rootStore.player.play()
    rootStore.recorder.setRecording(true)
    at(100)
    rootStore.midiInput.handleMessage([0xb0, 20, 10])
    at(900)
    rootStore.midiInput.handleMessage([0xb0, 20, 90])
    rootStore.recorder.setRecording(false)

    rootStore.history.undo()
    expect(rootStore.sequencerStore.patch).toBe(before)
  })
})
