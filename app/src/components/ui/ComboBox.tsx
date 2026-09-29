import CheckIcon from "mdi-react/CheckIcon"
import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useStores } from "../../hooks/useStores"
import { observeDrag } from "../StepEditor/observeDrag"
import { cn } from "./cn"
import { dragTravel } from "./dragSpeed"

export interface ComboOption<T> {
  value: T
  label: string
  // options under the same heading sit together, one after another
  group?: string
}

// The list is never taller than this, and is kept this far from the window's
// edges; it opens upwards where it has more room there.
const LIST_HEIGHT = 288
const MARGIN = 8

/**
 * The options whose labels hold what is typed, in their own order, or all of
 * them when nothing is.
 */
export const filterOptions = <T,>(
  options: readonly ComboOption<T>[],
  query: string | null,
): readonly ComboOption<T>[] => {
  const text = query?.trim().toLowerCase() ?? ""
  return text === ""
    ? options
    : options.filter((option) => option.label.toLowerCase().includes(text))
}

// the option to light first among those a typed text leaves: the first that
// starts with it, or else the first
const firstMatch = <T,>(options: readonly ComboOption<T>[], query: string) => {
  const text = query.trim().toLowerCase()
  return Math.max(
    0,
    options.findIndex((option) => option.label.toLowerCase().startsWith(text)),
  )
}

export interface ComboBoxProps<T> {
  value: T
  options: readonly ComboOption<T>[]
  onChange: (value: T) => void
  // its name, where no label around it gives it one
  "aria-label"?: string
  disabled?: boolean
  className?: string
}

/**
 * A select split in two: the value, which drags up and down the options as
 * a Stepper's number does and, clicked, takes typing that narrows the list
 * to the options it matches; and the arrow beside it, which opens the whole
 * list. Enter, or a click, picks the lit option; Escape leaves the value as
 * it was.
 */
