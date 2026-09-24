import CogIcon from "mdi-react/CogIcon"
import { FC, useState } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useHistory } from "../../hooks/useHistory"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { FileMenu } from "../FileMenu/FileMenu"
import { OutputStatus } from "../MIDIOutputs/OutputStatus"
import { SettingsDialog } from "../Settings/SettingsDialog"
import { TransportControls } from "../TransportPanel/TransportControls"
import { ToolbarButton } from "../ui/Button"

export const TopBar: FC = () => {
  const { sequencerStore } = useStores()
  const localized = useLocalization()
  const { clearAll } = usePatchEditor()
  const { canUndo, canRedo, undo, redo } = useHistory()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const name = useMobxSelector(
    () => sequencerStore.patch.name,
    [sequencerStore],
  )
  const fileName = useMobxGetter(sequencerStore, "fileName")
  const isSaved = useMobxGetter(sequencerStore, "isSaved")

  return (
    <header className="box-border flex h-12 flex-shrink-0 items-center gap-2 border-b border-divider bg-background-dark pr-4">
      <div className="flex items-center gap-2 pl-4">
        <div className="text-title font-semibold">
          <Localized name="sequencer-app-name" />
        </div>
        <div className="text-body text-fg-secondary">
          {fileName ??
            (name.length > 0 ? name : localized["sequencer-untitled"])}
          {/* a dot while there are unsaved changes */}
          {isSaved ? "" : " •"}
        </div>
      </div>
      <FileMenu />
      {/* undoable in one go, so it asks nothing before emptying the patch */}
      <ToolbarButton type="button" onClick={clearAll}>
        <Localized name="sequencer-clear-all" />
      </ToolbarButton>
      <ToolbarButton type="button" disabled={!canUndo} onClick={undo}>
        <Localized name="sequencer-undo" />
      </ToolbarButton>
      <ToolbarButton type="button" disabled={!canRedo} onClick={redo}>
        <Localized name="sequencer-redo" />
      </ToolbarButton>
      <div className="grow" />
      <TransportControls />
      <OutputStatus />
      <ToolbarButton
        type="button"
        active={settingsOpen}
        onClick={() => setSettingsOpen(true)}
      >
        <CogIcon size={16} />
        <Localized name="sequencer-settings" />
      </ToolbarButton>
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}
    </header>
  )
}
