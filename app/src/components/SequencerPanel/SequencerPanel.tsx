import styled from "@emotion/styled"
import { FC } from "react"
import { Localized } from "../../localize/useLocalization"
import { Panel, PanelBody, PanelHeader } from "../ui/Panel"

const LeftPanel = styled(Panel)`
  border-right: 1px solid var(--color-divider);
`

export const SequencerPanel: FC = () => (
  <LeftPanel>
    <PanelHeader>
      <Localized name="sequencer-panel" />
    </PanelHeader>
    <PanelBody />
    <PanelHeader>
      <Localized name="sequencer-jumps" />
    </PanelHeader>
    <PanelBody />
  </LeftPanel>
)
