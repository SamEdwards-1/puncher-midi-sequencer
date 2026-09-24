import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LaneTab, LaneTabs } from "./LaneTabs"

// jsdom lays nothing out, so every tab is 80 wide in a row of 300
const widths = (tab: number, row: number) => {
  const offset = vi
    .spyOn(HTMLElement.prototype, "offsetWidth", "get")
    .mockReturnValue(tab)
  const client = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(row)
  return () => {
    offset.mockRestore()
    client.mockRestore()
  }
}

const tabs: LaneTab[] = [
  { key: "v1", label: "Velocity 1", voice: 0 },
  { key: "v2", label: "Velocity 2", voice: 1 },
  { key: "v3", label: "Velocity 3", voice: 2 },
  { key: "v4", label: "Velocity 4", voice: 3 },
  { key: "cc1", label: "CC 74" },
  { key: "cc2", label: "CC 75" },
]

const shownTabs = () => screen.getAllByRole("tab").map((tab) => tab.textContent)

describe("lane tabs", () => {
  let restore: () => void
  beforeEach(() => {
    // 300 less the + leaves 272; less the menu, 228: two tabs of 80
    restore = widths(80, 300)
  })
  afterEach(() => restore())

  const renderTabs = (open = 0) => {
    const onSelect = vi.fn()
    const onAdd = vi.fn()
    render(
      <LaneTabs
        label="Lanes"
        tabs={tabs}
        open={open}
        onSelect={onSelect}
        onAdd={onAdd}
        addLabel="Add CC"
      />,
    )
    return { onSelect, onAdd }
  }

  it("shows the tabs that fit and puts the rest in a menu", () => {
    renderTabs()
    expect(shownTabs()).toEqual(["Velocity 1", "Velocity 2"])
    const more = screen.getByRole("button", { name: "More lanes" })
    expect(more).toHaveTextContent("4")
    // and the + stays on the row
    expect(screen.getByRole("button", { name: "Add CC" })).toBeInTheDocument()
  })

  it("keeps the open tab on the row", () => {
    renderTabs(5)
    expect(shownTabs()).toEqual(["Velocity 1", "CC 75"])
  })

  it("opens a lane chosen from the menu", () => {
    const { onSelect } = renderTabs()
    fireEvent.click(screen.getByRole("button", { name: "More lanes" }))
    const menu = within(screen.getByRole("menu", { name: "More lanes" }))
    expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Velocity 3", "Velocity 4", "CC 74", "CC 75"])

    fireEvent.click(menu.getByRole("menuitem", { name: "CC 74" }))
    expect(onSelect).toHaveBeenCalledWith(4)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("closes the menu on Escape or a click elsewhere", () => {
    renderTabs()
    const more = screen.getByRole("button", { name: "More lanes" })
    fireEvent.click(more)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()

    fireEvent.click(more)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("has no menu when every tab fits", () => {
    restore()
    restore = widths(40, 600)
    renderTabs()
    expect(shownTabs()).toHaveLength(6)
    expect(screen.queryByRole("button", { name: "More lanes" })).toBeNull()
  })
})
