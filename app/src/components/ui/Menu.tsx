import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { cn } from "./cn"

// a menu-bar title: flat rather than a pill, lit while it is open
const TITLE = "flex h-8 items-center gap-1 rounded-sm text-body"
const TITLE_OPEN = "bg-background-secondary text-fg"
const TITLE_SHUT = "text-fg-secondary hover:bg-highlight hover:text-fg"

/**
 * A menu-bar title and the list it opens. A click anywhere else, or Escape,
 * closes it. `children` gets a way to close the list, for items that act.
 */
export const MenuBarMenu: FC<{
  label: string
  children: (close: () => void) => ReactNode
}> = ({ label, children }) => {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    // the title is inside too, so its own click still toggles
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={menu} className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        className={cn(TITLE, "pr-2 pl-3", open ? TITLE_OPEN : TITLE_SHUT)}
        onClick={() => setOpen(!open)}
      >
        {label}
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn("absolute top-[calc(100%+0.25rem)] left-0 z-20", LIST)}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

const LIST =
  "flex min-w-[10rem] flex-col rounded-lg border border-popup-border bg-background-secondary py-1 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"

/** A menu-bar title that acts rather than opening a list. */
export const MenuBarButton: FC<{
  active?: boolean
  onClick: () => void
  children: ReactNode
}> = ({ active = false, onClick, children }) => (
  <button
    type="button"
    className={cn(TITLE, "px-3", active ? TITLE_OPEN : TITLE_SHUT)}
    onClick={onClick}
  >
    {children}
  </button>
)

/** One item: it closes the menu and then acts. A shortcut shows on the right. */
export const MenuItem: FC<{
  onSelect: () => void | Promise<void>
  close: () => void
  shortcut?: string
  disabled?: boolean
  children: ReactNode
}> = ({ onSelect, close, shortcut, disabled = false, children }) => (
  <button
    type="button"
    disabled={disabled}
    className="flex items-center gap-6 px-4 py-2 text-left text-body text-fg enabled:hover:bg-highlight disabled:text-fg-tertiary"
    onClick={() => {
      close()
      void onSelect()
    }}
  >
    <span className="grow">{children}</span>
    {shortcut !== undefined && (
      <span aria-hidden className="text-small text-fg-tertiary">
        {shortcut}
      </span>
    )}
  </button>
)

export interface Point {
  x: number
  y: number
}

/**
 * Where a context menu opens: at the pointer for a right-click, or, opened
 * from the keyboard, where there is no pointer, at the middle of what has
 * the focus.
 */
export const menuPoint = (event: ReactMouseEvent<HTMLElement>): Point => {
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { x: event.clientX, y: event.clientY }
  }
  const { left, top, width, height } =
    event.currentTarget.getBoundingClientRect()
  return { x: left + width / 2, y: top + height / 2 }
}

const MARGIN = 8

// the items that can be chosen, in order
const enabledItems = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? [])

/**
 * A list of items opened at a point, by a right-click. It is nudged back
 * inside the window once its size is known, and takes the focus, which the
 * arrow keys move between its items. A click anywhere else, Escape, or
 * scrolling closes it, and the focus goes back where it was.
 */
export const ContextMenu: FC<{
  label: string
  at: Point
  onClose: () => void
  children: (close: () => void) => ReactNode
}> = ({ label, at: requestedAt, onClose, children }) => {
  const menu = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(requestedAt)
  // the latest, so a parent's new function doesn't reopen the listeners
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const element = menu.current
    if (element === null) {
      return
    }
    const { width, height } = element.getBoundingClientRect()
    setAt({
      x: Math.min(
        Math.max(MARGIN, requestedAt.x),
        window.innerWidth - width - MARGIN,
      ),
      y: Math.min(
        Math.max(MARGIN, requestedAt.y),
        window.innerHeight - height - MARGIN,
      ),
    })
  }, [requestedAt])

  useEffect(() => {
    const before = document.activeElement
    enabledItems(menu.current)[0]?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) {
        close.current()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current()
      }
    }
    const onScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) {
        close.current()
      }
    }
    const onBlur = () => close.current()
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    // capturing, to hear a scroll anywhere on the page
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onBlur)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onBlur)
      window.removeEventListener("blur", onBlur)
      if (before instanceof HTMLElement) {
        before.focus({ preventScroll: true })
      }
    }
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const all = enabledItems(menu.current)
    const current = all.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === "ArrowDown"
        ? (current + 1) % all.length
        : event.key === "ArrowUp"
          ? (current - 1 + all.length) % all.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? all.length - 1
              : null
    if (next !== null) {
      event.preventDefault()
      all[next]?.focus()
    }
  }

  // Fixed to the window, but kept within the app, whose styles it needs:
  // render it outside anything transformed, which would move it.
  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      className={cn("fixed z-30", LIST)}
      style={{ left: at.x, top: at.y }}
      onKeyDown={onKeyDown}
      // a right-click on the menu is not another page's menu
      onContextMenu={(event) => event.preventDefault()}
    >
      {children(() => close.current())}
    </div>
  )
}

/** Items that go together, under a heading of their own. */
export const MenuGroup: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls, not menu items
  <div role="group" aria-label={label} className="flex flex-col">
    <div
      aria-hidden
      className="px-4 pt-1 pb-0.5 text-small text-fg-tertiary select-none"
    >
      {label}
    </div>
    {children}
  </div>
)

/** A line between groups of items. */
export const MenuDivider: FC = () => (
  <hr className="mx-0 my-1 h-0 border-0 border-t border-solid border-divider" />
)
