import styled from "@emotion/styled"
import { FC } from "react"

const Track = styled.span`
  position: relative;
  display: inline-block;
  width: 2.2rem;
  height: 1.2rem;
  border-radius: 999px;
  background: var(--color-background-secondary);
  transition: background 0.1s ease;

  &::after {
    content: "";
    position: absolute;
    top: 0.15rem;
    left: 0.15rem;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 50%;
    background: var(--color-text-secondary);
    transition:
      transform 0.1s ease,
      background 0.1s ease;
  }
`

const Input = styled.input`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;

  &:checked + span {
    background: var(--color-theme);
  }

  &:checked + span::after {
    background: var(--color-on-surface);
    transform: translateX(1rem);
  }

  &:focus-visible + span {
    outline: 2px solid var(--color-theme);
    outline-offset: 2px;
  }
`

const Wrapper = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
`

export const Toggle: FC<{
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}> = ({ checked, label, onChange }) => (
  <Wrapper>
    <Input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <Track />
  </Wrapper>
)