export const ComboBox = <T,>({
  value,
  options,
  onChange,
  "aria-label": label,
  disabled = false,
  className,
}: ComboBoxProps<T>): ReactNode => {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  // what has been typed, or null while the value shows as itself
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<CSSProperties>({})
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  // typing waits on Enter, a click or leaving the field to be settled; once
  // it is, leaving the field doesn't settle it again
  const typing = useRef(false)
  const id = useId()
  // outside the app's stores, as in a lone test, a drag just isn't one edit
  const history = useStores()?.history

  const selected = options.findIndex((option) => Object.is(option.value, value))
  const shown = filterOptions(options, query)
  const showing = open || dragging
  const optionId = (index: number) => `${id}-option-${index}`

  const openList = () => {
    setQuery(null)
    setActive(Math.max(0, selected))
    setOpen(true)
  }

  const close = () => {
    typing.current = false
    setQuery(null)
    setOpen(false)
  }

  const pick = (option: ComboOption<T> | undefined) => {
    if (option !== undefined && !Object.is(option.value, value)) {
      onChange(option.value)
    }
    close()
  }

  // The list hangs under the box, or over it where there is more room, and
  // follows it as the page scrolls — but not as the list itself does.
  useLayoutEffect(() => {
    if (!showing) {
      return
    }
    const update = () => {
      const edges = box.current?.getBoundingClientRect()
      if (edges === undefined) {
        return
      }
      const below = window.innerHeight - edges.bottom - MARGIN
      const above = edges.top - MARGIN
      const up = below < LIST_HEIGHT && above > below
      setPlace({
        left: edges.left,
        minWidth: edges.width,
        maxHeight: Math.min(LIST_HEIGHT, up ? above : below),
        ...(up
          ? { bottom: window.innerHeight - edges.top + 2 }
          : { top: edges.bottom + 2 }),
      })
    }
    update()
    const onScroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) {
        update()
      }
    }
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", update)
    }
  }, [showing])

  // the lit option stays in sight as it moves
  useEffect(() => {
    if (showing) {
      document.getElementById(optionId(active))?.scrollIntoView?.({
        block: "nearest",
      })
    }
  })

  // Pressed while not being typed in, the value drags through the options,
  // down the list as the mouse goes down, and the list shows where it is; a
  // press that never moves focuses it, and opens the list. Once focused, the
  // mouse selects text as usual.
  const onMouseDown = (event: ReactMouseEvent<HTMLInputElement>) => {
    const field = event.currentTarget
    if (event.button !== 0 || document.activeElement === field) {
      return
    }
    event.preventDefault()
    const from = Math.max(0, selected)
    const last = options.length - 1
    // a slow drag steps by one, a quick one sweeps the list
    const travel = dragTravel(last)
    let held = false
    let at = from
    observeDrag(event.nativeEvent, {
      onMove: (_, { y }) => {
        if (!held) {
          held = true
          history?.hold()
          // the mouse is hidden, and the page ignores it, until the drag ends
          document.documentElement.dataset.midiseqDragging = ""
          setQuery(null)
          setDragging(true)
        }
        // down the screen is down the list
        const travelled = from + Math.round(travel.move(-y))
        const next = Math.min(last, Math.max(0, travelled))
        // only a drag past either end is pulled back to it
        if (next !== travelled) {
          travel.set(next - from)
        }
        setActive(next)
        if (next !== at) {
          at = next
          onChange(options[next].value)
        }
      },
      onUp: () => {
        if (held) {
          history?.release()
          delete document.documentElement.dataset.midiseqDragging
          setDragging(false)
        }
      },
      onClick: () => {
        field.focus()
        openList()
      },
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault()
        if (!open) {
          openList()
        } else if (shown.length > 0) {
          const by = event.key === "ArrowDown" ? 1 : -1
          setActive(Math.min(shown.length - 1, Math.max(0, active + by)))
        }
        break
      case "Enter":
        event.preventDefault()
        if (open) {
          pick(shown[active])
        }
        field.blur()
        break
      case "Escape":
        // closes the list, and only the list, before it leaves the field
        if (open) {
          event.preventDefault()
          event.stopPropagation()
          close()
        } else {
          field.blur()
        }
        break
    }
  }

  // the index in `options` of each shown one, and the heading it starts, if
  // it is the first of its group
  let group: string | undefined

  return (
    <div
      ref={box}
      data-combobox
      data-disabled={disabled}
      className={cn(
        "flex min-w-0 rounded-sm border border-divider bg-background text-body focus-within:border-theme data-[disabled=true]:opacity-40",
        className,
      )}
    >
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={showing}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          showing && shown.length > 0 ? optionId(active) : undefined
        }
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className="h-[1.9rem] w-full min-w-0 grow cursor-ns-resize truncate bg-transparent pl-[0.4rem] font-normal text-fg outline-none focus:cursor-text disabled:cursor-default"
        value={query ?? options[selected]?.label ?? ""}
        onMouseDown={disabled ? undefined : onMouseDown}
        onFocus={(event) => {
          // A click places the caret after focus, so the select waits for
          // that to have happened, and only runs while the field still has
          // focus.
          const field = event.currentTarget
          requestAnimationFrame(() => {
            if (document.activeElement === field) {
              field.select()
            }
          })
        }}
        onChange={(event) => {
          const text = event.target.value
          typing.current = true
          setQuery(text)
          setActive(firstMatch(filterOptions(options, text), text))
          setOpen(true)
        }}
        // Leaving it after typing takes the lit option, as Enter would;
        // leaving it otherwise leaves the value as it is.
        onBlur={() => (typing.current ? pick(shown[active]) : close())}
        onKeyDown={onKeyDown}
      />
      {/* Not a button, which the field's label would name after itself; it
          keeps the focus in the field, which the keyboard opens the list
          from. */}
      <span
        aria-hidden
        data-combobox-arrow
        className={cn(
          "flex w-[1.4rem] flex-none items-center justify-center text-fg-secondary",
          !disabled && "cursor-pointer hover:text-fg",
        )}
        onClick={(event) => event.preventDefault()}
        onMouseDown={(event) => {
          event.preventDefault()
          if (disabled || event.button !== 0) {
            return
          }
          if (open) {
            close()
          } else {
            input.current?.focus()
            openList()
          }
        }}
      >
        <ChevronDownIcon size={16} />
      </span>
      {showing && (
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          style={place}
          className="fixed z-[60] flex flex-col overflow-y-auto rounded-sm border border-popup-border bg-background-secondary py-1 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
          // a press on the list keeps the focus in the field
          onMouseDown={(event) => event.preventDefault()}
          // and the label around the field doesn't hand it the click
          onClick={(event) => event.preventDefault()}
        >
          {shown.length === 0 && (
            <span className="px-3 py-[0.3rem] text-body text-fg-tertiary">
              —
            </span>
          )}
          {shown.map((option, index) => {
            const heading = option.group !== group ? option.group : undefined
            group = option.group
            const current = Object.is(option.value, value)
            return (
              <div key={optionId(index)} className="contents">
                {heading !== undefined && (
                  <span className="px-3 pt-[0.4rem] pb-[0.2rem] text-small text-fg-tertiary">
                    {heading}
                  </span>
                )}
                {/* biome-ignore lint/a11y/useFocusableInteractive: the field keeps the focus, and names the lit option as its active descendant */}
                <div
                  id={optionId(index)}
                  role="option"
                  aria-selected={current}
                  className={cn(
                    "flex cursor-pointer items-center gap-[0.3rem] whitespace-nowrap py-[0.3rem] pr-3 pl-[0.4rem] text-body",
                    index === active ? "bg-theme text-on-surface" : "text-fg",
                  )}
                  onMouseMove={() => index !== active && setActive(index)}
                  onClick={() => {
                    pick(option)
                    input.current?.blur()
                  }}
                >
                  <CheckIcon
                    size={14}
                    className={cn("flex-none", !current && "invisible")}
                  />
                  {option.label}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
