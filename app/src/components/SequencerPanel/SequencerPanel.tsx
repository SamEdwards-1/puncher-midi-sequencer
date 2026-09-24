import {
  Direction,
  GridSize,
  LoopMode,
  NOTES_PER_STEP,
  PACE_LABELS,
  PACES,
  PaceId,
  stepCount,
} from "@midiseq/core"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useGridMode } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { ButtonField, Field, Fields } from "../ui/Field"
import { Panel, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"
import { JumpPatcher } from "./JumpPatcher"

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
  const [mode, setMode] = useGridMode()
  const localized = useLocalization()

  return (
    <Panel
      aria-label={localized["sequencer-panel"]}
      className="overflow-y-auto border-r border-divider"
    >
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
            {PACES.map((pace) => (
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
            max={NOTES_PER_STEP}
            onChange={(maxNotesPerStep) =>
              editSequencer({ maxNotesPerStep }, "max-notes")
            }
          />
        </Field>

        <ButtonField label={localized["sequencer-mark"]}>
          {/* these turn grid clicks into marking rests or skips until
              switched off again */}
          <div className="flex gap-[0.4rem]">
            <Button
              type="button"
              size="field"
              active={mode === "rest"}
              onClick={() => setMode(mode === "rest" ? null : "rest")}
            >
              <Localized name="sequencer-step-state-rest" />
            </Button>
            <Button
              type="button"
              size="field"
              active={mode === "skip"}
              onClick={() => setMode(mode === "skip" ? null : "skip")}
            >
              <Localized name="sequencer-step-state-skip" />
            </Button>
          </div>
        </ButtonField>
      </Fields>

      <JumpPatcher />
    </Panel>
  )
}
