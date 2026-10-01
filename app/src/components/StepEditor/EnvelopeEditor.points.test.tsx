import {
  EnvelopePointJSON,
  ModulationJSON,
  modulationCC,
  PatchJSON,
} from "@midiseq/core"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  openEditor,
  points,
  ramp,
  rootStore,
  startStore,
  svg,
  X,
  Y,
} from "../../test/envelopeEditor"
import { App } from "../App/App"

const setup = (
  shape: EnvelopePointJSON[] | null = ramp,
  change: (patch: PatchJSON) => PatchJSON = (patch) => patch,
) => {
  render(<App rootStore={startStore(shape, change)} />)
  openEditor(shape)
}

const rightClick = (x: number, y: number) =>
  fireEvent.contextMenu(svg(), { clientX: x, clientY: y })
const dialog = () => screen.queryByRole("dialog", { name: /^Point / })

describe("a point's value", () => {
  it("opens on a right-click on a point, and not elsewhere", () => {
    setup()
    rightClick(X(0.5), Y(10))
    expect(dialog()).toBeNull()

    rightClick(X(0.75), Y(96))
    expect(dialog()).toHaveAccessibleName("Point 2")
    expect(screen.getByLabelText("Point 2 value")).toHaveValue("96")
  })

  it("types and steps a plain CC's value, keeping the point's time", () => {
    setup()
    rightClick(X(0.25), Y(32))
    const field = screen.getByLabelText("Point 1 value")
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: "100" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(points()).toEqual([
      { time: 0.25, value: 100 },
      { time: 0.75, value: 96 },
    ])

    fireEvent.click(screen.getByRole("button", { name: "Point 1 value up" }))
    expect(points()[0]).toEqual({ time: 0.25, value: 101 })

    // a run of edits to the one point undoes as one, as the velocity's do
    fireEvent.click(screen.getByRole("button", { name: "Point 1 value up" }))
    expect(points()[0].value).toBe(102)
    act(() => rootStore.history.undo())
    expect(points()[0].value).toBe(32)
  })

  it("deletes the point, and closes", () => {
    setup()
    rightClick(X(0.25), Y(32))
    fireEvent.click(
      within(dialog() as HTMLElement).getByRole("button", {
        name: "Delete point",
      }),
    )
    expect(points()).toEqual([{ time: 0.75, value: 96 }])
    expect(dialog()).toBeNull()
  })

  it("closes on Escape, or a press elsewhere", () => {
    setup()
    rightClick(X(0.25), Y(32))
    fireEvent.keyDown(window, { key: "Escape" })
    expect(dialog()).toBeNull()

    rightClick(X(0.25), Y(32))
    fireEvent.pointerDown(document.body)
    expect(dialog()).toBeNull()
  })

  it("picks a modulated setting's value from its list", () => {
    const modulation: ModulationJSON = {
      target: { kind: "voice", voice: 0, setting: "rule" },
      cc: 74,
      from: "nth",
      to: "fall",
    }
    setup()
    act(() => {
      rootStore.sequencerStore.patch = {
        ...rootStore.sequencerStore.patch,
        modulations: [modulation],
      }
    })
    rightClick(X(0.25), Y(32))
    const field = screen.getByRole("combobox", { name: "Point 1 value" })
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: "Rise" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(points()[0]).toEqual({
      time: 0.25,
      value: modulationCC(modulation, "rise"),
    })
    expect(field).toHaveValue("Rise")
  })
})
