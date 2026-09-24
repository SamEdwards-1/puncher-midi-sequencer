import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import { FC, ReactNode, useState } from "react"
import { cn } from "./cn"

/**
 * A menu-bar title — flat rather than a pill — and the list it opens.
 * `children` gets a way to close the list, for items that act.
 */
export const MenuBarMenu: FC<{
  label: string
  children: (close: () => void) => ReactNode
}> = ({ label, children }) => {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1 rounded-sm pr-2 pl-3 text-body",
          open
            ? "bg-background-secondary text-fg"
            : "text-fg-secondary hover:bg-highlight hover:text-fg",
        )}
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
