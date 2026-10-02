import { addEnvelope, createDefaultPatch, PatchJSON } from "@midiseq/core"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { FakeClock, immediateStepWork, ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore
let clock: FakeClock
let ticker: ManualTicker

// jsdom has no layout, so the graph is its fallback 480 wide, inset by 6
const X = (time: number) => 6 + time * 468

const step = (number: number) =>
  screen.getByRole("button", { name: `Step ${number}` })
const playhead = () =>
  document.querySelector("[data-envelope-playhead]") as SVGGElement
const shownAt = () =>
  playhead().getAttribute("visibility") === "visible"
    ? Number(playhead().getAttribute("data-time"))
    : null

// how far across the graph it is drawn
const x = () =>
  Number(
    /translate\(([^ ]+) 0\)/.exec(
      playhead().getAttribute("transform") ?? "",
    )?.[1],
  )

// Audition step is remembered between visits, so it is set explicitly.
const setAudition = (on: boolean) => {
  const toggle = screen.getByRole("switch", {
    name: "Audition step",
  }) as HTMLInputElement
  if (toggle.checked !== on) {
    fireEvent.click(toggle)
  }
}

const runFor = (ms: number) =>
  act(() => {
    const end = clock.time + ms
    while (clock.time < end) {
      clock.time += 25
      ticker.tick()
    }
  })

/**
 * A quarter-note sequencer at 120 BPM, so a step lasts 500 ms, with an
 * envelope on steps 1 and 3; the clock starts at 1000 ms. Step 1 is opened
 * on its CC's tab.
 */
const setup = ({ audition }: { audition: boolean }) => {
  clock = new FakeClock()
  clock.time = 1000
  ticker = new ManualTicker()
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker,
    now: clock.now,
    storage: null,
    stepWork: immediateStepWork(),
  })
  let patch: PatchJSON = { ...createDefaultPatch(), pace: "4th" }
  for (const index of [0, 2]) {
    patch = addEnvelope(patch, index, {
      cc: 74,
      channel: 1,
      points: [{ time: 0, value: 64 }],
    })
  }
  rootStore.sequencerStore.patch = patch
  render(<App rootStore={rootStore} />)
  setAudition(audition)
  fireEvent.click(step(1))
  fireEvent.click(screen.getByRole("tab", { name: "CC 74" }))
}

describe("the envelope editor's playhead", () => {
  it("is hidden while nothing sounds", () => {
    setup({ audition: false })
    expect(shownAt()).toBeNull()
  })

  it("crosses a clicked step as it sounds, then goes", async () => {
    setup({ audition: true })
    await act(async () => {})
    // the click in setup sounded step 1, and the clock hasn't moved since
    expect(shownAt()).toBe(0)
    expect(x()).toBeCloseTo(X(0))

    clock.time += 250
    await waitFor(() => expect(shownAt()).toBeCloseTo(0.5))
    expect(x()).toBeCloseTo(X(0.5))

    clock.time += 250
    await waitFor(() => expect(shownAt()).toBeNull())
  })

  it("follows the sequence from step to step, keeping the tab open", () => {
    setup({ audition: true })
    act(() => rootStore.player.play())

    // step 2 lands at 1550 ms; at 1600 it is a tenth through
    runFor(600)
    expect(step(2)).toHaveAttribute("data-selected", "true")
    expect(shownAt()).toBeCloseTo(0.1)
    expect(x()).toBeCloseTo(X(0.1))
    // step 2 has no envelope for it, but its tab is left open
    expect(screen.getByRole("tab", { name: "CC 74" })).toHaveAttribute(
      "aria-selected",
      "true",
    )

    runFor(500)
    expect(step(3)).toHaveAttribute("data-selected", "true")
    expect(screen.getByRole("tab", { name: "CC 74" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(document.querySelector("[data-envelope-line]")).not.toBeNull()

    act(() => rootStore.player.stop())
    expect(shownAt()).toBeNull()
    // the step last played stays open
    expect(step(3)).toHaveAttribute("data-selected", "true")
  })

  it("follows the sequence whether or not Audition step is on", () => {
    setup({ audition: false })
    act(() => rootStore.player.play())

    // step 2 lands at 1550 ms; at 1600 it is a tenth through
    runFor(600)
    expect(step(2)).toHaveAttribute("data-selected", "true")
    expect(shownAt()).toBeCloseTo(0.1)

    runFor(500)
    expect(step(3)).toHaveAttribute("data-selected", "true")
    expect(document.querySelector("[data-envelope-line]")).not.toBeNull()
    act(() => rootStore.player.stop())
  })

  it("shows the step clicked while playing once it plays", () => {
    setup({ audition: true })
    act(() => rootStore.player.play())
    runFor(100)

    // step 4 is queued, not sounded over the sequence
    const preview = vi.spyOn(rootStore.player, "previewStep")
    fireEvent.click(step(4))
    expect(preview).not.toHaveBeenCalled()
    runFor(500)
    expect(step(4)).toHaveAttribute("data-selected", "true")
    act(() => rootStore.player.stop())
  })
})
