import {
  CC_NAMES,
  ExportLayout,
  gmProgramName,
  SequenceCC,
  VoiceIndex,
} from "@midiseq/core"
import { CSSProperties, FC, ReactNode } from "react"
import { useExportSettings } from "../../hooks/useExportSettings"
import { usePatch } from "../../hooks/usePatch"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { ccKey, MAX_EXPORT_PASSES } from "../../stores/ExportSettingsStore"
import { Button } from "../ui/Button"
import { Checkbox } from "../ui/Checkbox"
import { Stepper } from "../ui/Stepper"

const VOICES: VoiceIndex[] = [0, 1, 2, 3]
const LAYOUTS: ExportLayout[] = ["perVoice", "combined"]

// A labelled area of the options, with room for a control beside its label.
const Section: FC<{
  label: ReactNode
  aside?: ReactNode
  children: ReactNode
}> = ({ label, aside, children }) => (
  <section className="flex flex-col gap-1">
    <div className="flex items-center justify-between gap-3">
      <h3 className="m-0 text-small font-normal text-fg-secondary">{label}</h3>
      {aside}
    </div>
    {children}
  </section>
)

/**
 * The choices a MIDI export makes — which voices and which of `ccs`, one
 * track a voice or one for everything, and with `passes`, how many times
 * through the sequence — edited straight into the export settings, so the
 * dialogs, Settings and dragging a step out all share them. A voice that is
 * off plays nothing, so it can't be ticked; the CCs are listed by number and
 * channel, with All to tick or clear the lot. `after` sits below the
 * passes, for what they come to.
 */
export const ExportOptions: FC<{
  ccs: SequenceCC[]
  passes?: boolean
  after?: ReactNode
}> = ({ ccs, passes = false, after }) => {
  const patch = usePatch()
  const settings = useExportSettings()
  const localized = useLocalization()
  const excluded = new Set(settings.excludedCCs)
  const chosen = ccs.filter((each) => !excluded.has(ccKey(each)))
  const all = ccs.length > 0 && chosen.length === ccs.length

  // what a CC is and what sends it: its name, then the steps with an
  // envelope for it and the mod outputs sending it
  const describeCC = ({ cc, steps, mods }: SequenceCC) =>
    [
      CC_NAMES[cc] === undefined || CC_NAMES[cc] === "Undefined"
        ? null
        : CC_NAMES[cc],
      steps.length === 0
        ? null
        : `${steps.length} ${localized[steps.length === 1 ? "sequencer-export-step" : "sequencer-export-steps"]}`,
      ...mods.map(
        (source) =>
          `${localized["sequencer-export-mod"]} ${localized[`sequencer-mod-${source}`]}`,
      ),
    ]
      .filter((part) => part !== null)
      .join(" · ")

  return (
    <div className="flex flex-col gap-4 text-body text-fg-secondary">
      <Section label={<Localized name="sequencer-export-voices" />}>
        {VOICES.map((index) => {
          const voice = patch.voices[index]
          return (
            <div
              key={index}
              className="[&_svg]:text-[var(--midiseq-voice)]"
              style={
                {
                  "--midiseq-voice": `var(--midiseq-voice-${index})`,
                } as CSSProperties
              }
            >
              <Checkbox
                label={`${localized["sequencer-voice"]} ${index + 1}`}
                checked={voice.enabled && settings.voices[index]}
                disabled={!voice.enabled}
                note={
                  voice.enabled
                    ? `${localized["sequencer-step-cc-channel-short"]} ${voice.channel} · ${gmProgramName(voice.program)}`
                    : localized["sequencer-export-voice-off"]
                }
                onChange={(on) => settings.setVoice(index, on)}
              />
            </div>
          )
        })}
      </Section>

      <Section
        label={<Localized name="sequencer-export-ccs" />}
        aside={
          ccs.length > 0 && (
            <Checkbox
              label={localized["sequencer-export-all-ccs"]}
              checked={all}
              mixed={!all && chosen.length > 0}
              onChange={() => settings.setCCs(ccs, !all)}
            />
          )
        }
      >
        {ccs.length === 0 ? (
          <p className="m-0 py-[0.3rem] text-small text-fg-tertiary">
            <Localized name="sequencer-export-no-ccs" />
          </p>
        ) : (
          <fieldset
            aria-label={localized["sequencer-export-ccs"]}
            className="m-0 flex max-h-44 min-w-0 flex-col overflow-y-auto border-0 p-0"
          >
            {ccs.map((each) => (
              <Checkbox
                key={ccKey(each)}
                label={`CC ${each.cc} · ${localized["sequencer-step-cc-channel-short"]} ${each.channel}`}
                checked={!excluded.has(ccKey(each))}
                note={describeCC(each)}
                onChange={(on) => settings.setCC(each, on)}
              />
            ))}
          </fieldset>
        )}
      </Section>

      <Section label={<Localized name="sequencer-export-tracks" />}>
        <div className="flex gap-1">
          {LAYOUTS.map((each) => (
            <Button
              key={each}
              type="button"
              size="sm"
              active={settings.layout === each}
              aria-pressed={settings.layout === each}
              onClick={() => settings.setLayout(each)}
            >
              <Localized name={`sequencer-export-layout-${each}`} />
            </Button>
          ))}
        </div>
      </Section>

      {passes && (
        <div className="flex items-center gap-3">
          <span className="w-16 text-small">
            <Localized name="sequencer-export-passes" />
          </span>
          <div className="w-28">
            <Stepper
              label={localized["sequencer-export-passes"]}
              value={settings.passes}
              min={1}
              max={MAX_EXPORT_PASSES}
              onChange={settings.setPasses}
            />
          </div>
          {after}
        </div>
      )}
    </div>
  )
}
