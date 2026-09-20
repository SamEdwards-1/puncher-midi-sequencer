import { createDefaultPatch, setStepNotes } from "@midiseq/core"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
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
    expect(screen.getByText("C4")).toBeInTheDocument()

    click("Note 1 up")
    expect(patch().steps[0].notes).toEqual([61])

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

  it("adds, edits and removes CC events", () => {
    setup()
    expect(screen.getByText(/No CC events/)).toBeInTheDocument()

    click("Add CC")
    const [cc] = patch().steps[0].ccs
    expect(cc).toMatchObject({ cc: 74, value: 64, channel: "voice" })

    click(`CC number ${cc.id} up`)
    expect(patch().steps[0].ccs[0].cc).toBe(75)

    fireEvent.change(screen.getByLabelText(`CC output ${cc.id}`), {
      target: { value: "2" },
    })
    expect(patch().steps[0].ccs[0].output).toBe(2)

    fireEvent.change(screen.getByLabelText(`Channel ${cc.id}`), {
      target: { value: "5" },
    })
    expect(patch().steps[0].ccs[0].channel).toBe(5)

    click(`Remove CC ${cc.id}`)
    expect(patch().steps[0].ccs).toEqual([])
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

    click("Undo")
    expect(patch().steps[0].notes).toEqual([])
  })
})
