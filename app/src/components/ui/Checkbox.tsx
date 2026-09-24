import CheckIcon from "mdi-react/CheckIcon"
import { FC } from "react"

// A ticked box with its label beside it, the whole row clickable.
export const Checkbox: FC<{
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center gap-3 py-[0.3rem] text-body text-fg">
    <span className="relative inline-flex h-4 w-4 flex-none items-center justify-center rounded-xs border border-divider bg-background">
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0"
      />
      {checked && <CheckIcon size={12} />}
    </span>
    {label}
  </label>
)
