import {
  ModulationTarget,
  ModulationValue,
  PACE_LABELS,
  PaceId,
  ScaleChoiceJSON,
  ScaleFit,
  VoiceRule,
} from "@midiseq/core"
import { LocalizationKey } from "../../localize/useLocalization"
import { scaleLabel } from "../../theory/scales"

type Localized = Record<LocalizationKey, string>

export const RULE_LABELS: Record<VoiceRule, string> = {
  nth: "Nth",
  lowest: "Lowest",
  highest: "Highest",
  random: "Random",
  up: "Up",
  down: "Down",
  updown: "Up / Down",
  downup: "Down / Up",
  "updown+": "Up / Down +",
  "downup+": "Down / Up +",
  rise: "Rise",
  fall: "Fall",
}

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
      return RULE_LABELS[value as VoiceRule]
    case "offset":
      return (value as number) > 0 ? `+${value}` : String(value)
    case "offsetFit":
    case "shiftFit":
      return localized[`sequencer-scale-fit-${value as ScaleFit}`]
    case "patternLength":
      return String(value)
    case "scale":
      return value === null
        ? localized["sequencer-scale-none"]
        : scaleLabel(value as ScaleChoiceJSON)
  }
}

// each setting's field, as it is labelled
const FIELDS: Record<ModulationTarget["setting"], LocalizationKey> = {
  pace: "sequencer-pace",
  length: "sequencer-voice-length",
  rule: "sequencer-voice-rule",
  offset: "sequencer-voice-offset",
  offsetFit: "sequencer-voice-offset-fit",
  patternLength: "sequencer-voice-pattern-length",
  scale: "sequencer-scale",
  shiftFit: "sequencer-shift-fit",
}

/** Where a setting is and what it's called: "Voice 2 · Pace". */
export const modulationTargetLabel = (
  target: ModulationTarget,
  localized: Localized,
): string =>
  `${
    target.kind === "voice"
      ? `${localized["sequencer-voice"]} ${target.voice + 1}`
      : localized["sequencer-panel"]
  } · ${localized[FIELDS[target.setting]]}`

// shorter, for a lane's tab
const TABS: Record<ModulationTarget["setting"], LocalizationKey> = {
  pace: "sequencer-pace",
  length: "sequencer-voice-length",
  rule: "sequencer-voice-rule",
  offset: "sequencer-voice-offset",
  offsetFit: "sequencer-modulation-tab-offset-fit",
  patternLength: "sequencer-voice-pattern-length",
  scale: "sequencer-scale",
  shiftFit: "sequencer-modulation-tab-shift-fit",
}

/**
 * A modulation's lane, named for the setting it drives: a voice's with the
 * voice's number, as its Velocity tab is — "Pace 2" — and the sequencer's
 * pace told apart from the voices'.
 */
export const modulationTabLabel = (
  target: ModulationTarget,
  localized: Localized,
): string =>
  target.kind === "voice"
    ? `${localized[TABS[target.setting]]} ${target.voice + 1}`
    : target.setting === "pace"
      ? localized["sequencer-modulation-tab-sequencer-pace"]
      : localized[TABS[target.setting]]
