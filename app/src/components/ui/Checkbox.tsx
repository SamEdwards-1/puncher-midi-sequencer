import CheckIcon from "mdi-react/CheckIcon"
import MinusIcon from "mdi-react/MinusIcon"
import { FC, ReactNode, useLayoutEffect, useRef } from "react"
import { cn } from "./cn"

/**
 * A ticked box with its label beside it, the whole row clickable. A note
 * after the label says why one is off, or what it holds. Mixed is the third
 * state of a box standing for several — some of them ticked — and shows a
 * dash; the input only takes it from script, so it is set there.
 */
export const Checkbox: FC<{
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  mixed?: boolean
  note?: ReactNode
}> = ({ label, checked, onChange, disabled = false, mixed = false, note }) => {
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (input.current !== null) {
      input.current.indeterminate = mixed
    }
  }, [mixed])

  return (
    <label
      className={cn(
        "flex items-center gap-3 py-[0.3rem] text-body text-fg",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
      )}
    >
      <span className="relative inline-flex h-4 w-4 flex-none items-center justify-center rounded-xs border border-divider bg-background">
        <input
          ref={input}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
          className={cn(
            "absolute inset-0 z-[1] m-0 h-full w-full opacity-0",
            disabled ? "cursor-default" : "cursor-pointer",
          )}
        />
        {mixed ? <MinusIcon size={12} /> : checked && <CheckIcon size={12} />}
      </span>
      {label}
      {note !== undefined && (
        <span className="min-w-0 truncate text-small text-fg-tertiary">
          {note}
        </span>
      )}
    </label>
  )
}
