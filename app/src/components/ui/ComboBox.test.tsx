import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ComboBox, filterOptions } from "./ComboBox"

const OPTIONS = [
  { value: "fwd", label: "Forwards" },
  { value: "bwd", label: "Backwards" },
  { value: "fwdbwd", label: "Fwd / Bwd" },
  { value: "bwdfwd", label: "Bwd / Fwd" },
  { value: "random", label: "Random" },
]

// a combo box holding its own value, as a field's setting would
const setup = (disabled = false) => {
  const onChange = vi.fn()
  const Holder = () => {
    const [value, setValue] = useState("bwd")
    return (
      <ComboBox
        aria-label="Direction"
        value={value}
        options={OPTIONS}
        disabled={disabled}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Holder />)
  return { field: screen.getByRole("combobox"), onChange }
}

const shownOptions = () =>
  screen.queryAllByRole("option").map((option) => option.textContent)
const lit = () =>
  screen
    .getAllByRole("option")
    .find((option) => option.className.includes("bg-theme"))?.textContent

describe("filterOptions", () => {
  it("keeps the options holding the typed text, in their own order", () => {
    expect(filterOptions(OPTIONS, "bwd").map((each) => each.value)).toEqual([
      "fwdbwd",
      "bwdfwd",
    ])
    expect(filterOptions(OPTIONS, " ")).toBe(OPTIONS)
    expect(filterOptions(OPTIONS, null)).toBe(OPTIONS)
  })
})

describe("ComboBox", () => {
  it("drags through the options, down the list as the mouse goes down", () => {
    const { field, onChange } = setup()
    fireEvent.mouseDown(field, { button: 0, clientY: 100 })
    fireEvent.mouseMove(document, { clientY: 110 })
    expect(onChange).toHaveBeenLastCalledWith("fwdbwd")
    // the list shows where the drag has got to
    expect(lit()).toBe("Fwd / Bwd")

    // past the end it stops there, and turns back at once
    fireEvent.mouseMove(document, { clientY: 400 })
    expect(field).toHaveValue("Random")
    fireEvent.mouseMove(document, { clientY: 390 })
    expect(field).toHaveValue("Bwd / Fwd")
    fireEvent.mouseUp(document, { clientY: 390 })

    expect(screen.queryByRole("listbox")).toBeNull()
    expect(field).not.toHaveFocus()
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it("opens the list on a click that doesn't drag, the value lit", () => {
    const { field, onChange } = setup()
    fireEvent.mouseDown(field, { button: 0, clientY: 100 })
    fireEvent.mouseUp(document, { clientY: 101 })
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute("aria-expanded", "true")
    expect(shownOptions()).toHaveLength(5)
    expect(lit()).toBe("Backwards")
    expect(screen.getByRole("option", { name: "Backwards" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it("narrows the list to what is typed, and Enter picks the lit one", () => {
    const { field, onChange } = setup()
    act(() => field.focus())
    fireEvent.change(field, { target: { value: "bwd" } })
    expect(shownOptions()).toEqual(["Fwd / Bwd", "Bwd / Fwd"])
    // the first that starts with it
    expect(lit()).toBe("Bwd / Fwd")
    fireEvent.keyDown(field, { key: "ArrowUp" })
    expect(lit()).toBe("Fwd / Bwd")
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith("fwdbwd")
    expect(field).toHaveValue("Fwd / Bwd")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("takes the lit option when left after typing", () => {
    const { field, onChange } = setup()
    act(() => field.focus())
    fireEvent.change(field, { target: { value: "ran" } })
    act(() => field.blur())
    expect(onChange).toHaveBeenCalledWith("random")
  })

  it("leaves the value as it was on Escape", () => {
    const { field, onChange } = setup()
    act(() => field.focus())
    fireEvent.change(field, { target: { value: "for" } })
    fireEvent.keyDown(field, { key: "Escape" })
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(field).toHaveValue("Backwards")
    act(() => field.blur())
    expect(onChange).not.toHaveBeenCalled()
  })

  it("opens the whole list from its arrow, and picks with a click", () => {
    const { field, onChange } = setup()
    const arrow = document.querySelector("[data-combobox-arrow]") as HTMLElement
    fireEvent.mouseDown(arrow, { button: 0 })
    expect(field).toHaveFocus()
    expect(shownOptions()).toHaveLength(5)
    fireEvent.click(screen.getByRole("option", { name: "Random" }))
    expect(onChange).toHaveBeenCalledWith("random")
    expect(screen.queryByRole("listbox")).toBeNull()

    // and closes it again
    fireEvent.mouseDown(arrow, { button: 0 })
    fireEvent.mouseDown(arrow, { button: 0 })
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("neither drags nor opens while disabled", () => {
    const { field, onChange } = setup(true)
    fireEvent.mouseDown(field, { button: 0, clientY: 100 })
    fireEvent.mouseMove(document, { clientY: 200 })
    fireEvent.mouseUp(document, { clientY: 200 })
    fireEvent.mouseDown(
      document.querySelector("[data-combobox-arrow]") as HTMLElement,
      { button: 0 },
    )
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
