import { FC, useState } from "react"

const STEP =
  "h-[1.6rem] w-[1.6rem] rounded-sm bg-background-secondary text-title leading-none text-fg enabled:hover:bg-highlight disabled:text-fg-tertiary"

const VALUE = "grow text-center font-mono text-body text-fg"

export interface StepperProps {
  value: number
  min: number
  max: number
  step?: number
  label: string
  format?: (value: number) => string
  // supply this to let the value be typed in as well as stepped
  parse?: (text: string) => number | null
  onChange: (value: number) => void
}

export const Stepper: FC<StepperProps> = ({
  value,
  min,
  max,
  step = 1,
  label,
  format,
  parse,
  onChange,
}) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  const [draft, setDraft] = useState<string | null>(null)

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
        −
      </button>
      {parse === undefined ? (
        <span className={VALUE}>
          {format === undefined ? value : format(value)}
        </span>
      ) : (
        // Looks exactly like the plain value until it is focused, when it
        // becomes an ordinary text field.
        <input
          aria-label={label}
          className="w-full min-w-0 grow rounded-[0.2rem] bg-transparent py-[0.1rem] text-center font-mono text-body text-fg focus:bg-background focus:outline-1 focus:outline-theme"
          value={
            draft ?? (format === undefined ? String(value) : format(value))
          }
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
          onChange={(event) => setDraft(event.target.value)}
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
        +
      </button>
    </div>
  )
}
