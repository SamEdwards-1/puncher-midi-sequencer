import {
  exportBeats,
  paceBeats,
  passSteps,
  StepIndex,
  sequenceCCs,
} from "@midiseq/core"
import { FC, useMemo } from "react"
import { exportOptionsFor, useMidiExport } from "../../actions/file"
import { useExportSettings } from "../../hooks/useExportSettings"
import { usePatch } from "../../hooks/usePatch"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Dialog } from "../ui/Dialog"
import { ExportOptions } from "./ExportOptions"

const BEATS_PER_BAR = 4

// a length of time as minutes and seconds
const clock = (seconds: number) => {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

// bars to two places at most, and no trailing zeros
const bars = (beats: number) =>
  String(Math.round((beats / BEATS_PER_BAR) * 100) / 100)

/**
 * A MIDI export of the whole sequence, or of `step` alone, with its options
 * — the export settings, which it edits for next time too. A step's export
 * lists the CCs that step sends, and plays it once, so it has no passes.
 */
export const ExportMidiDialog: FC<{
  step?: StepIndex
  onClose: () => void
}> = ({ step, onClose }) => {
  const patch = usePatch()
  const settings = useExportSettings()
  const { exportSequence, exportStep } = useMidiExport()
  const localized = useLocalization()
  const ccs = useMemo(
    () => sequenceCCs(patch, step === undefined ? undefined : [step]),
    [patch, step],
  )

  // what the export would hold as the options stand
  const options = exportOptionsFor(settings, patch, ccs)
  const steps = step === undefined ? settings.passes * passSteps(patch) : 1
  const beats =
    step === undefined
      ? exportBeats(patch, settings.passes)
      : paceBeats(patch.pace)
  const canExport =
    steps > 0 && (options.voices.length > 0 || options.ccs.length > 0)

  return (
    <Dialog
      title={
        step === undefined
          ? localized["sequencer-export-midi"]
          : `${localized["sequencer-export-step-midi"]} ${step + 1}`
      }
      closeLabel={localized["sequencer-export-cancel"]}
      onClose={onClose}
      narrow
      footer={
        <>
          <Button type="button" onClick={onClose}>
            <Localized name="sequencer-export-cancel" />
          </Button>
          <Button
            type="button"
            primary
            disabled={!canExport}
            onClick={() => {
              onClose()
              void (step === undefined ? exportSequence() : exportStep(step))
            }}
          >
            <Localized name="sequencer-export-midi-action" />
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-1">
        <p className="m-0 text-small text-fg-tertiary">
          <Localized
            name={
              step === undefined
                ? "sequencer-export-hint"
                : "sequencer-export-step-hint"
            }
          />
        </p>
        <ExportOptions
          ccs={ccs}
          passes={step === undefined}
          after={
            <span className="text-small text-fg-tertiary" data-export-length>
              {steps} {localized["sequencer-export-steps"]} · {bars(beats)}{" "}
              {localized["sequencer-export-bars"]} ·{" "}
              {clock((beats * 60) / patch.tempo)}
            </span>
          }
        />
      </div>
    </Dialog>
  )
}
