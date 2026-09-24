import { createDefaultPatch } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

const scroller = () =>
  document.querySelector("[data-grid-scroller]") as HTMLElement

beforeEach(() => {
  const rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  render(<App rootStore={rootStore} />)
})

describe("the centre column", () => {
  it("scrolls the grid, the actions and the step editor as one", () => {
    const column = within(scroller())
    expect(column.getByRole("button", { name: "Step 1" })).toBeInTheDocument()
    expect(column.getByRole("button", { name: "Hang" })).toBeInTheDocument()
    expect(column.getByText(/Step Editor/)).toBeInTheDocument()
  })

  it("keeps the grid in a layer stuck to the top, over the editors", () => {
    const frame = document.querySelector("[data-grid-frame]") as HTMLElement
    expect(frame.parentElement).toHaveClass("sticky", "top-0")
    expect(frame).toContainElement(
      screen.getByRole("button", { name: "Step 1" }),
    )
  })

  it("tells the grid how far the column has scrolled, for it to shrink by", () => {
    expect(scroller().style.getPropertyValue("--grid-scroll")).toBe("0px")
    Object.defineProperty(scroller(), "scrollTop", {
      value: 120,
      configurable: true,
    })
    fireEvent.scroll(scroller())
    expect(scroller().style.getPropertyValue("--grid-scroll")).toBe("120px")
  })
})
