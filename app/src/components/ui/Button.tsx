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

// Flat, full-height app-bar button in the same style as Signal's tabs: no
// fill until hovered, and an accent line on top when active.
export const ToolbarButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  align-self: stretch;
  padding: 0 1rem;
  border: none;
  border-top: 0.1rem solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 0.75rem;
  cursor: pointer;

  &:hover {
    background: var(--color-highlight);
  }

  &[data-active="true"] {
    color: var(--color-text);
    background: var(--color-background);
    border-top-color: var(--color-theme);
  }
`
