import {
  defaultModulation,
  ModulationJSON,
  ModulationTarget,
  modulationOf,
  nextModulationCC,
  removeModulation,
  sameTarget,
  setModulation,
} from "@midiseq/core"
import { describeModulation, modulationLabel } from "./describe"
import {
  InputError,
  MODULATION_SETTING_NAMES,
  modulationSettingName,
  readBoolean,
  readFields,
  readList,
  readModulationSetting,
  readModulationValue,
  readNumber,
  readVoice,
} from "./input"
import {
  boolean,
  fieldsOf,
  integer,
  list,
  named,
  object,
  oneOf,
  present,
  ToolContext,
  text,
  tool,
} from "./tool"

const MODULATION = object(
  {
    setting: oneOf(
      MODULATION_SETTING_NAMES,
      "The setting the CC drives: a voice's pace, length, rule, offset, offset_fit or pattern_length, or its sync; the sequencer's pace, scale or shift_fit; or the hold, flip or shift action",
    ),
    voice: integer(
      "The voice whose setting it is, 1 to 4: needed for a voice's settings and sync. Without one, pace is the sequencer's",
      1,
      4,
    ),
    cc: integer(
      "The controller that drives it; each drives one setting. A new modulation takes the first undefined controller nothing uses unless given",
      0,
      119,
    ),
    from: text(
      'The setting\'s value the CC\'s 0 stands for, as its field takes it: a pace ("16th"), a length in percent (35), a rule ("updown"), semitones (-7), a fit ("up"), a pattern length (8), a scale ("A minor", or "none"), or on or off for an action. A new modulation runs across all of the setting\'s values unless given, or for the scale, the ten scales at its tonic',
    ),
    to: text(
      "The value the CC's 127 stands for. The values between from and to spread evenly across the CC's, in the order the setting's field lists them, backwards when from comes after to",
    ),
    remove: boolean(
      "Stops the CC driving the setting. The steps' envelopes for it stay, as plain CCs",
    ),
  },
  ["setting"],
)

// Which setting an entry names. A voice's needs the voice, and pace without
// one is the sequencer's.
const readTarget = (
  fields: Record<string, unknown>,
  where: string,
): ModulationTarget => {
  const setting = readModulationSetting(fields.setting, `${where}.setting`)
  const voice = present(fields.voice)
    ? readVoice(fields.voice, `${where}.voice`)
    : null
  const name = modulationSettingName(setting)
  switch (setting) {
    case "hold":
    case "flip":
    case "shift":
      if (voice !== null) {
        throw new InputError(
          `${where}: ${name} is an action for the whole sequence, so give no voice`,
        )
      }
      return { kind: "action", setting }
    case "sync":
      if (voice === null) {
        throw new InputError(
          `${where}: each voice has a sync of its own, so give the voice`,
        )
      }
      return { kind: "action", setting, voice }
    case "scale":
    case "shiftFit":
      if (voice !== null) {
        throw new InputError(
          `${where}: ${name} is the sequencer's, so give no voice`,
        )
      }
      return { kind: "sequencer", setting }
    case "pace":
      return voice === null
        ? { kind: "sequencer", setting }
        : { kind: "voice", voice, setting }
    default:
      if (voice === null) {
        throw new InputError(
          `${where}: ${name} is a voice's, so give the voice, 1 to 4`,
        )
      }
      return { kind: "voice", voice, setting }
  }
}

/**
 * Settings bound to CCs, as a setting's gear makes them: what makes the
 * steps' envelopes change a voice's pace or the scale as the sequence
 * plays. All of it one undo, or none of it if any can't be done.
 */
