import MinusIcon from "mdi-react/MinusIcon"
import PlusIcon from "mdi-react/PlusIcon"
import { FC, MouseEvent as ReactMouseEvent, useRef, useState } from "react"
import { useStores } from "../../hooks/useStores"
import { observeDrag } from "../StepEditor/observeDrag"
import { cn } from "./cn"
import { dragTravel } from "./dragSpeed"

const STEP =
  "flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded-sm bg-background-secondary text-fg enabled:hover:bg-highlight disabled:text-fg-tertiary"

const VALUE = "grow text-center font-mono text-body"

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

  // Pressed while not being typed in, the value drags rather than focusing;
  // a press that never moves focuses it after all, if it can be typed in.
  // Once focused, the mouse selects text as usual.
  const onMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    const input = event.currentTarget
    if (event.button !== 0 || document.activeElement === input) {
      return
    }
    event.preventDefault()
    const from = value
    // a slow drag steps by one, a quick one sweeps the range
    const travel = dragTravel((max - min) / step)
    let held = false
    dragged.current = from
    observeDrag(event.nativeEvent, {
      onMove: (_, { y }) => {
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
      onUp: () => {
        if (held) {
          history?.release()
          delete document.documentElement.dataset.midiseqDragging
        }
      },
      onClick: () => input.focus(),
    })
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
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={STEP}
        aria-label={`${label} down`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <MinusIcon size={14} />
      </button>
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
            "w-full min-w-0 grow cursor-ns-resize rounded-[0.2rem] bg-transparent py-[0.1rem] text-center font-mono text-body focus:cursor-text focus:bg-background focus:outline-1 focus:outline-theme",
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
        className={STEP}
        aria-label={`${label} up`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <PlusIcon size={14} />
      </button>
    </div>
  )
}
