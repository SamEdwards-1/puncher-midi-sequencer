import {
  addEnvelope,
  createDefaultPatch,
  PatchJSON,
  setSequencer,
  setStepNotes,
  setVoice,
} from "@midiseq/core"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { App } from "../components/App/App"
import RootStore from "../stores/RootStore"
import { dragFrom, ramp, X, Y } from "../test/envelopeEditor"
import { FakeClock, ManualTicker } from "../test/fakes"
import { makeScale } from "../theory/scales"

let rootStore: RootStore
let clock: FakeClock
let ticker: ManualTicker

// how many times a step's preview has been made, each a play of the
// sequence up to it
const made = () => rootStore.stepPreviews.made
const patch = () => rootStore.sequencerStore.patch
const edit = (change: (patch: PatchJSON) => PatchJSON) =>
  act(() => {
    rootStore.sequencerStore.patch = change(patch())
  })
const button = (name: string) => screen.getByRole("button", { name })
const selectStep = (number: number) => fireEvent.click(button(`Step ${number}`))
// what each panel shows of the step: the Velocity lane's lollipops, and the
// collisions marked on a pattern dot
const velocities = () =>
  [
    ...screen
      .getByRole("application", { name: "Envelope" })
      .querySelectorAll("[data-point]"),
  ].map((point) => Number(point.getAttribute("data-velocity")))
const marks = (voice: number, number: number) =>
  [
    ...button(`Voice ${voice} Dot ${number}`).querySelectorAll(
      "[data-collision]",
    ),
  ].map((mark) => Number(mark.getAttribute("data-collision")))
const runFor = (ms: number) =>
  act(() => {
    const end = clock.time + ms
    while (clock.time < end) {
      clock.time += 25
      ticker.tick()
    }
  })

/**
 * Quarter-note steps at 120 BPM, and a step 1 holding middle C, with an
 * envelope on CC 74 driving nothing: voices 1 and 2 both play it in 8ths,
 * colliding on each dot. Nothing else holds anything, so the sequence plays
 * step 1 over and over. Step 1 is open on its Velocity lane, with both the
 * pattern dots and the graph showing what it plays.
 */
beforeEach(() => {
  clock = new FakeClock()
  clock.time = 1000
  ticker = new ManualTicker()
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker,
    now: clock.now,
    storage: null,
  })
  let start: PatchJSON = { ...createDefaultPatch(), pace: "4th" }
  start = setStepNotes(start, 0, [60])
  start = setVoice(start, 1, { enabled: true })
  start = addEnvelope(start, 0, {
    cc: 74,
    channel: 1,
    shape: "ramps",
    points: ramp,
  })
  // a scale of its own, so none is found from the notes at first
  rootStore.sequencerStore.patch = { ...start, scale: makeScale(0, "major") }
  render(<App rootStore={rootStore} />)
  const audition = screen.getByRole("switch", {
    name: "Audition step",
  }) as HTMLInputElement
  if (audition.checked) {
    fireEvent.click(audition)
  }
  selectStep(1)
  // the lane is view state, and outlives a test
  fireEvent.click(screen.getByRole("tab", { name: "Velocity 1" }))
})

describe("a step's preview, shared by the panels showing it", () => {
  it("is made once for both", () => {
    expect(screen.getByRole("region", { name: "Patterns" })).toBeTruthy()
    expect(screen.getByRole("application", { name: "Envelope" })).toBeTruthy()
    expect(velocities()).toEqual([64, 64])
    expect(marks(1, 1)).toEqual([0])
    expect(made()).toBe(1)

    // once for each step selected, and kept for going back to
    selectStep(2)
    expect(velocities()).toEqual([])
    expect(made()).toBe(2)
    selectStep(1)
    expect(velocities()).toEqual([64, 64])
    expect(made()).toBe(2)
  })

  it("is not made again for edits the step does not hear", () => {
    edit((patch) => setSequencer(patch, { name: "Renamed", tempo: 90 }))
    edit((patch) => setVoice(patch, 0, { program: 40 }))

    // dragging a point of the envelope, which drives nothing
    fireEvent.click(screen.getByRole("tab", { name: "CC 74" }))
    fireEvent.click(button("Edit points"))
    dragFrom(
      [X(0.25), Y(32)],
      [
        [X(0.25), Y(60)],
        [X(0.25), Y(100)],
      ],
    )
    expect(patch().steps[0].envelopes[0].points[0].value).toBe(100)

    expect(made()).toBe(1)
    expect(marks(1, 1)).toEqual([0])
  })

  it("is made again for an edit the step hears", () => {
    edit((patch) => setVoice(patch, 0, { velocity: 100 }))
    expect(made()).toBe(2)
    expect(velocities()).toEqual([100, 100])
    // voice 1 an octave up, apart from voice 2
    edit((patch) => setVoice(patch, 0, { transposeAmt: 12 }))
    expect(made()).toBe(3)
    expect(marks(1, 1)).toEqual([])
  })

  it("gives way to the round sounding while the step plays", () => {
    act(() => rootStore.player.play())
    // the second time round, on the voices' third and fourth dots
    runFor(600)
    expect(marks(1, 1)).toEqual([])
    expect(marks(1, 3)).toEqual([0])
    const before = made()

    // an edit is heard in the round, with no preview made for it
    edit((patch) => setVoice(patch, 0, { velocity: 100 }))
    expect(velocities()).toEqual([100, 100])
    expect(marks(1, 3)).toEqual([0])
    expect(made()).toBe(before)

    // stopped, the step is as the sequence first reaches it
    act(() => rootStore.player.stop())
    expect(marks(1, 1)).toEqual([0])
    expect(velocities()).toEqual([100, 100])
    expect(made()).toBe(before + 1)
  })
})
