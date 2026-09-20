import styled from "@emotion/styled"
import { FC } from "react"

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

export interface StepperProps {
  value: number
  min: number
  max: number
  step?: number
  label: string
  format?: (value: number) => string
  onChange: (value: number) => void
}

export const Stepper: FC<StepperProps> = ({
  value,
  min,
  max,
  step = 1,
  label,
  format,
  onChange,
}) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
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
      <Value>{format === undefined ? value : format(value)}</Value>
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
