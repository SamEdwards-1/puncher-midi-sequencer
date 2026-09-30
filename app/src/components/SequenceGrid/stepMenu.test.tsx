import { createDefaultPatch, setStepNotes } from "@midiseq/core"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
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

  it("copies and pastes the selected step with Ctrl+C and Ctrl+V", () => {
    setup()
    fireEvent.click(step(2))
    fireEvent.keyDown(window, { code: "KeyC", ctrlKey: true })
    fireEvent.click(step(5))
    fireEvent.keyDown(window, { code: "KeyV", ctrlKey: true })
    expect(patch().steps[4].notes).toEqual([61])

    // Cmd stands in for Ctrl
    fireEvent.click(step(3))
    fireEvent.keyDown(window, { code: "KeyV", metaKey: true })
    expect(patch().steps[2].notes).toEqual([61])
  })

  it("leaves Ctrl+C to selected text, until a step is clicked", () => {
    setup()
    const selectText = () => {
      const range = document.createRange()
      range.selectNodeContents(screen.getByText("Hold"))
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
    // with text selected and nothing focused, the browser copies the text
    fireEvent.click(step(4))
    selectText()
    fireEvent.keyDown(window, { code: "KeyC", ctrlKey: true })
    fireEvent.click(step(5))
    fireEvent.keyDown(window, { code: "KeyV", ctrlKey: true })
    expect(patch().steps[4].notes).not.toEqual([63])

    // clicking a step leaves the text selected, but copies the step
    step(3).focus()
    fireEvent.click(step(3))
    fireEvent.keyDown(step(3), { code: "KeyC", ctrlKey: true })
    fireEvent.click(step(5))
    fireEvent.keyDown(window, { code: "KeyV", ctrlKey: true })
    expect(patch().steps[4].notes).toEqual([62])
    window.getSelection()?.removeAllRanges()
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

  it("fills a step with notes in, leaving an empty one a ring", () => {
    setup()
    expect(step(1)).toHaveClass("bg-step", "border-transparent")
    expect(step(5)).toHaveClass("bg-transparent", "border-step")
  })

  it("squashes a cleared step, and bounces a pasted one in", async () => {
    setup()
    choose(2, "Clear")
    expect(step(2).className).toMatch(/\bstep-clear(-again)?\b/)
    expect(step(3).className).not.toMatch(/\bstep-/)

    choose(1, "Copy")
    choose(5, "Paste")
    expect(step(5).className).toMatch(/\bstep-land(-again)?\b/)
    // done with once it has run
    await waitFor(() => expect(step(5).className).not.toMatch(/\bstep-/), {
      timeout: 1500,
    })
  })

  it("bounces an inserted step in, the rest moving on in a wave", () => {
    setup()
    choose(2, "Insert before")
    expect(step(1).className).not.toMatch(/\bstep-/)
    expect(step(2).className).toMatch(/\bstep-land(-again)?\b/)
    expect(step(3).className).toMatch(/\bstep-shift-on(-again)?\b/)
    // the last starting 240ms in, so its 360ms move ends at 0.6s
    expect(step(64).style.animationDelay).toBe("240ms")
    // an empty step went off the end, so nothing falls
    expect(document.querySelector("[data-falling-step]")).toBeNull()
  })

  it("drops the last step off the grid when an insert pushes out notes", async () => {
    setup()
    rootStore.sequencerStore.patch = setStepNotes(patch(), 63, [72])
    choose(2, "Insert before")
    const falling = document.querySelector("[data-falling-step]")
    expect(falling).toHaveTextContent("64")
    expect(falling).toHaveClass("step-fall", "bg-step")
    expect(falling).toHaveAttribute("aria-hidden", "true")
    await waitFor(
      () => expect(document.querySelector("[data-falling-step]")).toBeNull(),
      { timeout: 1500 },
    )
  })

  it("moves the steps after a deleted one back", () => {
    setup()
    choose(2, "Delete")
    expect(step(1).className).not.toMatch(/\bstep-/)
    expect(step(2).className).toMatch(/\bstep-shift-back(-again)?\b/)
    expect(step(64).className).toMatch(/\bstep-shift-back(-again)?\b/)
  })

  it("deletes a step, pulling those after it back, as one undo", () => {
    setup()
    choose(2, "Delete")
    expect(notes()).toEqual([60, 62, 63, null, null])

    rootStore.history.undo()
    expect(notes()).toEqual([60, 61, 62, 63, null])
  })
})