export const modulationsTool = ({ stores, view, edit }: ToolContext) =>
  tool({
    name: "set_modulations",
    title: "Bind settings to CCs",
    description:
      "Makes, changes or removes modulations, as a setting's gear does. A modulation lets a CC drive a setting — a voice's pace, rule or offset, the scale, an action — so a step with an envelope for that CC sets the setting as the envelope goes, across that step, and a step without one leaves the setting as it is. The CC's values 0 to 127 spread evenly over the setting's values from `from` to `to`. A setting has at most one modulation, and a CC drives one setting. Changing a modulation takes the envelopes on its CC along, so each step plays as it did wherever it can. List each by its setting, and a voice's by its voice, with only what should change; the whole call is one entry in the app's undo history. The first voice whose setting is modulated is shown in the Voices panel, which also makes it the voice Sync plays. Then draw envelopes for the CC with set_steps: each modulation returned lists the CC value that stands for each of its setting's values.",
    input: object(
      {
        modulations: list(
          MODULATION,
          "The modulations to make, change or remove",
        ),
      },
      ["modulations"],
    ),
    run: (input) => {
      let patch = stores.sequencerStore.patch
      const edited: ModulationTarget[] = []
      const removed: string[] = []
      const warnings: string[] = []

      readList(input.modulations, "modulations").forEach((item, position) => {
        const at = `modulations[${position}]`
        const fields = readFields(item, at, fieldsOf(MODULATION))
        const target = readTarget(fields, at)
        const label = modulationLabel(target)
        const existing = modulationOf(patch, target)
        const changes = ["cc", "from", "to"].filter((field) =>
          present(fields[field]),
        )

        if (
          present(fields.remove) &&
          readBoolean(fields.remove, `${at}.remove`)
        ) {
          if (changes.length > 0) {
            throw new InputError(
              `${at}: remove takes ${label}'s modulation away, so give no ${changes.join(" or ")}`,
            )
          }
          if (existing === undefined) {
            throw new InputError(`${at}: ${label} has no modulation to remove`)
          }
          patch = removeModulation(patch, target)
          removed.push(label)
          return
        }
        if (existing !== undefined && changes.length === 0) {
          throw new InputError(
            `${at} changes nothing: ${label} is modulated already, so give its cc, from or to, or remove it`,
          )
        }

        const cc = present(fields.cc)
          ? readNumber(fields.cc, `${at}.cc`, 0, 119)
          : (existing?.cc ?? nextModulationCC(patch))
        const clash = patch.modulations.find(
          (modulation) =>
            modulation.cc === cc && !sameTarget(modulation.target, target),
        )
        if (clash !== undefined) {
          throw new InputError(
            `${at}: CC ${cc} drives ${modulationLabel(clash.target)} already, and a CC drives one setting, so give another cc`,
          )
        }
        const start = existing ?? defaultModulation(patch, target, cc)
        const next: ModulationJSON = {
          target,
          cc,
          from: present(fields.from)
            ? readModulationValue(target, fields.from, `${at}.from`)
            : start.from,
          to: present(fields.to)
            ? readModulationValue(target, fields.to, `${at}.to`)
            : start.to,
        }

        // envelopes the steps already have for the CC start driving it
        if (existing?.cc !== cc) {
          const sending = patch.steps.flatMap((step, index) =>
            step.envelopes.some((envelope) => envelope.cc === cc)
              ? [index]
              : [],
          )
          if (sending.length > 0) {
            warnings.push(
              `${label} now follows the envelopes for CC ${cc} that ${named("step", sending)} already had`,
            )
          }
        }
        patch = setModulation(patch, next)
        if (!edited.some((each) => sameTarget(each, target))) {
          edited.push(target)
        }
      })
      if (edited.length === 0 && removed.length === 0) {
        throw new InputError("modulations lists nothing to change")
      }

      edit(patch)
      // a voice's gear is in the Voices panel, shown as a click on the
      // voice's tab shows it, which Sync follows
      const voice = edited.flatMap((target) =>
        "voice" in target ? [target.voice] : [],
      )[0]
      if (voice !== undefined) {
        view.selectVoice(voice)
        stores.player.setSelectedVoice(voice)
      }
      const modulations = edited.flatMap((target) => {
        const modulation = modulationOf(patch, target)
        return modulation === undefined
          ? []
          : [describeModulation(patch, modulation)]
      })
      const idle = modulations.filter(({ steps }) => steps.length === 0)
      return {
        modulations,
        ...(removed.length > 0 && { removed }),
        ...(idle.length > 0 && {
          note: `No step has an envelope for ${idle
            .map(({ label, cc }) => `${label}'s CC ${cc}`)
            .join(
              ", ",
            )} yet, so nothing drives it: draw them with set_steps, using the values' CC values`,
        }),
        ...(warnings.length > 0 && { warnings }),
      }
    },
  })
