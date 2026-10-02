import { createDefaultPatch } from "@midiseq/core"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { FakeClock, ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore
let clock: FakeClock
let ticker: ManualTicker

const step = (number: number) =>
  screen.getByRole("button", { name: `Step ${number}` })
const arcs = () => document.querySelectorAll<SVGElement>("[data-step-arc]")
const progress = () => Number(arcs()[0]?.dataset.progress)

const runFor = (ms: number) =>
  act(() => {
    const end = clock.time + ms
    while (clock.time < end) {
      clock.time += 25
      ticker.tick()
    }
  })

// A quarter-note sequencer at 120 BPM, so a step lasts 500 ms, looping over
// the whole grid though it is empty; the clock starts at 1000 ms.
const setup = () => {
  clock = new FakeClock()
  clock.time = 1000
  ticker = new ManualTicker()
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker,
    now: clock.now,
    storage: null,
  })
  rootStore.sequencerStore.patch = {
    ...createDefaultPatch(),
    pace: "4th",
    loop: { mode: "custom", end: 15 },
  }
  render(<App rootStore={rootStore} />)
}

describe("the playing step's arc", () => {
  it("is not shown while stopped", () => {
    setup()
    expect(arcs()).toHaveLength(0)
  })

  it("goes round the step playing as it plays, then moves on", async () => {
    setup()
    act(() => rootStore.player.play())

    // step 2 lands at 1550 ms; at 1600 it is a tenth through
    runFor(600)
    expect(arcs()).toHaveLength(1)
    expect(step(2).querySelector("[data-step-arc]")).not.toBeNull()
    await waitFor(() => expect(progress()).toBeCloseTo(0.1))
    expect(arcs()[0].style.transform).toBe(`rotate(${progress() * 360}deg)`)

    runFor(250)
    await waitFor(() => expect(progress()).toBeCloseTo(0.6))

    runFor(250)
    expect(arcs()).toHaveLength(1)
    expect(step(3).querySelector("[data-step-arc]")).not.toBeNull()

    act(() => rootStore.player.stop())
    expect(arcs()).toHaveLength(0)
  })

  it("comes with the step growing as it starts, back the moment it ends", () => {
    setup()
    act(() => rootStore.player.play())

    // step 2 lands at 1550 ms
    runFor(600)
    expect(step(2)).toHaveClass("step-playing")
    expect(step(1)).not.toHaveClass("step-playing")

    act(() => rootStore.player.stop())
    expect(step(2)).not.toHaveClass("step-playing")
  })

  it("shows on a step a click auditions, while it sounds", async () => {
    setup()
    const toggle = screen.getByRole("switch", {
      name: "Audition step",
    }) as HTMLInputElement
    if (!toggle.checked) {
      fireEvent.click(toggle)
    }
    fireEvent.click(step(3))

    await waitFor(() => expect(arcs()).toHaveLength(1))
    expect(step(3)).toHaveAttribute("data-active", "true")
    expect(step(3)).toHaveClass("step-playing", "bg-theme")
    expect(step(3).querySelector("[data-step-arc]")).not.toBeNull()

    clock.time += 250
    await waitFor(() => expect(progress()).toBeCloseTo(0.5))

    // the step lasts 500 ms
    clock.time += 250
    await waitFor(() => expect(arcs()).toHaveLength(0))
    expect(step(3)).toHaveAttribute("data-active", "false")
    expect(step(3)).not.toHaveClass("step-playing")
  })
})
