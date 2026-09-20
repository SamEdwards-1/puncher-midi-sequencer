import styled from "@emotion/styled"
import { FC } from "react"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { FileMenu } from "../FileMenu/FileMenu"
import { OutputRoutingMenu } from "../MIDIOutputs/OutputRoutingMenu"
import { TransportControls } from "../TransportPanel/TransportControls"

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 3rem;
  flex-shrink: 0;
  padding-right: 1rem;
  box-sizing: border-box;
  background: var(--color-background-dark);
  border-bottom: 1px solid var(--color-divider);
`

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 1rem;
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
  const localized = useLocalization()
  const name = useMobxSelector(
    () => sequencerStore.patch.name,
    [sequencerStore],
  )
  const fileName = useMobxGetter(sequencerStore, "fileName")
  const isSaved = useMobxGetter(sequencerStore, "isSaved")

  return (
    <Bar>
      <Title>
        <AppName>
          <Localized name="sequencer-app-name" />
        </AppName>
        <PatchName>
          {fileName ??
            (name.length > 0 ? name : localized["sequencer-untitled"])}
          {/* a dot while there are unsaved changes */}
          {isSaved ? "" : " •"}
        </PatchName>
      </Title>
      <FileMenu />
      <Spacer />
      <TransportControls />
      <OutputRoutingMenu />
    </Bar>
  )
}
