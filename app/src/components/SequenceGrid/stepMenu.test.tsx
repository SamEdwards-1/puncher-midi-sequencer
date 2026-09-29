import { createDefaultPatch, setStepNotes } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch
// the first five steps' notes, each step holding one, or null for none
const notes = () =>
  patch()
    .steps.slice(0, 5)
    .map((step) => step.notes[0] ?? null)

const grid = () => within(screen.getByRole("region", { name: "Grid" }))
const step = (number: number) =>
  grid().getByRole("button", { name: `Step ${number}` })

// Right-clicks a step and chooses from its menu.
const choose = (number: number, item: string) => {
  fireEvent.contextMenu(step(number))
  const menu = screen.getByRole("menu", { name: `Step ${number}` })
  fireEvent.click(within(menu).getByRole("button", { name: item }))
}

// steps 1 to 4 hold 60 to 63
const setup = () => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
  })
  let numbered = createDefaultPatch()
  for (let index = 0; index < 4; index++) {
    numbered = setStepNotes(numbered, index, [60 + index])
  }
  rootStore.sequencerStore.patch = numbered
  render(<App rootStore={rootStore} />)
}

describe("a step's menu", () => {
  it("opens on a right-click, selecting the step, and closes on Escape", () => {
    setup()
    fireEvent.contextMenu(step(3))

    const menu = screen.getByRole("menu", { name: "Step 3" })
    expect(step(3)).toHaveAttribute("data-selected", "true")
    // the first item has the focus, for the keyboard
    expect(within(menu).getByRole("button", { name: "Copy" })).toHaveFocus()

    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("copies one step onto another", () => {
    setup()
    fireEvent.contextMenu(step(1))
    const menu = screen.getByRole("menu", { name: "Step 1" })
    // there is nothing to paste until something is copied
    expect(within(menu).getByRole("button", { name: "Paste" })).toBeDisabled()
    fireEvent.click(within(menu).getByRole("button", { name: "Copy" }))

    choose(5, "Paste")
    expect(patch().steps[4].notes).toEqual([60])
  })

  it("inserts an empty step before or after, and selects it", () => {
    setup()
    choose(2, "Insert before")
    expect(notes()).toEqual([60, null, 61, 62, 63])
    expect(step(2)).toHaveAttribute("data-selected", "true")

    choose(3, "Insert after")
    expect(notes()).toEqual([60, null, 61, null, 62])
    expect(step(4)).toHaveAttribute("data-selected", "true")
  })

  it("has nothing to insert after the grid's last step", () => {
    setup()
    rootStore.sequencerStore.patch = { ...patch(), size: 16 }
    fireEvent.contextMenu(step(16))
    const menu = screen.getByRole("menu", { name: "Step 16" })
    expect(
      within(menu).getByRole("button", { name: "Insert after" }),
    ).toBeDisabled()
    expect(
      within(menu).getByRole("button", { name: "Insert before" }),
    ).toBeEnabled()
  })

  it("clears a step, leaving it in place", () => {
    setup()
    choose(2, "Clear")
    expect(notes()).toEqual([60, null, 62, 63, null])
  })

  it("deletes a step, pulling those after it back, as one undo", () => {
    setup()
    choose(2, "Delete")
    expect(notes()).toEqual([60, 62, 63, null, null])

    rootStore.history.undo()
    expect(notes()).toEqual([60, 61, 62, 63, null])
  })
})
