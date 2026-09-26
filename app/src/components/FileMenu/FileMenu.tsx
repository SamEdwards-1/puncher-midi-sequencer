import { PreparedMidi } from "@midiseq/core"
import { FC, useState } from "react"
import { useFileActions, useMidiFileLoader } from "../../actions/file"
import { useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Loading } from "../ui/Loading"
import { MenuBarMenu, MenuItem } from "../ui/Menu"
import { ExportMidiDialog } from "./ExportMidiDialog"
import { ImportMidiDialog } from "./ImportMidiDialog"

export const FileMenu: FC = () => {
  const { newPatch, open, save, saveAs } = useFileActions()
  const localized = useLocalization()
  // the whole sequence, or the step in the editor when it was asked for
  const [exporting, setExporting] = useState<
    { kind: "sequence" } | { kind: "step"; step: number } | null
  >(null)
  const [selectedStep] = useSelectedStep()
  const loadMidiFile = useMidiFileLoader()
  // a MIDI file picked: being read, then waiting for its import options
  const [importing, setImporting] = useState<
    | { status: "loading"; name: string }
    | { status: "ready"; name: string; prepared: PreparedMidi }
    | null
  >(null)
  const importMidi = async () => {
    const loaded = await loadMidiFile((name) =>
      setImporting({ status: "loading", name }),
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
            <MenuItem close={close} onSelect={importMidi}>
              <Localized name="sequencer-file-import-midi" />
            </MenuItem>
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
          </>
        )}
      </MenuBarMenu>
      {importing?.status === "loading" && (
        <Loading
          label={`${localized["sequencer-import-loading"]} ${importing.name}…`}
        />
      )}
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
    </>
  )
}
