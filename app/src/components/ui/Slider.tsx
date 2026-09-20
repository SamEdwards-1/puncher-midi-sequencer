import styled from "@emotion/styled"

export const Slider = styled.input`
  appearance: none;
  width: 100%;
  height: 1.2rem;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-runnable-track {
    height: 0.2rem;
    border-radius: 999px;
    background: var(--color-background-secondary);
  }

  &::-webkit-slider-thumb {
    appearance: none;
    margin-top: -0.35rem;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 50%;
    background: var(--color-text);
  }

  &::-moz-range-track {
    height: 0.2rem;
    border-radius: 999px;
    background: var(--color-background-secondary);
  }

  &::-moz-range-thumb {
    width: 0.9rem;
    height: 0.9rem;
    border: none;
    border-radius: 50%;
    background: var(--color-text);
  }

  &:focus-visible {
    outline: 2px solid var(--color-theme);
    outline-offset: 2px;
  }
`
