import { FC, useEffect } from "react"
import { useSelectedVoiceSync } from "../../hooks/useActions"
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts"
import { useScrollingMark } from "../../hooks/useScrollingMark"
import { useStores } from "../../hooks/useStores"
import { useWebMCP } from "../../hooks/useWebMCP"
import { SequencerEditor } from "../SequencerEditor/SequencerEditor"
import { SequencerProvider } from "../SequencerEditor/SequencerProvider"

// Standalone shell. Inside Signal, the provider + editor pair becomes a route.
export const RootView: FC = () => {
  const { sequencerStore } = useStores()
  useKeyboardShortcuts()
  useScrollingMark()
  useSelectedVoiceSync()
  useWebMCP()

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

  // The stylesheet scopes its own resets to midiseq, so they stop at the
  // sequencer and leave a host page's elements alone.
  return (
    <div className="midiseq flex h-full flex-col overflow-hidden">
      <SequencerProvider>
        <SequencerEditor />
      </SequencerProvider>
    </div>
  )
}
