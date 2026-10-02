import { createDefaultPatch, PatchJSON } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const CHORDS = [
  [60, 64, 67],
  [62, 65, 69],
  [64, 67, 71],
  [65, 69, 72],
]

const patch = () => rootStore.sequencerStore.patch

const sequencer = () =>
  within(screen.getByRole("region", { name: "Sequencer" }))
const tags = () =>
  [
    ...(document.querySelector("[data-scale-guesses]") as HTMLElement).children,
  ] as HTMLButtonElement[]
const lit = () =>
  tags()
    .filter((tag) => tag.getAttribute("aria-pressed") === "true")
    .map((tag) => tag.textContent)
const detect = () =>
  sequencer().getByRole("button", { name: "Detect the scale" })

const setup = (change: (patch: PatchJSON) => PatchJSON = (each) => each) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    now: () => 0,
    storage: null,
  })
  const blank = createDefaultPatch()
  rootStore.sequencerStore.patch = change({
    ...blank,
    scale: null,
    // C major's notes, one chord a step, so there is something to detect
    steps: blank.steps.map((step, index) => ({
      ...step,
      notes: CHORDS[index] ?? step.notes,
    })),
  })
  render(<App rootStore={rootStore} />)
}

describe("the sequencer's scale tags", () => {
  it("always offers chromatic last, lit while there is no scale", () => {
    setup()
    expect(tags().at(-1)?.textContent).toBe("Chromatic")
    expect(tags().length).toBeGreaterThan(1)
    fireEvent.click(tags().at(-1) as HTMLElement)
    expect(lit()).toEqual(["Chromatic"])
  })

  it("starts on the first scale found, when the patch has none", () => {
    setup()
    const first = tags()[0]
    expect(lit()).toEqual([first.textContent])
    expect(patch().scale).not.toBeNull()
    expect(sequencer().getByLabelText("Scale")).not.toHaveDisplayValue(
      "Chromatic",
    )
  })

  it("sets the scale a tag names, and chromatic takes it away", () => {
    setup()
    const guess = tags()[0]
    fireEvent.click(guess)
    expect(patch().scale).not.toBeNull()
    expect(lit()).toEqual([guess.textContent])

    fireEvent.click(tags().at(-1) as HTMLElement)
    expect(patch().scale).toBeNull()
    expect(lit()).toEqual(["Chromatic"])
  })

  it("detects the best fitting scale, keeping the fit", () => {
    setup((each) => ({
      ...each,
      scale: {
        tonic: 1,
        name: "major",
        steps: [0, 2, 4, 5, 7, 9, 11],
        fit: "down",
      },
    }))
    const best = tags()[0].textContent
    fireEvent.click(detect())
    expect(lit()).toEqual([best])
    expect(patch().scale?.fit).toBe("down")
  })

  it("has only chromatic, and nothing to detect, without notes", () => {
    setup((each) => ({
      ...each,
      steps: each.steps.map((step) => ({ ...step, notes: [] })),
    }))
    expect(tags().map((tag) => tag.textContent)).toEqual(["Chromatic"])
    expect(detect()).toBeDisabled()
  })
})
