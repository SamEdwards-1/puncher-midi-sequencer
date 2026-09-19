import styled from "@emotion/styled"
import { FC } from "react"
import { useMobxSelector } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"
import { OutputRoutingMenu } from "../MIDIOutputs/OutputRoutingMenu"
import { TransportControls } from "../TransportPanel/TransportControls"

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 3rem;
  padding: 0 1rem;
  box-sizing: border-box;
  background: var(--color-background-dark);
  border-bottom: 1px solid var(--color-divider);
`

const AppName = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
`

const PatchName = styled.div`
  font-size: 0.8rem;
  color: var(--color-text-secondary);
`

const Spacer = styled.div`
  flex-grow: 1;
`

export const TopBar: FC = () => {
  const { sequencerStore } = useStores()
  const name = useMobxSelector(
    () => sequencerStore.patch.name,
    [sequencerStore],
  )

  return (
    <Bar>
      <AppName>
        <Localized name="sequencer-app-name" />
      </AppName>
      <PatchName>
        {name.length > 0 ? name : <Localized name="sequencer-untitled" />}
      </PatchName>
      <Spacer />
      <TransportControls />
      <OutputRoutingMenu />
    </Bar>
  )
}
