import { useEffect } from "react"

// how long a scrollbar stays after the last scroll
const LINGER_MS = 900

/**
 * Marks whatever is scrolling with data-scrolling, until it has been still
 * for a moment, so the stylesheet can show its scrollbar only then.
 */
export const useScrollingMark = () => {
  useEffect(() => {
    const timers = new Map<Element, number>()
    const onScroll = (event: Event) => {
      const target =
        event.target instanceof Element
          ? event.target
          : document.scrollingElement
      if (target === null) {
        return
      }
      target.setAttribute("data-scrolling", "")
      window.clearTimeout(timers.get(target))
      timers.set(
        target,
        window.setTimeout(() => {
          target.removeAttribute("data-scrolling")
          timers.delete(target)
        }, LINGER_MS),
      )
    }
    // scroll doesn't bubble, so it is caught on the way down
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    })
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true })
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
    }
  }, [])
}
