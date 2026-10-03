import {
  Direction,
  LoopMode,
  MAX_STEPS,
  maxStepIndex,
  NOTES_PER_STEP,
  PACE_LABELS,
  PACES,
  ScaleChoiceJSON,
  SequencerSetting,
  sequencerScale,
  settingValue,
  stepCount,
} from "@midiseq/core"
import AutoFixIcon from "mdi-react/AutoFixIcon"
import { comparer } from "mobx"
import { FC, useEffect, useMemo, useRef } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatchSelector } from "../../hooks/usePatch"
import { Localized, useLocalization } from "../../localize/useLocalization"
import {
  guessScales,
  makeScale,
  SEQUENCER_SCALE_CHOICES,
  weightsOfNotes,
} from "../../theory/scales"
import { ModulatedField } from "../Modulation/ModulatedField"
import { FitSelect, ScaleGuesses, ScaleSelects } from "../Scale/ScalePicker"
import { IconButton } from "../ui/Button"
import { ComboBox } from "../ui/ComboBox"
import { Field, Fields } from "../ui/Field"
import { Panel, PanelHeader } from "../ui/Panel"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"

const PACE_OPTIONS = PACES.map((pace) => ({
  value: pace,
  label: PACE_LABELS[pace],
}))

const DIRECTIONS: Direction[] = [
  "fwd",
  "bwd",
  "fwdbwd",
  "bwdfwd",
  "random",
  "random+",
]

const LOOP_MODES: LoopMode[] = ["recorded", "all", "custom"]

// a setting of the sequencer's that a CC can drive
const target = (setting: SequencerSetting) =>
  ({ kind: "sequencer", setting }) as const

