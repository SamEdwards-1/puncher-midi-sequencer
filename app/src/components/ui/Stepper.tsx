import MinusIcon from "mdi-react/MinusIcon"
import PlusIcon from "mdi-react/PlusIcon"
import {
  FC,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useRef,
  useState,
} from "react"
import { useStores } from "../../hooks/useStores"
import { observeDrag } from "../StepEditor/observeDrag"
import { cn } from "./cn"
import { dragTravel } from "./dragSpeed"

// The buttons and the value are one control: the buttons round only their
// outer corners, and meet the value square-on.
const STEP =
  "flex w-[1.6rem] flex-none items-center justify-center bg-background-secondary text-fg enabled:hover:bg-highlight disabled:text-fg-tertiary"

// Framed top and bottom in the buttons' fill, the value closes the gap
// between them; the frame shows only while it is being typed in. Hovered
// while not, it is faintly lit, as something that can be pressed. A label
// around the stepper passes its hover on to the value, so a hovered button
// doesn't light the value too.
const VALUE =
  "order-2 box-border flex min-w-0 grow items-center justify-center border-y border-transparent text-center font-mono text-body [:not(:has(>button:hover))>&:not(:focus):hover]:bg-fg/5"

// A marker drawn over the value's left end, just past the down button. It
// lets the mouse through to the value.
const MARKER =
  "pointer-events-none absolute top-1/2 left-[2.1rem] flex -translate-y-1/2 items-center"

// A plain number is typed as one: "3", "+3" and "3.2" all read as 3.
const parseWhole = (text: string) => {
  const number = Number.parseFloat(text.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(number) ? Math.round(number) : null
}

export interface StepperProps {
  value: number
  min: number
  max: number
  step?: number
  label: string
  format?: (value: number) => string
  // how a typed value reads; a plain number, shown as it is, reads as a
  // whole number without one
  parse?: (text: string) => number | null
  // narrows what can be typed, character by character
  sanitize?: (text: string) => string
  // the value is shown in the error colour, as one that is wrong
  invalid?: boolean
  // shown over the value's left end
  marker?: ReactNode
  onChange: (value: number) => void
}

export const Stepper: FC<StepperProps> = ({
  value,
  min,
  max,
  step = 1,
  label,
  format,
  parse: given,
  sanitize,
  invalid = false,
  marker,
  onChange,
}) => {
  const parse = given ?? (format === undefined ? parseWhole : undefined)
  const tone = invalid ? "text-error" : "text-fg"
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  const [draft, setDraft] = useState<string | null>(null)
  // outside the app's stores, as in a lone test, a drag just isn't one edit
  const history = useStores()?.history
  // the value a drag last set, so a move that lands on it again stays quiet
  const dragged = useRef(value)

  // Drags the value up or down from `from`, a slow drag stepping by one and
  // a quick one sweeping the range. `move` takes how far the mouse is from
  // where it went down.
  const dragFrom = (from: number) => {
    const travel = dragTravel((max - min) / step)
    let held = false
    dragged.current = from
    return {
      move: (y: number) => {
        if (!held) {
          held = true
          history?.hold()
          // the mouse is hidden, and the page ignores it, until the drag ends
          document.documentElement.dataset.midiseqDragging = ""
        }
        const travelled = from + Math.round(travel.move(y)) * step
        const next = clamp(travelled)
        // Only a drag past a limit is pulled back to it. One that merely
        // starts at a limit moves off it, however small its first moves.
        if (next !== travelled) {
          travel.set((next - from) / step)
        }
        if (next !== dragged.current) {
          dragged.current = next
          onChange(next)
        }
      },
      end: () => {
        if (held) {
          history?.release()
          delete document.documentElement.dataset.midiseqDragging
        }
      },
    }
  }

  // Pressed while not being typed in, the value drags rather than focusing;
  // a press that never moves focuses it after all, if it can be typed in.
  // Once focused, the mouse selects text as usual, unless it heads up or
  // down: then what was typed is kept, and the value drags on from it.
  const onMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    const input = event.currentTarget
    if (event.button !== 0) {
      return
    }
    if (document.activeElement !== input) {
      event.preventDefault()
      const drag = dragFrom(value)
      observeDrag(event.nativeEvent, {
        onMove: (_, { y }) => drag.move(y),
        onUp: drag.end,
        onClick: () => input.focus(),
      })
      return
    }
    // undecided until the mouse first moves, then a drag or null for text
    let drag: ReturnType<typeof dragFrom> | null | undefined
    observeDrag(event.nativeEvent, {
      onMove: (_, { x, y }) => {
        if (drag === undefined) {
          drag = Math.abs(y) > Math.abs(x) ? takeOver(input) : null
        }
        drag?.move(y)
      },
      onUp: () => drag?.end(),
    })
  }

  // A focused value given over to a drag: the typing is committed as the
  // field lets go of focus, and the drag starts from what it came to.
  const takeOver = (input: HTMLElement) => {
    const typed = draft === null ? null : (parse?.(draft) ?? null)
    window.getSelection()?.removeAllRanges()
    input.blur()
    return dragFrom(typed === null ? value : clamp(typed))
  }

  const commit = () => {
    if (draft === null) {
      return
    }
    const parsed = parse?.(draft) ?? null
    setDraft(null)
    if (parsed !== null) {
      onChange(clamp(parsed))
    }
  }

  return (
    // The value comes first, the buttons placed either side of it: a label
    // around the stepper names its first control, which would otherwise be
    // the down button, pressed by a click on the label.
    <div className="relative flex h-[1.6rem] items-stretch">
      {parse === undefined ? (
        <span
          className={cn(VALUE, tone, "cursor-ns-resize select-none")}
          onMouseDown={onMouseDown}
        >
          {format === undefined ? value : format(value)}
        </span>
      ) : (
        // Looks exactly like the plain value until it is focused, when it
        // becomes an ordinary text field.
        <input
          aria-label={label}
          aria-invalid={invalid || undefined}
          className={cn(
            VALUE,
            "w-full cursor-ns-resize bg-transparent focus:cursor-text focus:border-background-secondary focus:bg-background focus:outline-none",
            tone,
          )}
          value={
            draft ?? (format === undefined ? String(value) : format(value))
          }
          onMouseDown={onMouseDown}
          onFocus={(event) => {
            setDraft(String(value))
            // A click places the caret after focus, so the select waits for
            // that to have happened. select() focuses on its own, so it only
            // runs while the field still has focus.
            const input = event.currentTarget
            requestAnimationFrame(() => {
              if (document.activeElement === input) {
                input.select()
              }
            })
          }}
          onChange={(event) =>
            setDraft(sanitize?.(event.target.value) ?? event.target.value)
          }
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit()
              event.currentTarget.blur()
            } else if (event.key === "Escape") {
              setDraft(null)
              event.currentTarget.blur()
            }
          }}
        />
      )}
      <button
        type="button"
        className={cn(STEP, "order-1 rounded-l-sm")}
        aria-label={`${label} down`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <MinusIcon size={14} />
      </button>
      <button
        type="button"
        className={cn(STEP, "order-3 rounded-r-sm")}
        aria-label={`${label} up`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <PlusIcon size={14} />
      </button>
      {marker !== undefined && <span className={MARKER}>{marker}</span>}
    </div>
  )
}
