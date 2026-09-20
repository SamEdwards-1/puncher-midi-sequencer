import styled from "@emotion/styled"
import { FC, useEffect } from "react"
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts"
import { useStores } from "../../hooks/useStores"
import { SequencerEditor } from "../SequencerEditor/SequencerEditor"
import { SequencerProvider } from "../SequencerEditor/SequencerProvider"

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

// Standalone shell. Inside Signal, the provider + editor pair becomes a route.
export const RootView: FC = () => {
  const { sequencerStore } = useStores()
  useKeyboardShortcuts()

  // warns before closing with work that hasn't been saved to a file
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!sequencerStore.isSaved) {
        event.preventDefault()
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [sequencerStore])

  return (
    <Container>
      <SequencerProvider>
        <SequencerEditor />
      </SequencerProvider>
    </Container>
  )
}
