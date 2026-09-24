import { createDefaultPatch, setStepNotes } from "@midiseq/core"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch
const selectStep = (number: number) =>
  fireEvent.click(screen.getByRole("button", { name: `Step ${number}` }))
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

const setup = (notes: number[] = []) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
  })
  rootStore.sequencerStore.patch = setStepNotes(createDefaultPatch(), 0, notes)
  render(<App rootStore={rootStore} />)
  selectStep(1)
}

describe("step editor", () => {
  it("follows the step picked in the grid", () => {
    setup()
    selectStep(5)
    expect(screen.getByText(/Step Editor 5/)).toBeInTheDocument()
  })

  it("adds, edits and removes notes", () => {
    setup()
    expect(screen.getByText(/No notes/)).toBeInTheDocument()

    click("Add note")
    expect(patch().steps[0].notes).toEqual([60])
    // the field shows the name, and is one that can be typed into
    expect(screen.getByLabelText("Note 1")).toHaveValue("C4")

    click("Note 1 up")
    expect(patch().steps[0].notes).toEqual([61])
    expect(screen.getByLabelText("Note 1")).toHaveValue("C#4")

    click("Remove note 1")
    expect(patch().steps[0].notes).toEqual([])
  })

  it("keeps every note while one is stepped up past another", () => {
    setup([57, 60, 64])

    // 58, 59, then 60 is taken so it carries on to 61, then 62
    for (let click = 0; click < 4; click++) {
      fireEvent.click(screen.getByRole("button", { name: "Note 1 up" }))
    }
    expect(patch().steps[0].notes).toEqual([62, 60, 64])

    // and the row stays where it is, so the same button keeps the same note
    fireEvent.click(screen.getByRole("button", { name: "Note 2 up" }))
    expect(patch().steps[0].notes).toEqual([62, 61, 64])
  })

  it("takes a note name typed into the field", () => {
    setup([60])
    const type = (text: string) => {
      const field = screen.getByLabelText("Note 1")
      fireEvent.focus(field)
      fireEvent.change(field, { target: { value: text } })
      fireEvent.keyDown(field, { key: "Enter" })
    }

    type("G#5")
    expect(patch().steps[0].notes).toEqual([80])

    // a bare letter stays in the octave the field is on
    type("D")
    expect(patch().steps[0].notes).toEqual([74])

    // what isn't a note leaves it alone, as does an octave out of range
    type("H4")
    expect(patch().steps[0].notes).toEqual([74])
    type("C10")
    expect(patch().steps[0].notes).toEqual([74])

    // and the field only ever holds note-name characters
    const field = screen.getByLabelText("Note 1")
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: "x!F#2" } })
    expect((field as HTMLInputElement).value).toBe("F#2")
    fireEvent.keyDown(field, { key: "Escape" })
    expect(patch().steps[0].notes).toEqual([74])
  })

  it("transposes the whole step", () => {
    setup([60, 64])
    click("+12")
    expect(patch().steps[0].notes).toEqual([72, 76])
    click("-1")
    expect(patch().steps[0].notes).toEqual([71, 75])
  })

  it("changes a step's state", () => {
    setup()
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "skip" },
    })
    expect(patch().steps[0].state).toBe("skip")
  })

  it("marks notes past the limit and trims them on request", () => {
    setup([48, 52, 55, 60, 64])
    expect(screen.getByText(/past the limit/)).toBeInTheDocument()

    click("Trim to limit")
    expect(patch().steps[0].notes).toEqual([48, 52, 55, 60])
    expect(screen.queryByText(/past the limit/)).toBeNull()
  })

  it("copies a step onto another and clears one", () => {
    setup([60, 64])
    click("Copy")
    selectStep(3)
    click("Paste")
    expect(patch().steps[2].notes).toEqual([60, 64])

    click("Clear")
    expect(patch().steps[2].notes).toEqual([])
    // the copy is still on the clipboard
    click("Paste")
    expect(patch().steps[2].notes).toEqual([60, 64])
  })

  it("undoes an edit made here", () => {
    setup()
    click("Add note")
    expect(patch().steps[0].notes).toEqual([60])

    fireEvent.click(editItem("Undo"))
    expect(patch().steps[0].notes).toEqual([])
  })
})
