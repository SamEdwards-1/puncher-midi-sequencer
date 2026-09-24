import { noteNumberToName, StepState } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import PlusIcon from "mdi-react/PlusIcon"
import { FC, HTMLAttributes } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useCopiedStep, useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { cn } from "../ui/cn"
import { parseNoteText, sanitizeNoteText } from "../ui/noteInput"
import { PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { EnvelopeEditor } from "./EnvelopeEditor"

const HEADER = "flex items-center gap-2"
const TITLE = "grow"

const Row: FC<HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex items-center gap-2", className)} {...props} />
)

const STATES: StepState[] = ["normal", "rest", "skip"]

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
    clearStepContent,
    paste,
    trimToLimit,
  } = usePatchEditor()

  const step = patch.steps[selected]
  const beyondLimit = step.notes.length > patch.maxNotesPerStep

  return (
    <>
      <PanelHeader className={HEADER}>
        <span className={TITLE}>
          <Localized name="sequencer-step-editor" /> {selected + 1}
        </span>
        <Button type="button" size="sm" onClick={() => setCopiedStep(step)}>
          <Localized name="sequencer-step-copy" />
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={copiedStep === null}
          onClick={() => copiedStep !== null && paste(selected, copiedStep)}
        >
          <Localized name="sequencer-step-paste" />
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => clearStepContent(selected)}
        >
          <Localized name="sequencer-step-clear" />
        </Button>
      </PanelHeader>

      <div className="flex flex-col gap-2 px-4 pt-2 pb-4 text-body text-fg-secondary">
        <Row>
          <label className="w-12" htmlFor="step-state">
            <Localized name="sequencer-step-state" />
          </label>
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
          <div className="grow" />
          {[-12, -1, 1, 12].map((semitones) => (
            <Button
              key={semitones}
              type="button"
              size="sm"
              disabled={step.notes.length === 0}
              onClick={() => transpose(selected, semitones)}
            >
              {semitones > 0 ? `+${semitones}` : semitones}
            </Button>
          ))}
        </Row>

        {step.notes.length === 0 && (
          <div className="text-fg-tertiary">
            <Localized name="sequencer-step-no-notes" />
          </div>
        )}

        {step.notes.map((note, position) => {
          const beyond = position >= patch.maxNotesPerStep
          return (
            <Row
              key={note}
              className={cn(beyond && "opacity-45")}
              data-beyond={beyond}
            >
              <div className="grow">
                <Stepper
                  label={`${localized["sequencer-step-note"]} ${position + 1}`}
                  value={note}
                  min={0}
                  max={127}
                  format={noteNumberToName}
                  parse={(text) => parseNoteText(text, note)}
                  sanitize={sanitizeNoteText}
                  onChange={(next) => editNote(selected, position, next)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                aria-label={`${localized["sequencer-step-remove-note"]} ${position + 1}`}
                onClick={() => removeNote(selected, position)}
              >
                <CloseIcon size={14} />
              </Button>
            </Row>
          )
        })}

        {beyondLimit && (
          <Row>
            <div className="text-yellow">
              <Localized name="sequencer-step-over-limit" />
            </div>
            <div className="grow" />
            <Button type="button" size="sm" onClick={trimToLimit}>
              <Localized name="sequencer-step-trim" />
            </Button>
          </Row>
        )}

        <Row>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              addNote(selected, step.notes[step.notes.length - 1] ?? 60)
            }
          >
            <PlusIcon size={14} />
            <Localized name="sequencer-step-add-note" />
          </Button>
        </Row>

        <EnvelopeEditor step={selected} />
      </div>
    </>
  )
}
