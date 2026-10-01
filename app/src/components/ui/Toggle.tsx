import { FC } from "react"
import { cn } from "./cn"

export const Toggle: FC<{
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  disabled?: boolean
}> = ({ checked, label, onChange, disabled = false }) => (
  <span
    className={cn(
      "relative inline-flex flex-none items-center",
      disabled ? "opacity-45" : "cursor-pointer",
    )}
  >
    {/* Covers the whole switch rather than hiding in a corner, so a click on
        the track reaches it without needing a label around the pair. */}
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className={cn(
        "peer absolute inset-0 z-[1] m-0 h-full w-full opacity-0",
        !disabled && "cursor-pointer",
      )}
    />
    <span className="relative inline-block h-[1.2rem] w-[2.2rem] rounded-full bg-background-secondary transition after:absolute after:top-[0.15rem] after:left-[0.15rem] after:h-[0.9rem] after:w-[0.9rem] after:rounded-full after:bg-fg-secondary after:transition after:content-[''] peer-checked:bg-theme peer-checked:after:translate-x-4 peer-checked:after:bg-on-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-theme" />
  </span>
)
