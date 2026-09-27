import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useScrollingMark } from "./useScrollingMark"

const Scroller = () => {
  useScrollingMark()
  return <div data-testid="scroller" />
}

describe("useScrollingMark", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("marks what scrolls until it has been still a moment", () => {
    vi.useFakeTimers()
    const { getByTestId } = render(<Scroller />)
    const scroller = getByTestId("scroller")

    fireEvent.scroll(scroller)
    expect(scroller.hasAttribute("data-scrolling")).toBe(true)
    // another scroll keeps it
    act(() => vi.advanceTimersByTime(600))
    fireEvent.scroll(scroller)
    act(() => vi.advanceTimersByTime(600))
    expect(scroller.hasAttribute("data-scrolling")).toBe(true)

    act(() => vi.advanceTimersByTime(400))
    expect(scroller.hasAttribute("data-scrolling")).toBe(false)
  })
})
