import styled from "@emotion/styled"
import {
  CCEventJSON,
  noteNumberToName,
  OutputTarget,
  StepState,
  VoiceIndex,
} from "@midiseq/core"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useCopiedStep, useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 1rem 1rem;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
`

const Header = styled(PanelHeader)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const Title = styled.span`
  flex-grow: 1;
`

const SmallButton = styled(Button)`
  height: 1.7rem;
  padding: 0 0.6rem;
  font-size: 0.75rem;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const NoteRow = styled(Row)`
  &[data-beyond="true"] {
    opacity: 0.45;
  }
`

const RowLabel = styled.label`
  width: 3rem;
`

const Grow = styled.div`
  flex-grow: 1;
`

const Empty = styled.div`
  color: var(--color-text-tertiary);
`

const Warning = styled.div`
  color: var(--color-yellow);
`

const STATES: StepState[] = ["normal", "rest", "skip"]
const VOICES: VoiceIndex[] = [0, 1, 2, 3]
const CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1)

export const StepEditor: FC = () => {
  const patch = usePatch()
  const [selected] = useSelectedStep()
  const { copiedStep, setCopiedStep } = useCopiedStep()
  const localized = useLocalization()
  const {
    editStepState,
    addNote,
    editNote,
    removeNote,
    transpose,
    addCC,
    editCC,
    removeCC,
    clearStepContent,
    paste,
    trimToLimit,
  } = usePatchEditor()

  const step = patch.steps[selected]
  const beyondLimit = step.notes.length > patch.maxNotesPerStep

  return (
    <>
      <Header>
        <Title>
          <Localized name="sequencer-step-editor" /> {selected + 1}
        </Title>
        <SmallButton type="button" onClick={() => setCopiedStep(step)}>
          <Localized name="sequencer-step-copy" />
        </SmallButton>
        <SmallButton
          type="button"
          disabled={copiedStep === null}
          onClick={() => copiedStep !== null && paste(selected, copiedStep)}
        >
          <Localized name="sequencer-step-paste" />
        </SmallButton>
        <SmallButton type="button" onClick={() => clearStepContent(selected)}>
          <Localized name="sequencer-step-clear" />
        </SmallButton>
      </Header>

      <Body>
        <Row>
          <RowLabel htmlFor="step-state">
            <Localized name="sequencer-step-state" />
          </RowLabel>
          <Select
            id="step-state"
            value={step.state}
            onChange={(event) =>
              editStepState(selected, event.target.value as StepState)
            }
          >
            {STATES.map((state) => (
              <option key={state} value={state}>
                {localized[`sequencer-step-state-${state}`]}
              </option>
            ))}
          </Select>
          <Grow />
          {[-12, -1, 1, 12].map((semitones) => (
            <SmallButton
              key={semitones}
              type="button"
              disabled={step.notes.length === 0}
              onClick={() => transpose(selected, semitones)}
            >
              {semitones > 0 ? `+${semitones}` : semitones}
            </SmallButton>
          ))}
        </Row>

        {step.notes.length === 0 && (
          <Empty>
            <Localized name="sequencer-step-no-notes" />
          </Empty>
        )}

        {step.notes.map((note, position) => (
          <NoteRow key={note} data-beyond={position >= patch.maxNotesPerStep}>
            <Grow>
              <Stepper
                label={`${localized["sequencer-step-note"]} ${position + 1}`}
                value={note}
                min={0}
                max={127}
                format={noteNumberToName}
                onChange={(next) => editNote(selected, position, next)}
              />
            </Grow>
            <SmallButton
              type="button"
              aria-label={`${localized["sequencer-step-remove-note"]} ${position + 1}`}
              onClick={() => removeNote(selected, position)}
            >
              ×
            </SmallButton>
          </NoteRow>
        ))}

        {beyondLimit && (
          <Row>
            <Warning>
              <Localized name="sequencer-step-over-limit" />
            </Warning>
            <Grow />
            <SmallButton type="button" onClick={trimToLimit}>
              <Localized name="sequencer-step-trim" />
            </SmallButton>
          </Row>
        )}

        <Row>
          <SmallButton
            type="button"
            onClick={() =>
              addNote(selected, step.notes[step.notes.length - 1] ?? 60)
            }
          >
            <Localized name="sequencer-step-add-note" />
          </SmallButton>
        </Row>

        <Header as="div">
          <Title>
            <Localized name="sequencer-step-ccs" />
          </Title>
          <SmallButton
            type="button"
            onClick={() =>
              addCC(selected, {
                cc: 74,
                value: 64,
                channel: "voice",
                output: "all",
              })
            }
          >
            <Localized name="sequencer-step-add-cc" />
          </SmallButton>
        </Header>

        {step.ccs.length === 0 && (
          <Empty>
            <Localized name="sequencer-step-no-ccs" />
          </Empty>
        )}

        {step.ccs.map((cc) => (
          <CCRow
            key={cc.id}
            cc={cc}
            onChange={(changes) => editCC(selected, cc.id, changes)}
            onRemove={() => removeCC(selected, cc.id)}
          />
        ))}
      </Body>
    </>
  )
}

const CCRow: FC<{
  cc: CCEventJSON
  onChange: (changes: Partial<Omit<CCEventJSON, "id">>) => void
  onRemove: () => void
}> = ({ cc, onChange, onRemove }) => {
  const localized = useLocalization()

  return (
    <Row>
      <Stepper
        label={`${localized["sequencer-step-cc"]} ${cc.id}`}
        value={cc.cc}
        min={0}
        max={127}
        format={(value) => `CC ${value}`}
        onChange={(next) => onChange({ cc: next })}
      />
      <Stepper
        label={`${localized["sequencer-step-cc-value"]} ${cc.id}`}
        value={cc.value}
        min={0}
        max={127}
        onChange={(value) => onChange({ value })}
      />
      <Select
        aria-label={`${localized["sequencer-midi-channel"]} ${cc.id}`}
        value={cc.channel === "voice" ? "voice" : String(cc.channel)}
        onChange={(event) =>
          onChange({
            channel:
              event.target.value === "voice"
                ? "voice"
                : Number(event.target.value),
          })
        }
      >
        <option value="voice">{localized["sequencer-step-cc-voice"]}</option>
        {CHANNELS.map((channel) => (
          <option key={channel} value={channel}>
            {channel}
          </option>
        ))}
      </Select>
      <Select
        aria-label={`${localized["sequencer-step-cc-output"]} ${cc.id}`}
        value={cc.output === "all" ? "all" : String(cc.output)}
        onChange={(event) =>
          onChange({
            output:
              event.target.value === "all"
                ? "all"
                : (Number(event.target.value) as OutputTarget),
          })
        }
      >
        <option value="all">{localized["sequencer-output-all"]}</option>
        {VOICES.map((voice) => (
          <option key={voice} value={voice}>
            {`${localized["sequencer-output-voice"]} ${voice + 1}`}
          </option>
        ))}
      </Select>
      <SmallButton
        type="button"
        aria-label={`${localized["sequencer-step-remove-cc"]} ${cc.id}`}
        onClick={onRemove}
      >
        ×
      </SmallButton>
    </Row>
  )
}
