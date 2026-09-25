import { FC, useState } from "react"
import { useFileActions } from "../../actions/file"
import { useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { MenuBarMenu, MenuItem } from "../ui/Menu"
import { ExportMidiDialog } from "./ExportMidiDialog"

export const FileMenu: FC = () => {
  const { newPatch, open, save, saveAs } = useFileActions()
  const localized = useLocalization()
  // the whole sequence, or the step in the editor when it was asked for
  const [exporting, setExporting] = useState<
    { kind: "sequence" } | { kind: "step"; step: number } | null
  >(null)
  const [selectedStep] = useSelectedStep()

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
      {exporting !== null && (
        <ExportMidiDialog
          step={exporting.kind === "step" ? exporting.step : undefined}
          onClose={() => setExporting(null)}
        />
      )}
    </>
  )
}
