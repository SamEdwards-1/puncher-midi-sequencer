import {
  Direction,
  LoopMode,
  ModulationTarget,
  ModulationValue,
  PACE_LABELS,
  PaceId,
  ScaleChoiceJSON,
  ScaleFit,
  SequencerSetting,
  VoiceRule,
} from "@midiseq/core"
import { LocalizationKey } from "../../localize/useLocalization"
import { scaleLabel } from "../../theory/scales"

type Localized = Record<LocalizationKey, string>

/** One of a setting's values as its field shows it: "8th D", "35%", "+7". */
export const modulationValueLabel = (
  target: ModulationTarget,
  value: ModulationValue,
  localized: Localized,
): string => {
  switch (target.setting) {
    case "pace":
      return PACE_LABELS[value as PaceId]
    case "length":
      return `${Math.round((value as number) * 100)}%`
    case "rule":
      return localized[`sequencer-rule-${value as VoiceRule}`]
    case "transposeAmt":
      return (value as number) > 0 ? `+${value}` : String(value)
    case "direction":
      return localized[`sequencer-direction-${value as Direction}`]
    case "loop":
      return localized[`sequencer-loop-${value as LoopMode}`]
    case "transposeFit":
      return localized[`sequencer-scale-fit-${value as ScaleFit}`]
    case "patternLength":
    case "size":
    case "maxNotesPerStep":
      return String(value)
    case "scale":
      return value === null
        ? localized["sequencer-scale-none"]
        : scaleLabel(value as ScaleChoiceJSON)
    case "hold":
    case "sync":
    case "flip":
    case "transpose":
      return value
        ? localized["sequencer-action-on"]
        : localized["sequencer-action-off"]
  }
}

// each setting's field, as it is labelled — but for a voice's fit, "Scale
// fit" beside the Transpose it goes with, named for it here; the
// sequencer's is its Recording fit
const FIELDS: Record<ModulationTarget["setting"], LocalizationKey> = {
  size: "sequencer-size",
  direction: "sequencer-direction",
  loop: "sequencer-loop",
  transposeAmt: "sequencer-transpose-amt",
  maxNotesPerStep: "sequencer-max-notes",
  pace: "sequencer-pace",
  length: "sequencer-voice-length",
  rule: "sequencer-voice-rule",
  patternLength: "sequencer-voice-pattern-length",
  scale: "sequencer-scale",
  transposeFit: "sequencer-modulation-tab-transpose-fit",
  hold: "sequencer-action-hold",
  sync: "sequencer-action-sync",
  flip: "sequencer-action-flip",
  transpose: "sequencer-action-transpose",
}

/**
 * Where a setting is and what it's called: "Voice 2 · Pace". A voice's
 * Sync is its voice's, the other actions the Actions'.
 */
export const modulationTargetLabel = (
  target: ModulationTarget,
  localized: Localized,
): string =>
  `${
    "voice" in target
      ? `${localized["sequencer-voice"]} ${target.voice + 1}`
      : target.kind === "action"
        ? localized["sequencer-actions"]
        : localized["sequencer-panel"]
  } · ${
    localized[
      target.kind === "sequencer" && target.setting === "transposeFit"
        ? "sequencer-record-fit"
        : FIELDS[target.setting]
    ]
  }`

// shorter, for a lane's tab
const TABS: Record<ModulationTarget["setting"], LocalizationKey> = {
  size: "sequencer-size",
  direction: "sequencer-direction",
  loop: "sequencer-loop",
  transposeAmt: "sequencer-transpose-amt",
  maxNotesPerStep: "sequencer-max-notes",
  pace: "sequencer-pace",
  length: "sequencer-voice-length",
  rule: "sequencer-voice-rule",
  patternLength: "sequencer-voice-pattern-length",
  scale: "sequencer-scale",
  transposeFit: "sequencer-modulation-tab-transpose-fit",
  hold: "sequencer-action-hold",
  sync: "sequencer-action-sync",
  flip: "sequencer-action-flip",
  transpose: "sequencer-action-transpose",
}

// the sequencer's tabs for the settings a voice has too
const SEQUENCER_TABS: Partial<Record<SequencerSetting, LocalizationKey>> = {
  pace: "sequencer-modulation-tab-sequencer-pace",
  transposeAmt: "sequencer-modulation-tab-sequencer-transpose",
  transposeFit: "sequencer-modulation-tab-sequencer-transpose-fit",
}

/**
 * A modulation's lane, named for the setting it drives: a voice's with the
 * voice's number, as its Velocity tab is — "Pace 2", "Sync 2" — and the
 * sequencer's pace and transpose told apart from the voices'.
 */
export const modulationTabLabel = (
  target: ModulationTarget,
  localized: Localized,
): string =>
  "voice" in target
    ? `${localized[TABS[target.setting]]} ${target.voice + 1}`
    : localized[
        (target.kind === "sequencer" && SEQUENCER_TABS[target.setting]) ||
          TABS[target.setting]
      ]
