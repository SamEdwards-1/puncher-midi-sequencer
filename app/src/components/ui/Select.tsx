import styled from "@emotion/styled"

export const Select = styled.select`
  height: 1.9rem;
  padding: 0 0.4rem;
  border: 1px solid var(--color-divider);
  border-radius: 0.25rem;
  background: var(--color-background);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;

  &:focus {
    outline: none;
    border-color: var(--color-theme);
  }
`
