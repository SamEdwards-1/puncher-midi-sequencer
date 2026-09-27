import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import { FC, ReactNode, useEffect, useRef, useState } from "react"
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
          className="absolute top-[calc(100%+0.25rem)] left-0 z-20 flex min-w-[10rem] flex-col rounded-lg border border-popup-border bg-background-secondary py-1 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

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
