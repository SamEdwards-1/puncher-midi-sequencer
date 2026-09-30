import {
  CSSProperties,
  FC,
  HTMLAttributes,
  RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { cn } from "./cn"

/**
 * The width `ref`'s scrollbar takes beside its content. A scrollbar drawn
 * clear until it is wanted still takes its room, so the gutters inside give
 * it up: see `GUTTER_RIGHT`.
 */
export const useScrollbarGutter = (ref: RefObject<HTMLElement | null>) => {
  const [gutter, setGutter] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    const measure = () => {
      const style = getComputedStyle(element)
      setGutter(
        element.offsetWidth -
          element.clientWidth -
          Number.parseFloat(style.borderLeftWidth) -
          Number.parseFloat(style.borderRightWidth),
      )
    }
    measure()
    if (typeof ResizeObserver === "undefined") {
      return
    }
    // the scrollbar coming and going resizes the content, so this sees it
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return gutter
}

// Scrolling is left to each panel. The side panels scroll as a whole
// (`scrolls`); the middle one scrolls under a grid that sticks to its top and
// shrinks.
export const Panel: FC<HTMLAttributes<HTMLElement> & { scrolls?: boolean }> = ({
  scrolls = false,
  className,
  style,
  ...props
}) => {
  const ref = useRef<HTMLElement>(null)
  const gutter = useScrollbarGutter(ref)
  return (
    <section
      ref={ref}
      className={cn(
        "flex min-h-0 flex-col bg-background",
        scrolls && "overflow-y-auto",
        className,
      )}
      style={
        scrolls
          ? ({ ...style, "--scrollbar-gutter": `${gutter}px` } as CSSProperties)
          : style
      }
      {...props}
    />
  )
}

/**
 * A panel's gutter on the right, in an area that scrolls: 1rem, less the
 * width its scrollbar takes, which the area sets as --scrollbar-gutter, so
 * the content sits as far from the right edge as from the left. `BLEED_RIGHT`
 * reaches back out to the edge, for a divider across the panel. Something
 * floating over the area, clear of its scrollbar, sets the width back to 0.
 */
export const GUTTER_RIGHT = "pr-[calc(1rem-var(--scrollbar-gutter,0px))]"
export const BLEED_RIGHT = "-mr-[calc(1rem-var(--scrollbar-gutter,0px))]"

export interface PanelHeaderProps extends HTMLAttributes<HTMLElement> {
  as?: "h2" | "div"
}

export const PanelHeader: FC<PanelHeaderProps> = ({
  as: Tag = "h2",
  className,
  ...props
}) => (
  <Tag
    className={cn(
      "m-0 border-b border-divider pl-4",
      GUTTER_RIGHT,
      "py-3 text-title font-semibold text-fg",
      className,
    )}
    {...props}
  />
)
