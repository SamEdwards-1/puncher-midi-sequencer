import {
  Direction,
  GridSize,
  LoopMode,
  NOTES_PER_STEP,
  PACE_LABELS,
  PACES,
  PaceId,
  ScaleChoiceJSON,
  SequencerSetting,
  scaleless,
  sequencerScale,
  settingValue,
  stepCount,
} from "@midiseq/core"
import { FC, useMemo } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useGridMode } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import {
  guessScales,
  SEQUENCER_SCALE_CHOICES,
  weightsOfNotes,
} from "../../theory/scales"
import { ModulatedField } from "../Modulation/ModulatedField"
import { FitSelect, ScaleGuesses, ScaleSelects } from "../Scale/ScalePicker"
import { Button } from "../ui/Button"
import { cn } from "../ui/cn"
import { ButtonField, Field, Fields } from "../ui/Field"
import { Panel, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"

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

// `header` is left off when the panel sits under a tab that names it.
export const SequencerPanel: FC<{ header?: boolean; className?: string }> = ({
  header = true,
  className = "border-r border-divider",
}) => {
  const patch = usePatch()
  const { editSequencer, editScale } = usePatchEditor()
  const [mode, setMode] = useGridMode()
  const localized = useLocalization()
  // found from every note the steps hold, among the scales offered here
  const guesses = useMemo(
    () =>
      guessScales(
        weightsOfNotes(patch.steps.flatMap((step) => step.notes)),
        SEQUENCER_SCALE_CHOICES,
      ),
    [patch.steps],
  )
  // a setting of the sequencer's that a CC can drive
  const target = (setting: SequencerSetting) =>
    ({ kind: "sequencer", setting }) as const

  return (
    <Panel
      aria-label={localized["sequencer-panel"]}
      className={cn("overflow-y-auto", className)}
    >
      {header && (
        <PanelHeader>
          <Localized name="sequencer-panel" />
        </PanelHeader>
      )}
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

        <ModulatedField
          label={localized["sequencer-pace"]}
          target={target("pace")}
        >
          {(shown) => (
            <Select
              value={shown(patch.pace)}
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
          )}
        </ModulatedField>

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

        <ModulatedField
          label={localized["sequencer-shift-fit"]}
          target={target("shiftFit")}
        >
          {(shown) => (
            <FitSelect
              value={shown(patch.shiftFit)}
              disabled={scaleless(patch)}
              onChange={(shiftFit) => editSequencer({ shiftFit })}
            />
          )}
        </ModulatedField>

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

        {/* two selects, each with a name of its own, offering the scales a
            modulation can reach */}
        <ModulatedField
          label={localized["sequencer-scale"]}
          target={target("scale")}
          buttons
        >
          {(shown) => {
            // the patch's own scale as it is, fit and all, unless a step
            // has moved it to another
            const own = settingValue(patch, target("scale"))
            const choice = shown(own)
            return (
              <ScaleSelects
                scale={
                  choice === own
                    ? patch.scale
                    : choice === null
                      ? null
                      : sequencerScale(
                          choice as ScaleChoiceJSON,
                          patch.scale?.fit ?? "up",
                        )
                }
                onScale={editScale}
                choices={SEQUENCER_SCALE_CHOICES}
              />
            )
          }}
        </ModulatedField>
        <ButtonField label={localized["sequencer-scale-detected"]}>
          <ScaleGuesses
            guesses={guesses}
            scale={patch.scale}
            onScale={editScale}
          />
        </ButtonField>

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
    </Panel>
  )
}