// `header` is left off when the panel sits under a tab that names it.
export const SequencerPanel: FC<{ header?: boolean; className?: string }> = ({
  header = true,
  className = "border-r border-divider",
}) => {
  // the settings shown here, which edits to the steps and voices leave be
  const settings = usePatchSelector(
    (patch) => ({
      size: patch.size,
      pace: patch.pace,
      direction: patch.direction,
      loop: patch.loop,
      syncVoices: patch.syncVoices,
      maxNotesPerStep: patch.maxNotesPerStep,
      scale: patch.scale,
      transposeAmt: patch.transposeAmt,
      transposeFit: patch.transposeFit,
    }),
    [],
    comparer.shallow,
  )
  // the patch's own scale as a modulation of it has it: tonic and name
  const ownScale = usePatchSelector(
    (patch) => settingValue(patch, target("scale")),
    [],
    comparer.structural,
  )
  // every step's notes, which an edit to anything else on a step keeps
  const notes = usePatchSelector(
    (patch) => patch.steps.map((step) => step.notes),
    [],
    comparer.shallow,
  )
  const { editSequencer, editScale } = usePatchEditor()
  const localized = useLocalization()
  // found from every note the steps hold, among the scales offered here
  const guesses = useMemo(
    () => guessScales(weightsOfNotes(notes.flat()), SEQUENCER_SCALE_CHOICES),
    [notes],
  )
  // the scale that best fits the notes, taken in one click
  const best = guesses[0]
  const detect = () => {
    const next =
      best && makeScale(best.tonic, best.name, settings.scale?.fit ?? "up")
    if (next) {
      editScale(next)
    }
  }
  // on first load, a patch with no scale takes the best of those found
  const defaulted = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on mount
  useEffect(() => {
    if (defaulted.current) {
      return
    }
    defaulted.current = true
    if (settings.scale === null && best) {
      detect()
    }
  }, [])
  return (
    <Panel
      aria-label={localized["sequencer-panel"]}
      scrolls
      className={className}
    >
      {header && (
        <PanelHeader>
          <Localized name="sequencer-panel" />
        </PanelHeader>
      )}
      <Fields>
        {/* steps past the size are kept, and come back as it grows */}
        <ModulatedField
          label={localized["sequencer-size"]}
          target={target("size")}
        >
          {(shown) => (
            <Stepper
              label={localized["sequencer-size"]}
              value={shown(settings.size)}
              min={1}
              max={MAX_STEPS}
              onChange={(size) => editSequencer({ size }, "size")}
            />
          )}
        </ModulatedField>

        <ModulatedField
          label={localized["sequencer-pace"]}
          target={target("pace")}
        >
          {(shown) => (
            <ComboBox
              value={shown(settings.pace)}
              options={PACE_OPTIONS}
              onChange={(pace) => editSequencer({ pace })}
            />
          )}
        </ModulatedField>

        <ModulatedField
          label={localized["sequencer-direction"]}
          target={target("direction")}
        >
          {(shown) => (
            <ComboBox
              value={shown(settings.direction)}
              options={DIRECTIONS.map((value) => ({
                value,
                label: localized[`sequencer-direction-${value}`],
              }))}
              onChange={(direction) => editSequencer({ direction })}
            />
          )}
        </ModulatedField>

        <ModulatedField
          label={localized["sequencer-loop"]}
          target={target("loop")}
        >
          {(shown) => (
            <ComboBox
              value={shown(settings.loop.mode)}
              options={LOOP_MODES.map((value) => ({
                value,
                label: localized[`sequencer-loop-${value}`],
              }))}
              onChange={(mode) =>
                editSequencer({ loop: { ...settings.loop, mode } })
              }
            />
          )}
        </ModulatedField>

        {settings.loop.mode === "custom" && (
          <Field label={localized["sequencer-loop-end"]}>
            <Stepper
              label={localized["sequencer-loop-end"]}
              // an end kept past a smaller grid shows as its last step
              value={
                Math.min(settings.loop.end, maxStepIndex(settings.size)) + 1
              }
              min={1}
              max={stepCount(settings.size)}
              onChange={(value) =>
                editSequencer(
                  { loop: { ...settings.loop, end: value - 1 } },
                  "loop-end",
                )
              }
            />
          </Field>
        )}

        <Field label={localized["sequencer-sync-voices"]}>
          <Toggle
            label={localized["sequencer-sync-voices"]}
            checked={settings.syncVoices}
            onChange={(syncVoices) => editSequencer({ syncVoices })}
          />
        </Field>

        <ModulatedField
          label={localized["sequencer-max-notes"]}
          target={target("maxNotesPerStep")}
        >
          {(shown) => (
            <Stepper
              label={localized["sequencer-max-notes"]}
              value={shown(settings.maxNotesPerStep)}
              min={1}
              max={NOTES_PER_STEP}
              onChange={(maxNotesPerStep) =>
                editSequencer({ maxNotesPerStep }, "max-notes")
              }
            />
          )}
        </ModulatedField>

        <div className="mt-3">
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
              const choice = shown(ownScale)
              return (
                <div className="flex min-w-0 items-center gap-1">
                  <ScaleSelects
                    className="flex-1"
                    scale={
                      choice === ownScale
                        ? settings.scale
                        : choice === null
                          ? null
                          : sequencerScale(
                              choice as ScaleChoiceJSON,
                              settings.scale?.fit ?? "up",
                            )
                    }
                    onScale={editScale}
                    choices={SEQUENCER_SCALE_CHOICES}
                  />
                  <IconButton
                    aria-label={localized["sequencer-scale-detect"]}
                    title={
                      best
                        ? localized["sequencer-scale-detect"]
                        : localized["sequencer-scale-no-notes"]
                    }
                    disabled={!best}
                    onClick={detect}
                  >
                    <AutoFixIcon size={16} />
                  </IconButton>
                </div>
              )
            }}
          </ModulatedField>
          {/* the scales found in the notes, across the whole column */}
          <ScaleGuesses
            className="pt-[0.1rem] pb-[0.4rem]"
            guesses={guesses}
            scale={settings.scale}
            onScale={editScale}
          />

          <ModulatedField
            label={localized["sequencer-transpose-amt"]}
            target={target("transposeAmt")}
          >
            {(shown) => (
              <Stepper
                label={localized["sequencer-transpose-amt"]}
                value={shown(settings.transposeAmt)}
                min={-24}
                max={24}
                onChange={(transposeAmt) =>
                  editSequencer({ transposeAmt }, "transpose-amt")
                }
              />
            )}
          </ModulatedField>

          <ModulatedField
            label={localized["sequencer-record-fit"]}
            target={target("transposeFit")}
          >
            {(shown) => (
              <FitSelect
                value={shown(settings.transposeFit)}
                onChange={(transposeFit) => editSequencer({ transposeFit })}
              />
            )}
          </ModulatedField>
        </div>
      </Fields>
    </Panel>
  )
}
