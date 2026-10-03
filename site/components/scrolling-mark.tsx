"use client"

import { useEffect } from "react"

// how long a scrollbar stays after the last scroll, as in the app
const LINGER_MS = 900
// how near the window's right edge the pointer brings the page's scrollbar
const EDGE_PX = 24

/**
 * Marks whatever is scrolling with data-scrolling until it has been still for
 * a moment, so the stylesheet shows its scrollbar only then, like the app's.
 * The page itself is always under the pointer, so its scrollbar also shows
 * while the pointer is near the right edge, where it can be grabbed.
 */
export function ScrollingMark() {
  useEffect(() => {
    const timers = new Map<Element, number>()
    const mark = (target: Element) => {
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
    const onScroll = (event: Event) => {
      const target =
        event.target instanceof Element
          ? event.target
          : document.scrollingElement
      if (target !== null) mark(target)
    }
    const onPointerMove = (event: PointerEvent) => {
      const page = document.scrollingElement
      if (page !== null && event.clientX >= page.clientWidth - EDGE_PX) {
        mark(page)
      }
    }
    // scroll doesn't bubble, so it is caught on the way down
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    })
    document.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("pointermove", onPointerMove)
      for (const timer of timers.values()) window.clearTimeout(timer)
    }
  }, [])
  return null
}
