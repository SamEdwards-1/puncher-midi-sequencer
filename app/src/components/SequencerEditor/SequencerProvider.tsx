import { FC, PropsWithChildren } from "react"

// Boundary for sequencer-scoped state (history, scoped atoms) so the editor
// can later mount as a Signal tab without touching Signal's own providers.
export const SequencerProvider: FC<PropsWithChildren> = ({ children }) => (
  <>{children}</>
)
