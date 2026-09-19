import styled from "@emotion/styled"
import { FC } from "react"
import { SequenceGrid } from "../SequenceGrid/SequenceGrid"
import { SequencerPanel } from "../SequencerPanel/SequencerPanel"
import { TopBar } from "../TopBar/TopBar"
import { VoicePanel } from "../VoicePanel/VoicePanel"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
  background: var(--color-background);
`

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(16rem, 20rem) 1fr minmax(18rem, 22rem);
  flex-grow: 1;
  min-height: 0;
`

export const SequencerEditor: FC = () => (
  <Container>
    <TopBar />
    <Body>
      <SequencerPanel />
      <SequenceGrid />
      <VoicePanel />
    </Body>
  </Container>
)
