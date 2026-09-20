import styled from "@emotion/styled"
import { FC, ReactNode } from "react"

const rowStyle = `
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
`

const Row = styled.label`
  ${rowStyle}
`

// The same row for controls that are buttons: a label would lend them its
// own text as their name.
const PlainRow = styled.div`
  ${rowStyle}
`

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1rem 0.75rem;
`

export const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <Row>
    <span>{label}</span>
    {children}
  </Row>
)

export const ButtonField: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <PlainRow>
    <span>{label}</span>
    {children}
  </PlainRow>
)
