import styled from "@emotion/styled"

export const Panel = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-background);
`

export const PanelHeader = styled.h2`
  margin: 0;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-divider);
`

export const PanelBody = styled.div`
  flex-grow: 1;
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
`
