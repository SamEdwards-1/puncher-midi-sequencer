import { describe, expect, it } from "vitest"
import { fitTabs } from "./fitTabs"

const sizes = { gap: 4, more: 30 }

describe("fitting tabs to a row", () => {
  const widths = [80, 80, 80, 50, 50, 50]

  it("shows every tab that fits, and no menu", () => {
    // 390 of tabs and 20 of gaps
    expect(fitTabs(widths, 410, 0, sizes)).toEqual([0, 1, 2, 3, 4, 5])
    // before anything is measured
    expect(fitTabs([0, 0, 0], 0, 0, sizes)).toEqual([0, 1, 2])
  })

  it("keeps the first tabs in order, leaving room for the menu", () => {
    // 300 less 34 for the menu: 80 + 4 + 80 + 4 + 80 = 248, then 50 spills
    expect(fitTabs(widths, 300, 0, sizes)).toEqual([0, 1, 2])
  })

  it("always shows the open tab, even from the end of the row", () => {
    // the open 50 first, then 80 + 80 more
    expect(fitTabs(widths, 300, 5, sizes)).toEqual([0, 1, 5])
  })

  it("shows at least the open tab in a narrow row", () => {
    expect(fitTabs(widths, 60, 4, sizes)).toEqual([4])
  })
})
