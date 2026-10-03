import { PreparedMidi } from "@midiseq/core"
import { FC, lazy, Suspense, useState } from "react"
import { useFileActions, useMidiFileLoader } from "../../actions/file"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useSelectedStep } from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import {
  Localized,
  useFormat,
  useLocalization,
} from "../../localize/useLocalization"
import { RecentFile } from "../../services/RecentFilesStorage"
import { Loading } from "../ui/Loading"
import { MenuBarMenu, MenuDivider, MenuGroup, MenuItem } from "../ui/Menu"

// opened from the menu, so loaded the first time they are rather than with
// the page
const ExportMidiDialog = lazy(() =>
  import("./ExportMidiDialog").then(({ ExportMidiDialog }) => ({
    default: ExportMidiDialog,
  })),
)
const ImportMidiDialog = lazy(() =>
  import("./ImportMidiDialog").then(({ ImportMidiDialog }) => ({
    default: ImportMidiDialog,
  })),
)
const RenderAudioDialog = lazy(() =>
  import("./RenderAudioDialog").then(({ RenderAudioDialog }) => ({
    default: RenderAudioDialog,
  })),
)

export const FileMenu: FC = () => {
  const { newPatch, open, openRecent, save, saveAs } = useFileActions()
  const { recentFiles } = useStores()
  const recentPatches = useMobxGetter(recentFiles, "patch")
  const recentMidi = useMobxGetter(recentFiles, "midi")
  const localized = useLocalization()
  const format = useFormat()
  // the whole sequence, or the step in the editor when it was asked for
  const [exporting, setExporting] = useState<
    { kind: "sequence" } | { kind: "step"; step: number } | null
  >(null)
  const [rendering, setRendering] = useState(false)
  const [selectedStep] = useSelectedStep()
  const loadMidiFile = useMidiFileLoader()
  // a MIDI file picked: being read, then waiting for its import options
  const [importing, setImporting] = useState<
    | { status: "loading"; name: string }
    | { status: "ready"; name: string; prepared: PreparedMidi }
    | null
  >(null)
  // from the picker, or again from the recent MIDI files
  const importMidi = async (recent?: RecentFile) => {
    const loaded = await loadMidiFile(
      (name) => setImporting({ status: "loading", name }),
      recent,
    )
    setImporting(loaded === null ? null : { status: "ready", ...loaded })
  }

  return (
    <>
      <MenuBarMenu label={localized["sequencer-file"]}>
        {(close) => (
          <>
            <MenuItem close={close} onSelect={newPatch}>
              <Localized name="sequencer-file-new" />
            </MenuItem>
            <MenuItem close={close} onSelect={open}>
              <Localized name="sequencer-file-open" />
            </MenuItem>
            <MenuItem close={close} onSelect={save}>
              <Localized name="sequencer-file-save" />
            </MenuItem>
            <MenuItem close={close} onSelect={saveAs}>
              <Localized name="sequencer-file-save-as" />
            </MenuItem>
            <MenuDivider />
            <MenuItem close={close} onSelect={() => importMidi()}>
              <Localized name="sequencer-file-import-midi" />
            </MenuItem>
            <MenuDivider />
            <MenuItem
              close={close}
              onSelect={() => setExporting({ kind: "sequence" })}
            >
              <Localized name="sequencer-file-export-midi" />
            </MenuItem>
            <MenuItem
              close={close}
              onSelect={() =>
                setExporting({ kind: "step", step: selectedStep })
              }
            >
              <Localized name="sequencer-file-export-step-midi" />
            </MenuItem>
            <MenuItem close={close} onSelect={() => setRendering(true)}>
              <Localized name="sequencer-file-render-audio" />
            </MenuItem>
            {recentPatches.length > 0 && (
              <>
                <MenuDivider />
                <MenuGroup label={localized["sequencer-file-recent-patches"]}>
                  {recentPatches.map((recent, index) => (
                    <MenuItem
                      // a name can be there twice, from two folders
                      key={`${index}-${recent.name}`}
                      close={close}
                      onSelect={() => openRecent(recent)}
                    >
                      {recent.name}
                    </MenuItem>
                  ))}
                </MenuGroup>
              </>
            )}
            {recentMidi.length > 0 && (
              <>
                <MenuDivider />
                <MenuGroup label={localized["sequencer-file-recent-midi"]}>
                  {recentMidi.map((recent, index) => (
                    <MenuItem
                      key={`${index}-${recent.name}`}
                      close={close}
                      onSelect={() => importMidi(recent)}
                    >
                      {recent.name}
                    </MenuItem>
                  ))}
                </MenuGroup>
              </>
            )}
          </>
        )}
      </MenuBarMenu>
      {importing?.status === "loading" && (
        <Loading
          label={format("sequencer-import-loading", { name: importing.name })}
        />
      )}
      <Suspense fallback={null}>
        {importing?.status === "ready" && (
          <ImportMidiDialog
            name={importing.name}
            prepared={importing.prepared}
            onClose={() => setImporting(null)}
          />
        )}
        {exporting !== null && (
          <ExportMidiDialog
            step={exporting.kind === "step" ? exporting.step : undefined}
            onClose={() => setExporting(null)}
          />
        )}
        {rendering && <RenderAudioDialog onClose={() => setRendering(false)} />}
      </Suspense>
    </>
  )
}
