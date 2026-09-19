import styled from "@emotion/styled"
import { FC } from "react"
import { SequencerEditor } from "../SequencerEditor/SequencerEditor"
import { SequencerProvider } from "../SequencerEditor/SequencerProvider"

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

// Standalone shell. Inside Signal, the provider + editor pair becomes a route.
export const RootView: FC = () => (
  <Container>
    <SequencerProvider>
      <SequencerEditor />
    </SequencerProvider>
  </Container>
)
