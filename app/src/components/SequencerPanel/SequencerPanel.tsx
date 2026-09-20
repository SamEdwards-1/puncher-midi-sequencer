import styled from "@emotion/styled"
import {
  Direction,
  GridSize,
  LoopMode,
  PACE_LABELS,
  PaceId,
  SEQUENCER_PACES,
  stepCount,
} from "@midiseq/core"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Field, Fields } from "../ui/Field"
import { Panel, PanelBody, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"

const LeftPanel = styled(Panel)`
  border-right: 1px solid var(--color-divider);
`

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "fwd", label: "Forwards" },
  { value: "bwd", label: "Backwards" },
  { value: "fwdbwd", label: "Fwd / Bwd" },
  { value: "bwdfwd", label: "Bwd / Fwd" },
  { value: "random", label: "Random" },
  { value: "random+", label: "Random+" },
]

const LOOP_MODES: { value: LoopMode; label: string }[] = [
  { value: "recorded", label: "Recorded" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
]

export const SequencerPanel: FC = () => {
  const patch = usePatch()
  const { editSequencer } = usePatchEditor()
  const localized = useLocalization()

  return (
    <LeftPanel aria-label={localized["sequencer-panel"]}>
      <PanelHeader>
        <Localized name="sequencer-panel" />
      </PanelHeader>
      <Fields>
        <Field label={localized["sequencer-size"]}>
          <Select
            value={patch.size}
            onChange={(event) =>
              editSequencer({ size: event.target.value as GridSize })
            }
          >
            <option value="small">4 × 4</option>
            <option value="large">8 × 8</option>
          </Select>
        </Field>

        <Field label={localized["sequencer-pace"]}>
          <Select
            value={patch.pace}
            onChange={(event) =>
              editSequencer({ pace: event.target.value as PaceId })
            }
          >
            {SEQUENCER_PACES.map((pace) => (
              <option key={pace} value={pace}>
                {PACE_LABELS[pace]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-direction"]}>
          <Select
            value={patch.direction}
            onChange={(event) =>
              editSequencer({ direction: event.target.value as Direction })
            }
          >
            {DIRECTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-loop"]}>
          <Select
            value={patch.loop.mode}
            onChange={(event) =>
              editSequencer({
                loop: { ...patch.loop, mode: event.target.value as LoopMode },
              })
            }
          >
            {LOOP_MODES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {patch.loop.mode === "custom" && (
          <Field label={localized["sequencer-loop-end"]}>
            <Stepper
              label={localized["sequencer-loop-end"]}
              value={patch.loop.end + 1}
              min={1}
              max={stepCount(patch.size)}
              onChange={(value) =>
                editSequencer(
                  { loop: { ...patch.loop, end: value - 1 } },
                  "loop-end",
                )
              }
            />
          </Field>
        )}

        <Field label={localized["sequencer-sync-voices"]}>
          <Toggle
            label={localized["sequencer-sync-voices"]}
            checked={patch.syncVoices}
            onChange={(syncVoices) => editSequencer({ syncVoices })}
          />
        </Field>

        <Field label={localized["sequencer-shift-amt"]}>
          <Stepper
            label={localized["sequencer-shift-amt"]}
            value={patch.shiftAmt}
            min={-24}
            max={24}
            onChange={(shiftAmt) => editSequencer({ shiftAmt }, "shift-amt")}
          />
        </Field>

        <Field label={localized["sequencer-max-notes"]}>
          <Stepper
            label={localized["sequencer-max-notes"]}
            value={patch.maxNotesPerStep}
            min={1}
            max={16}
            onChange={(maxNotesPerStep) =>
              editSequencer({ maxNotesPerStep }, "max-notes")
            }
          />
        </Field>
      </Fields>

      <PanelHeader>
        <Localized name="sequencer-jumps" />
      </PanelHeader>
      <PanelBody />
    </LeftPanel>
  )
}
