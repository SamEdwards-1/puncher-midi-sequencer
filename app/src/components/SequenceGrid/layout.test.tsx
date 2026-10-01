import { createDefaultPatch } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

const scroller = () =>
  document.querySelector("[data-grid-scroller]") as HTMLElement

// jsdom lays nothing out, so the column is given a height: 800, from 100 to
// 900 down the window, which leaves 488 under the grid at its smallest
const COLUMN = { top: 100, height: 800 }
const VIEW = 488

beforeEach(() => {
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(
    function (this: Element) {
      return this.hasAttribute("data-grid-scroller") ? COLUMN.height : 0
    },
  )
  const rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  render(<App rootStore={rootStore} />)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the centre column", () => {
  it("scrolls the grid, the actions and the step editor as one", () => {
    const column = within(scroller())
    expect(column.getByRole("button", { name: "Step 1" })).toBeInTheDocument()
    expect(column.getByRole("button", { name: "Hold" })).toBeInTheDocument()
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
    // the grid's frame alone, so the rest of the column isn't restyled
    const frame = document.querySelector("[data-grid-frame]") as HTMLElement
    expect(frame.style.getPropertyValue("--grid-scroll")).toBe("0px")
    Object.defineProperty(scroller(), "scrollTop", {
      value: 120,
      configurable: true,
    })
    fireEvent.scroll(scroller())
    expect(frame.style.getPropertyValue("--grid-scroll")).toBe("120px")
    expect(scroller().style.getPropertyValue("--grid-scroll")).toBe("")
  })
})

describe("the envelope editor, at the column's end", () => {
  const editor = () =>
    document.querySelector("[data-envelope-editor]") as HTMLElement
  const graph = () =>
    Number(
      screen
        .getByRole("application", { name: "Envelope" })
        .querySelector("svg")
        ?.getAttribute("height"),
    )

  // The editor is 216 tall besides its graph, and its top is wherever the
  // column has scrolled it to; its bottom is the window's once it is in
  // view.
  const REST = 216
  const BOTTOM = COLUMN.top + COLUMN.height
  let top = 0
  const bottom = () => top + REST + graph()
  const layOut = () => {
    const rect = (top: number, height: number) =>
      ({ top, bottom: top + height, height }) as DOMRect
    vi.spyOn(scroller(), "getBoundingClientRect").mockReturnValue(
      rect(COLUMN.top, COLUMN.height),
    )
    vi.spyOn(editor(), "getBoundingClientRect").mockImplementation(() =>
      rect(top, REST + graph()),
    )
  }
  const scrollTo = (editorTop: number) => {
    top = editorTop
    fireEvent.scroll(scroller())
  }

  it("keeps room below it to grow into, the view under the smallest grid", () => {
    expect(editor().parentElement).toHaveStyle({ minHeight: `${VIEW}px` })
  })

  it("keeps its graph's own height until it is all in view", () => {
    layOut()
    scrollTo(700)
    expect(graph()).toBe(240)
    // its bottom on the window's
    scrollTo(BOTTOM - REST - 240)
    expect(graph()).toBe(240)
  })

  it("grows as the column scrolls on, its bottom staying at the window's", () => {
    layOut()
    for (const at of [440, 425, 415]) {
      scrollTo(at)
      expect(bottom()).toBe(BOTTOM)
    }
    expect(graph()).toBe(BOTTOM - 415 - REST)
  })

  it("fills the view once the step editor is under the grid, and stops", () => {
    layOut()
    // the grid at its smallest is 312 tall
    scrollTo(COLUMN.top + 312)
    expect(bottom()).toBe(BOTTOM)
    expect(REST + graph()).toBe(VIEW)
    scrollTo(COLUMN.top + 280)
    expect(REST + graph()).toBe(VIEW)
  })

  it("shrinks back as the column scrolls back", () => {
    layOut()
    scrollTo(430)
    scrollTo(700)
    expect(graph()).toBe(240)
  })

  it("keeps its bottom at the window's as the step editor above it changes", () => {
    layOut()
    scrollTo(430)
    // a note added above pushes the editor down, with no scroll
    top = 440
    fireEvent.click(screen.getByRole("button", { name: "Add note" }))
    expect(bottom()).toBe(BOTTOM)
  })
})
