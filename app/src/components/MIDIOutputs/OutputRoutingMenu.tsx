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

export const OutputRoutingMenu: FC = () => {
  const [open, setOpen] = useState(false)
  const localized = useLocalization()
  const {
    isSupported,
    requestError,
    outputNames,
    connectedOutputNames,
    setOutputName,
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

  const body = () => {
    if (!isSupported) {
      return (
        <Message>
          <Localized name="sequencer-midi-unsupported" />
        </Message>
      )
    }
    if (requestError !== null) {
      return (
        <>
          <Message>
            <Localized name="sequencer-midi-error" /> {requestError.message}
          </Message>
          <Message>
            <Localized name="sequencer-midi-permission-hint" />
          </Message>
          <Button type="button" onClick={requestMIDIAccess}>
            <Localized name="sequencer-midi-retry" />
          </Button>
        </>
      )
    }
    return (
      <>
        {connectedOutputNames.length === 0 && (
          <Message>
            <Localized name="sequencer-midi-no-outputs" />
          </Message>
        )}
        {slots.map(({ slot, label, name }) => {
          // keep a remembered but unplugged port visible in the list
          const missing = name !== null && !connectedOutputNames.includes(name)
          return (
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
                {connectedOutputNames.map((output) => (
                  <option key={output} value={output}>
                    {output}
                  </option>
                ))}
                {missing && (
                  <option value={name}>
                    {name} ({localized["sequencer-output-disconnected"]})
                  </option>
                )}
              </Select>
            </Row>
          )
        })}
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
