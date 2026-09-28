import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"
import { GRAPH_HEIGHT } from "./EnvelopeGraph"

/**
 * The column the step editor scrolls in: the element that scrolls, and how
 * tall its view is under the grid at its smallest, which is as tall as the
 * envelope editor can grow.
 */
export interface Column {
  scroller: RefObject<HTMLElement | null>
  view: number
}

/**
 * How tall the envelope graph is drawn: its own height until the editor is
 * all in view, then as much taller as keeps the editor's bottom at the
 * window's, until the editor fills the view.
 *
 * `room` is how far below the editor's top the window's bottom is, `rest`
 * how tall the editor is less its graph, and `view` the column's. It comes
 * to whole pixels, so a scroll of less than one leaves the graph as it is.
 */
export const graphHeightFor = ({
  room,
  rest,
  view,
}: {
  room: number
  rest: number
  view: number
}) => Math.max(GRAPH_HEIGHT, Math.round(Math.min(room, view) - rest))

/**
 * The graph's height for the editor in `editor`, kept up as the column
 * scrolls and whenever the editor, or anything above it, changes.
 */
export const useGraphHeight = (
  editor: RefObject<HTMLElement | null>,
  column: Column | undefined,
) => {
  const [height, setHeight] = useState(GRAPH_HEIGHT)
  // the height last drawn, taken off the editor's to leave the rest of it
  const drawn = useRef(height)
  const scroller = column?.scroller
  const view = column?.view ?? 0

  const measure = useCallback(() => {
    const box = editor.current?.getBoundingClientRect()
    const bottom = scroller?.current?.getBoundingClientRect().bottom
    if (box === undefined || bottom === undefined) {
      return GRAPH_HEIGHT
    }
    return graphHeightFor({
      room: bottom - box.top,
      rest: box.height - drawn.current,
      view,
    })
  }, [editor, scroller, view])

  // after every render, for whatever it has moved or resized
  useLayoutEffect(() => {
    drawn.current = height
    const next = measure()
    if (next !== height) {
      setHeight(next)
    }
  })

  // As the column scrolls, drawn in the same frame, so the editor's bottom
  // never lifts off the window's.
  useEffect(() => {
    const element = scroller?.current
    if (!element) {
      return
    }
    const onScroll = () => {
      const next = measure()
      if (next !== drawn.current) {
        flushSync(() => setHeight(next))
      }
    }
    element.addEventListener("scroll", onScroll, { passive: true })
    return () => element.removeEventListener("scroll", onScroll)
  }, [scroller, measure])

  return height
}
