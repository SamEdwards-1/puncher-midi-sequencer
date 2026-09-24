import { VoiceIndex } from "@midiseq/core"
import { FC } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Checkbox } from "../ui/Checkbox"
import { Select } from "../ui/Select"
import { MIDIFilterSettings } from "./MIDIFilterSettings"

const MESSAGE = "py-1 text-body text-fg-secondary"
const VOICES: VoiceIndex[] = [0, 1, 2, 3]

const Section: FC<{ name: string; children: React.ReactNode }> = ({
  name,
  children,
}) => (
  <section className="flex flex-col gap-1 pt-4 first:pt-0">
    <h3 className="m-0 text-small font-semibold text-fg">{name}</h3>
    {children}
  </section>
)

export const MIDISettings: FC = () => {
  const localized = useLocalization()
  const { synthStore } = useStores()
  const synthState = useMobxGetter(synthStore, "state")
  const synthError = useMobxGetter(synthStore, "error")
  const {
    isSupported,
    hasAccess,
    permission,
    requestError,
    outputNames,
    connectedOutputNames,
    inputNames,
    connectedInputNames,
    toggleInput,
    toggleOutput,
    setVoiceOutput,
    requestMIDIAccess,
  } = useMIDIDevice()

  // a remembered port that isn't plugged in stays visible, so its tick can be
  // seen and taken off
  const withMissing = (connected: string[], chosen: string[]) => [
    ...connected,
    ...chosen.filter((name) => !connected.includes(name)),
  ]

  const label = (name: string, connected: string[]) =>
    connected.includes(name)
      ? name
      : `${name} (${localized["sequencer-output-disconnected"]})`

  /** Shown until the browser has handed MIDI over. */
  const access = () => {
    if (!isSupported) {
      return (
        <div className={MESSAGE}>
          <Localized name="sequencer-midi-unsupported" />
        </div>
      )
    }
    if (hasAccess) {
      return null
    }
    // the browser asks at startup; if it refused, asking again needs a click
    const blocked = permission === "denied" || requestError !== null
    return (
      <div className="flex flex-col items-start gap-2 pb-2">
        {requestError !== null && (
          <div className={MESSAGE}>
            <Localized name="sequencer-midi-error" /> {requestError.message}
          </div>
        )}
        <div className={MESSAGE}>
          {blocked ? (
            <Localized name="sequencer-midi-permission-hint" />
          ) : (
            <Localized name="sequencer-midi-enable-hint" />
          )}
        </div>
        <Button type="button" onClick={requestMIDIAccess}>
          {blocked ? (
            <Localized name="sequencer-midi-retry" />
          ) : (
            <Localized name="sequencer-midi-enable" />
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {access()}

      <Section name={localized["sequencer-midi-inputs-section"]}>
        {connectedInputNames.length === 0 && (
          <div className={MESSAGE}>
            <Localized name="sequencer-midi-no-inputs" />
          </div>
        )}
        {withMissing(connectedInputNames, inputNames).map((name) => (
          <Checkbox
            key={name}
            label={label(name, connectedInputNames)}
            checked={inputNames.includes(name)}
            onChange={(on) => toggleInput(name, on)}
          />
        ))}
      </Section>

      <Section name={localized["sequencer-midi-outputs-section"]}>
        {synthState === "loading" && (
          <div className={MESSAGE}>
            <Localized name="sequencer-synth-loading" />
          </div>
        )}
        {synthState === "error" && (
          <div className={MESSAGE}>
            <Localized name="sequencer-synth-error" /> {synthError}
          </div>
        )}
        {withMissing(connectedOutputNames, outputNames.all).map((name) => (
          <Checkbox
            key={name}
            label={label(name, connectedOutputNames)}
            checked={outputNames.all.includes(name)}
            onChange={(on) => toggleOutput(name, on)}
          />
        ))}
      </Section>

      <Section name={localized["sequencer-midi-voice-outputs"]}>
        <p className="m-0 pb-1 text-tiny text-fg-tertiary">
          <Localized name="sequencer-midi-voice-outputs-hint" />
        </p>
        {VOICES.map((voice) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the select is the row
          <label
            key={voice}
            className="grid grid-cols-[5rem_1fr] items-center py-[0.2rem] text-body text-fg-secondary"
          >
            {`${localized["sequencer-output-voice"]} ${voice + 1}`}
            <Select
              value={outputNames.voices[voice] ?? ""}
              onChange={(event) =>
                setVoiceOutput(
                  voice,
                  event.target.value === "" ? null : event.target.value,
                )
              }
            >
              <option value="">{localized["sequencer-output-none"]}</option>
              {withMissing(
                connectedOutputNames,
                outputNames.voices.filter(
                  (name): name is string => name !== null,
                ),
              ).map((name) => (
                <option key={name} value={name}>
                  {label(name, connectedOutputNames)}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </Section>

      <MIDIFilterSettings />
    </div>
  )
}
