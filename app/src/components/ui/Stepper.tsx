import styled from "@emotion/styled"
import { FC, useState } from "react"

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`

const Step = styled.button`
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  border-radius: 0.25rem;
  background: var(--color-background-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-highlight);
  }

  &:disabled {
    color: var(--color-text-tertiary);
    cursor: default;
  }
`

const Value = styled.span`
  flex-grow: 1;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text);
`

// Looks exactly like the plain value until it is focused, when it becomes an
// ordinary text field.
const ValueInput = styled.input`
  flex-grow: 1;
  width: 100%;
  min-width: 0;
  padding: 0.1rem 0;
  border: none;
  border-radius: 0.2rem;
  background: transparent;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text);

  &:focus {
    outline: 1px solid var(--color-theme);
    background: var(--color-background);
  }
`

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
    <Row>
      <Step
        type="button"
        aria-label={`${label} down`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </Step>
      {parse === undefined ? (
        <Value>{format === undefined ? value : format(value)}</Value>
      ) : (
        <ValueInput
          aria-label={label}
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
      <Step
        type="button"
        aria-label={`${label} up`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </Step>
    </Row>
  )
}
