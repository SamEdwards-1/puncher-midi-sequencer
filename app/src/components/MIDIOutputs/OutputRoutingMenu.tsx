import styled from "@emotion/styled"
import { VoiceIndex } from "@midiseq/core"
import { FC, useState } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { OutputSlot } from "../../stores/MIDIDeviceStore"
import { Button } from "../ui/Button"

const Wrapper = styled.div`
  position: relative;
`

const Popup = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 0.25rem);
  z-index: 10;
  width: 20rem;
  padding: 0.75rem;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-popup-border);
  border-radius: 0.5rem;
  box-shadow: 0 1rem 3rem var(--color-shadow);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const SectionTitle = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin-top: 0.25rem;

  &:not(:first-of-type) {
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-divider);
  }
`

const Row = styled.label`
  display: grid;
  grid-template-columns: 5rem 1fr;
  align-items: center;
  font-size: 0.8rem;
`

const Select = styled.select`
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--color-divider);
  border-radius: 0.25rem;
  background: var(--color-background);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
`

const Message = styled.div`
  font-size: 0.8rem;
  color: var(--color-text-secondary);
`

const VOICES: VoiceIndex[] = [0, 1, 2, 3]
const CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1)

export const OutputRoutingMenu: FC = () => {
  const [open, setOpen] = useState(false)
  const localized = useLocalization()
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

  const body = () => {
    if (!isSupported) {
      return (
        <Message>
          <Localized name="sequencer-midi-unsupported" />
        </Message>
      )
    }

    // the browser shows its permission prompt at startup; if it refused,
    // asking again has to come from a click
    if (!hasAccess) {
      const blocked = permission === "denied" || requestError !== null
      return (
        <>
          {requestError !== null && (
            <Message>
              <Localized name="sequencer-midi-error" /> {requestError.message}
            </Message>
          )}
          <Message>
            {blocked ? (
              <Localized name="sequencer-midi-permission-hint" />
            ) : (
              <Localized name="sequencer-midi-enable-hint" />
            )}
          </Message>
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

    return (
      <>
        <SectionTitle>
          <Localized name="sequencer-midi-input-section" />
        </SectionTitle>
        {connectedInputNames.length === 0 && (
          <Message>
            <Localized name="sequencer-midi-no-inputs" />
          </Message>
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

        <SectionTitle>
          <Localized name="sequencer-midi-outputs-section" />
        </SectionTitle>
        {connectedOutputNames.length === 0 && (
          <Message>
            <Localized name="sequencer-midi-no-outputs" />
          </Message>
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
    <Wrapper>
      <Button
        type="button"
        aria-expanded={open}
        data-active={open}
        onClick={() => setOpen(!open)}
      >
        <Localized name="sequencer-midi-outputs" />
      </Button>
      {open && (
        <Popup role="dialog" aria-label={localized["sequencer-midi-outputs"]}>
          {body()}
        </Popup>
      )}
    </Wrapper>
  )
}
