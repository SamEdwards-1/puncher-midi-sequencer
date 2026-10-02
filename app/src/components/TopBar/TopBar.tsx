import { FC, lazy, Suspense } from "react"
import logo from "../../assets/puncher-logo.svg?raw"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized } from "../../localize/useLocalization"
import { EditMenu } from "../EditMenu/EditMenu"
import { FileMenu } from "../FileMenu/FileMenu"
import { Columns, THREE_COLUMN_TRACKS } from "../SequencerEditor/layout"
import { TransportControls } from "../TransportPanel/TransportControls"
import { cn } from "../ui/cn"
import { MenuBarButton } from "../ui/Menu"

// loaded the first time it opens rather than with the page
const SettingsDialog = lazy(() =>
  import("../Settings/SettingsDialog").then(({ SettingsDialog }) => ({
    default: SettingsDialog,
  })),
)

export const TopBar: FC<{ columns: Columns }> = ({ columns }) => {
  const { settingsTab } = useStores()
  const settingsOpen = useMobxGetter(settingsTab, "open")

  const menus = (
    <div className="flex items-center gap-2">
      {/* inline rather than an <img>, so the logo's currentColor is ours */}
      <div
        className="flex h-7 pr-2 text-logo [&>svg]:h-full [&>svg]:w-auto"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: our own asset
        dangerouslySetInnerHTML={{ __html: logo }}
      />
      <FileMenu />
      <EditMenu />
      <MenuBarButton active={settingsOpen} onClick={() => settingsTab.show()}>
        <Localized name="sequencer-settings" />
      </MenuBarButton>
    </div>
  )

  return (
    <header
      className={cn(
        "box-border h-12 flex-shrink-0 items-center border-b border-divider bg-background-dark",
        columns === "three"
          ? // the editor's own columns, so the transport ends where the
            // grid's content does, 1rem in from its column's edge. No gap or
            // padding, which would move the columns off the editor's.
            cn("grid", THREE_COLUMN_TRACKS)
          : // the transport ends at the right of the window
            "flex justify-between gap-2 px-4",
      )}
    >
      {columns === "three" ? (
        <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 px-4">
          {menus}
          <TransportControls />
        </div>
      ) : (
        <>
          {menus}
          <TransportControls />
        </>
      )}
      <Suspense fallback={null}>
        {settingsOpen && <SettingsDialog onClose={settingsTab.close} />}
      </Suspense>
    </header>
  )
}
