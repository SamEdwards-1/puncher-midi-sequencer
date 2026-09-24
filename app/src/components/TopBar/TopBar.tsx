import CogIcon from "mdi-react/CogIcon"
import { FC, useState } from "react"
import logo from "../../assets/puncher-logo.svg?raw"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { EditMenu } from "../EditMenu/EditMenu"
import { FileMenu } from "../FileMenu/FileMenu"
import { OutputStatus } from "../MIDIOutputs/OutputStatus"
import { SettingsDialog } from "../Settings/SettingsDialog"
import { TransportControls } from "../TransportPanel/TransportControls"
import { IconButton, ToolbarButton } from "../ui/Button"

// the bar's buttons are a size up from a stepper's
const TOOLBAR_ICON = "h-8 w-8"

export interface TopBarProps {
  // the editor is down to one column, so the bar has little room to spare
  compact?: boolean
}

export const TopBar: FC<TopBarProps> = ({ compact = false }) => {
  const localized = useLocalization()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    // three columns, the outer two equal, so the transport sits in the middle
    // of the bar whatever is either side of it. When the bar runs short the
    // left side keeps its buttons and the right gives way only as far as the
    // output status can truncate, so nothing overlaps.
    <header className="box-border grid h-12 flex-shrink-0 grid-cols-[minmax(max-content,1fr)_auto_minmax(auto,1fr)] items-center gap-2 border-b border-divider bg-background-dark px-4">
      <div className="flex items-center gap-2">
        {/* inline rather than an <img>, so the logo's currentColor is ours */}
        <div
          className="flex h-7 pr-2 text-logo [&>svg]:h-full [&>svg]:w-auto"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: our own asset
          dangerouslySetInnerHTML={{ __html: logo }}
        />
        <FileMenu />
        <EditMenu />
      </div>
      <TransportControls />
      <div className="flex items-center justify-end gap-2">
        <OutputStatus />
        {compact ? (
          <IconButton
            className={TOOLBAR_ICON}
            title={localized["sequencer-settings"]}
            aria-label={localized["sequencer-settings"]}
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <CogIcon size={18} />
          </IconButton>
        ) : (
          <ToolbarButton
            type="button"
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <CogIcon size={16} />
            <Localized name="sequencer-settings" />
          </ToolbarButton>
        )}
      </div>
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}
    </header>
  )
}
