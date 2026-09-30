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
  outsidein: "Outside In",
  insideout: "Inside Out",
  ends: "Ends",
  shuffle: "Shuffle",
  walk: "Walk",
  norepeat: "No Repeat",
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
    case "shiftAmt":
      return (value as number) > 0 ? `+${value}` : String(value)
    case "direction":
      return (
        {
          fwd: "Forwards",
          bwd: "Backwards",
          fwdbwd: "Fwd / Bwd",
          bwdfwd: "Bwd / Fwd",
          random: "Random",
          "random+": "Random+",
        } as Record<string, string>
      )[String(value)]
    case "loop":
      return (
        { recorded: "Recorded", all: "All", custom: "Custom" } as Record<
          string,
          string
        >
      )[String(value)]
    case "offsetFit":
    case "shiftFit":
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
    case "shift":
      return value
        ? localized["sequencer-action-on"]
        : localized["sequencer-action-off"]
  }
}

// each setting's field, as it is labelled
const FIELDS: Record<ModulationTarget["setting"], LocalizationKey> = {
  size: "sequencer-size",
  direction: "sequencer-direction",
  loop: "sequencer-loop",
  shiftAmt: "sequencer-shift-amt",
  maxNotesPerStep: "sequencer-max-notes",
  pace: "sequencer-pace",
  length: "sequencer-voice-length",
  rule: "sequencer-voice-rule",
  offset: "sequencer-voice-offset",
  offsetFit: "sequencer-voice-offset-fit",
  patternLength: "sequencer-voice-pattern-length",
  scale: "sequencer-scale",
  shiftFit: "sequencer-shift-fit",
  hold: "sequencer-action-hold",
  sync: "sequencer-action-sync",
  flip: "sequencer-action-flip",
  shift: "sequencer-action-shift",
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
  } · ${localized[FIELDS[target.setting]]}`

// shorter, for a lane's tab
const TABS: Record<ModulationTarget["setting"], LocalizationKey> = {
  size: "sequencer-size",
  direction: "sequencer-direction",
  loop: "sequencer-loop",
  shiftAmt: "sequencer-shift-amt",
  maxNotesPerStep: "sequencer-max-notes",
  pace: "sequencer-pace",
  length: "sequencer-voice-length",
  rule: "sequencer-voice-rule",
  offset: "sequencer-voice-offset",
  offsetFit: "sequencer-modulation-tab-offset-fit",
  patternLength: "sequencer-voice-pattern-length",
  scale: "sequencer-scale",
  shiftFit: "sequencer-modulation-tab-shift-fit",
  hold: "sequencer-action-hold",
  sync: "sequencer-action-sync",
  flip: "sequencer-action-flip",
  shift: "sequencer-action-shift",
}

/**
 * A modulation's lane, named for the setting it drives: a voice's with the
 * voice's number, as its Velocity tab is — "Pace 2", "Sync 2" — and the
 * sequencer's pace told apart from the voices'.
 */
export const modulationTabLabel = (
  target: ModulationTarget,
  localized: Localized,
): string =>
  "voice" in target
    ? `${localized[TABS[target.setting]]} ${target.voice + 1}`
    : target.setting === "pace"
      ? localized["sequencer-modulation-tab-sequencer-pace"]
      : localized[TABS[target.setting]]
