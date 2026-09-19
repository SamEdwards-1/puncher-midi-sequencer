import styled from "@emotion/styled"
import { FC } from "react"
import { Localized } from "../../localize/useLocalization"
import { Panel, PanelBody, PanelHeader } from "../ui/Panel"

const RightPanel = styled(Panel)`
  border-left: 1px solid var(--color-divider);
`

export const VoicePanel: FC = () => (
  <RightPanel>
    <PanelHeader>
      <Localized name="sequencer-voices" />
    </PanelHeader>
    <PanelBody />
  </RightPanel>
)
