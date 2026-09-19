import styled from "@emotion/styled"
import { FC } from "react"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"

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

export const TopBar: FC = () => {
  const { sequencerStore } = useStores()
  const name = useMobxGetter(sequencerStore, "name")

  return (
    <Bar>
      <AppName>
        <Localized name="sequencer-app-name" />
      </AppName>
      <PatchName>
        {name.length > 0 ? name : <Localized name="sequencer-untitled" />}
      </PatchName>
    </Bar>
  )
}
