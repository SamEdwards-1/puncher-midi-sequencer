import { createDefaultPatch } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

const setup = () => {
  const rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  render(<App rootStore={rootStore} />)
}

// a window the given width, as far as media queries go
const windowWidth = (width: number) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0) <= width,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const region = (name: string) => screen.queryByRole("region", { name })
const tab = (name: string) => screen.getByRole("tab", { name })

describe("the layout", () => {
  it("gives the sequencer, the grid and the voices a column each from 1200px", () => {
    windowWidth(1200)
    setup()
    expect(region("Sequencer")).toBeInTheDocument()
    expect(region("Grid")).toBeInTheDocument()
    expect(region("Voices")).toBeInTheDocument()
    expect(screen.queryByRole("tablist", { name: "Settings panes" })).toBeNull()
  })

  // before any test here picks a tab, so the grid's is the one open
  it("puts everything in one column below 876px, the grid's tab first", () => {
    windowWidth(875)
    setup()
    const panes = within(
      screen.getByRole("tablist", { name: "Settings panes" }),
    )
    expect(panes.getAllByRole("tab").map((each) => each.textContent)).toEqual([
      "Grid",
      "Voices",
      "Sequencer",
    ])
    expect(region("Grid")).toBeInTheDocument()
    expect(region("Voices")).toBeNull()
    expect(region("Sequencer")).toBeNull()

    fireEvent.click(tab("Sequencer"))
    expect(region("Sequencer")).toBeInTheDocument()
    expect(region("Grid")).toBeNull()

    fireEvent.click(tab("Voices"))
    expect(region("Voices")).toBeInTheDocument()
    expect(region("Grid")).toBeNull()
  })

  it("puts the settings on the left and the grid on the right below 1200px", () => {
    windowWidth(876)
    setup()
    const panes = screen.getByRole("tablist", { name: "Settings panes" })
    const grid = region("Grid") as HTMLElement
    expect(grid).toBeInTheDocument()
    expect(
      panes.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // the grid has its own column, so it has no tab
    expect(within(panes).queryByRole("tab", { name: "Grid" })).toBeNull()
  })

  it("folds the sequencer into a tab before Voices below 1200px", () => {
    windowWidth(1199)
    setup()
    const panes = within(
      screen.getByRole("tablist", { name: "Settings panes" }),
    )
    expect(panes.getAllByRole("tab").map((each) => each.textContent)).toEqual([
      "Sequencer",
      "Voices",
    ])

    fireEvent.click(tab("Sequencer"))
    expect(region("Sequencer")).toBeInTheDocument()
    expect(region("Voices")).toBeNull()
    // the tab names the pane, so it has no heading of its own
    expect(
      within(region("Sequencer") as HTMLElement).queryByRole("heading"),
    ).toBeNull()

    fireEvent.click(tab("Voices"))
    expect(region("Voices")).toBeInTheDocument()
    expect(region("Sequencer")).toBeNull()
    expect(tab("Voices")).toHaveAttribute("aria-selected", "true")
  })

  it("keeps a step's jump in the step editor", () => {
    setup()
    const grid = within(region("Grid") as HTMLElement)
    fireEvent.click(grid.getByRole("button", { name: "Jump rule" }))
    expect(grid.getByLabelText("Rule")).toBeInTheDocument()
    expect(
      within(region("Sequencer") as HTMLElement).queryByLabelText("Rule"),
    ).toBeNull()
  })
})
