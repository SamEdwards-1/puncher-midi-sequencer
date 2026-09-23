import { FC } from "react"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { FileMenu } from "../FileMenu/FileMenu"
import { OutputRoutingMenu } from "../MIDIOutputs/OutputRoutingMenu"
import { OutputStatus } from "../MIDIOutputs/OutputStatus"
import { TransportControls } from "../TransportPanel/TransportControls"

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
      <div className="grow" />
      <TransportControls />
      <OutputStatus />
      <OutputRoutingMenu />
    </header>
  )
}
