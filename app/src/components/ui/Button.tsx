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

// App-bar pill. It keeps its own height so it never reaches the top or
// bottom edge of the bar.
export const ToolbarButton = styled.button`
  display: flex;
  align-items: center;
  align-self: center;
  gap: 0.4rem;
  height: 2rem;
  padding: 0 1rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;

  &:disabled {
    color: var(--color-text-tertiary);
    background: transparent;
    cursor: default;
  }

  &:hover {
    background: var(--color-highlight);
  }

  &[data-active="true"] {
    background: var(--color-theme);
    color: var(--color-on-surface);
  }
`
