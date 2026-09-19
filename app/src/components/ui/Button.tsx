import styled from "@emotion/styled"

export const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  height: 2rem;
  padding: 0 0.75rem;
  border: none;
  border-radius: 0.25rem;
  background: var(--color-background-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    background: var(--color-highlight);
  }

  &[data-active="true"] {
    background: var(--color-theme);
    color: var(--color-on-surface);
  }
`
