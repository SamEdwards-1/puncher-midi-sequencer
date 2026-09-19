import styled from "@emotion/styled"
import { FC } from "react"
import { Localized } from "../../localize/useLocalization"
import { Panel, PanelBody, PanelHeader } from "../ui/Panel"

const Actions = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-divider);
`

const ActionButton = styled.button`
  min-width: 5rem;
  height: 2rem;
  border: none;
  border-radius: 1rem;
  background: var(--color-background-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    background: var(--color-highlight);
  }
`

const actions = [
  "sequencer-action-hang",
  "sequencer-action-bump",
  "sequencer-action-flip",
  "sequencer-action-shift",
] as const

export const SequenceGrid: FC = () => (
  <Panel>
    <PanelHeader>
      <Localized name="sequencer-grid" />
    </PanelHeader>
    <PanelBody />
    <PanelHeader>
      <Localized name="sequencer-step-editor" />
    </PanelHeader>
    <PanelBody />
    <Actions>
      {actions.map((action) => (
        <ActionButton key={action} type="button">
          <Localized name={action} />
        </ActionButton>
      ))}
    </Actions>
  </Panel>
)
