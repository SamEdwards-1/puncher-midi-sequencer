import {
  EnvelopeJSON,
  ModulationJSON,
  modulationStops,
  removePoint,
  snapToModulation,
} from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import { FC, useMemo } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useLocalization } from "../../localize/useLocalization"
import { modulationValueLabel } from "../Modulation/labels"
import { IconButton } from "../ui/Button"
import { ComboBox } from "../ui/ComboBox"
import { Stepper } from "../ui/Stepper"
import { usePopup } from "../ui/usePopup"

export interface EnvelopePointOptionsProps {
  step: number
  envelope: EnvelopeJSON
  index: number
  // the setting the envelope's CC drives, if it drives one
  modulation: ModulationJSON | undefined
  at: { x: number; y: number }
  onClose: () => void
}

/**
 * One point of an envelope, opened by right-clicking it: its value typed,
 * stepped or dragged — a plain CC as a number, one that modulates a setting
 * as the setting's values — and a button to delete it. The point keeps its
 * time.
 */
export const EnvelopePointOptions: FC<EnvelopePointOptionsProps> = ({
  step,
  envelope,
  index,
  modulation,
  at: requestedAt,
  onClose,
}) => {
  const { editEnvelopePoints } = usePatchEditor()
  const localized = useLocalization()
  const { popup, at } = usePopup(requestedAt, onClose)
  const point = envelope.points[index]
  const options = useMemo(
    () =>
      modulation === undefined
        ? []
        : modulationStops(modulation).map(({ value, cc }) => ({
            value: cc,
            label: modulationValueLabel(modulation.target, value, localized),
          })),
    [modulation, localized],
  )

  // a run of steps, or a drag, is one undo entry
  const setValue = (value: number) =>
    editEnvelopePoints(
      step,
      envelope.id,
      envelope.points.map((each, current) =>
        current === index ? { ...each, value } : each,
      ),
      `envelope-point-${step}-${envelope.id}-${index}`,
    )

  const label = `${localized["sequencer-envelope-point"]} ${index + 1}`
  const valueLabel = `${label} ${localized["sequencer-envelope-point-value"].toLowerCase()}`

  return (
    <div
      ref={popup}
      role="dialog"
      aria-label={label}
      data-envelope-point-options={index}
      className="fixed z-20 w-56 rounded-lg border border-popup-border bg-background-secondary px-3 pt-1 pb-3 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
      style={{ left: at.x, top: at.y }}
    >
      <div className="pt-2 pb-1 text-small font-semibold text-fg">{label}</div>
      <div className="flex flex-col gap-1">
        <span className="text-tiny text-fg-tertiary">
          {localized["sequencer-envelope-point-value"]}
        </span>
        <div className="flex items-center gap-1">
          <div className="min-w-0 grow">
            {modulation === undefined ? (
              <Stepper
                label={valueLabel}
                value={point.value}
                min={0}
                max={127}
                onChange={setValue}
              />
            ) : (
              <ComboBox
                aria-label={valueLabel}
                // a point off the setting's values shows the one it plays
                value={snapToModulation(modulation, point.value)}
                options={options}
                onChange={setValue}
              />
            )}
          </div>
          <IconButton
            aria-label={localized["sequencer-envelope-point-delete"]}
            title={localized["sequencer-envelope-point-delete"]}
            onClick={() => {
              editEnvelopePoints(
                step,
                envelope.id,
                removePoint(envelope.points, index),
              )
              onClose()
            }}
          >
            <CloseIcon size={16} />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
