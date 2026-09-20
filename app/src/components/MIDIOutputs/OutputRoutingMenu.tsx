import { VoiceIndex } from "@midiseq/core"
import { FC, ReactNode, useState } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { OutputSlot } from "../../stores/MIDIDeviceStore"
import { Button, ToolbarButton } from "../ui/Button"
import { cn } from "../ui/cn"
import { Select } from "../ui/Select"

const MESSAGE = "text-body text-fg-secondary"

const SectionTitle: FC<{ divided?: boolean; children: ReactNode }> = ({
  divided = false,
  children,
}) => (
  <div
    className={cn(
      "mt-1 text-small font-semibold text-fg",
      divided && "border-t border-divider pt-2",
    )}
  >
    {children}
  </div>
)

const Row: FC<{ children: ReactNode }> = ({ children }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: every row is given a select
  <label className="grid grid-cols-[5rem_1fr] items-center text-body">
    {children}
  </label>
)

const VOICES: VoiceIndex[] = [0, 1, 2, 3]
const CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1)

export const OutputRoutingMenu: FC = () => {
  const [open, setOpen] = useState(false)
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
    setOutputName,
    inputName,
    receiveChannel,
    connectedInputNames,
    setInputName,
    setReceiveChannel,
    requestMIDIAccess,
  } = useMIDIDevice()

  const slots: { slot: OutputSlot; label: string; name: string | null }[] = [
    {
      slot: "all",
      label: localized["sequencer-output-all"],
      name: outputNames.all,
    },
    ...VOICES.map((voice) => ({
      slot: voice,
      label: `${localized["sequencer-output-voice"]} ${voice + 1}`,
      name: outputNames.voices[voice],
    })),
  ]

  // a remembered port that isn't plugged in stays visible in its list
  const withMissing = (names: string[], selected: string | null) =>
    selected !== null && !names.includes(selected)
      ? [...names, selected]
      : names

  const portOptions = (names: string[], selected: string | null) =>
    withMissing(names, selected).map((name) => (
      <option key={name} value={name}>
        {names.includes(name)
          ? name
          : `${name} (${localized["sequencer-output-disconnected"]})`}
      </option>
    ))

  /**
   * Shown when MIDI isn't available yet. The routing below stays visible
   * regardless, since the built-in sound plays without any MIDI at all.
   */
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
      <>
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
      </>
    )
  }

  const body = () => {
    return (
      <>
        {access()}
        <SectionTitle>
          <Localized name="sequencer-midi-input-section" />
        </SectionTitle>
        {connectedInputNames.length === 0 && (
          <div className={MESSAGE}>
            <Localized name="sequencer-midi-no-inputs" />
          </div>
        )}
        <Row>
          {localized["sequencer-midi-input"]}
          <Select
            value={inputName ?? ""}
            onChange={(event) =>
              setInputName(
                event.target.value === "" ? null : event.target.value,
              )
            }
          >
            <option value="">{localized["sequencer-output-none"]}</option>
            {portOptions(connectedInputNames, inputName)}
          </Select>
        </Row>
        <Row>
          {localized["sequencer-midi-channel"]}
          <Select
            value={receiveChannel === "omni" ? "omni" : String(receiveChannel)}
            onChange={(event) =>
              setReceiveChannel(
                event.target.value === "omni"
                  ? "omni"
                  : Number(event.target.value),
              )
            }
          >
            <option value="omni">{localized["sequencer-midi-omni"]}</option>
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </Select>
        </Row>

        <SectionTitle divided>
          <Localized name="sequencer-midi-outputs-section" />
        </SectionTitle>
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
        {connectedOutputNames.length === 0 && (
          <div className={MESSAGE}>
            <Localized name="sequencer-midi-no-outputs" />
          </div>
        )}
        {slots.map(({ slot, label, name }) => (
          <Row key={String(slot)}>
            {label}
            <Select
              value={name ?? ""}
              onChange={(event) =>
                setOutputName(
                  slot,
                  event.target.value === "" ? null : event.target.value,
                )
              }
            >
              <option value="">{localized["sequencer-output-none"]}</option>
              {portOptions(connectedOutputNames, name)}
            </Select>
          </Row>
        ))}
      </>
    )
  }

  return (
    <div className="relative flex items-center">
      <ToolbarButton
        type="button"
        aria-expanded={open}
        active={open}
        onClick={() => setOpen(!open)}
      >
        <Localized name="sequencer-midi-outputs" />
      </ToolbarButton>
      {open && (
        <div
          role="dialog"
          aria-label={localized["sequencer-midi-outputs"]}
          className="absolute top-[calc(100%+0.25rem)] right-0 z-10 flex w-80 flex-col gap-2 rounded-lg border border-popup-border bg-background-secondary p-3 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
        >
          {body()}
        </div>
      )}
    </div>
  )
}
