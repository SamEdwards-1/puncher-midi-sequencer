import {
  inScale,
  modulatedVoice,
  noteNumberToName,
  rulePositions,
  StepState,
  VoiceIndex,
} from "@midiseq/core"
import AlertIcon from "mdi-react/AlertIcon"
import CloseIcon from "mdi-react/CloseIcon"
import PlusIcon from "mdi-react/PlusIcon"
import { comparer } from "mobx"
import { CSSProperties, FC, HTMLAttributes, memo, useState } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatchSelector } from "../../hooks/usePatch"
import { useCopiedStep, useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { scaleLabel } from "../../theory/scales"
import { ScaleKeys } from "../Scale/ScaleKeys"
import { Button, ButtonGroup, IconButton } from "../ui/Button"
import { cn } from "../ui/cn"
import { parseNoteText, sanitizeNoteText } from "../ui/noteInput"
import { GUTTER_RIGHT, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { EnvelopeEditor } from "./EnvelopeEditor"
import { Column } from "./graphHeight"
import { hasJump, JumpPatcher } from "./JumpPatcher"

const HEADER = "flex items-center gap-2"
const TITLE = "grow"

const Row: FC<HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex items-center gap-2", className)} {...props} />
)

const STATES: StepState[] = ["normal", "rest", "skip"]

const voiceColor = (voice: VoiceIndex): CSSProperties =>
  ({ "--midiseq-voice": `var(--midiseq-voice-${voice})` }) as CSSProperties

// a dot in each voice's colour, as the Voices panel's tabs have it, for the
// voices that can play a note
const VoiceDots: FC<{ voices: VoiceIndex[] }> = ({ voices }) => {
  const localized = useLocalization()
  return (
    <span
      role="img"
      aria-label={`${localized["sequencer-voices"]} ${voices.map((voice) => voice + 1).join(", ")}`}
      className="flex gap-[0.2rem]"
    >
      {voices.map((voice) => (
        <span
          key={voice}
          className="h-2 w-2 rounded-full bg-voice"
          style={voiceColor(voice)}
        />
      ))}
    </span>
  )
}

// `column` is the one the editor scrolls in, for the envelope editor to fill.
// It sits under the grid, apart from it: the grid draws again each time the
// sequence moves on.
export const StepEditor: FC<{ column?: Column }> = memo(({ column }) => {
  const [selected] = useSelectedStep()
  // the step and what it is held to, so edits elsewhere pass it by
  const { step, scale, maxNotesPerStep } = usePatchSelector(
    (patch) => ({
      step: patch.steps[selected],
      scale: patch.scale,
      maxNotesPerStep: patch.maxNotesPerStep,
    }),
    [selected],
    comparer.shallow,
  )
  // each voice's rule as the step lands, where its envelopes may set it;
  // null for a voice that is off
  const rules = usePatchSelector(
    (patch) =>
      patch.voices.map((voice, index) =>
        voice.enabled
          ? modulatedVoice(patch, index as VoiceIndex, selected, 0).rule
          : null,
      ),
    [selected],
    comparer.structural,
  )
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

  // the step whose "Jump rule" was just clicked, so its jump shows before
  // it is set to anything
  const [openedJump, setOpenedJump] = useState<number | null>(null)

  const jumpShown = hasJump(step.jump) || openedJump === selected
  const beyondLimit = step.notes.length > maxNotesPerStep
  // the notes the voices play, lowest first, as the engine reads them
  const played = [...step.notes].sort((a, b) => a - b).slice(0, maxNotesPerStep)
  // the voices whose rules can come to the note at `rank` among them
  const voicesAt = (rank: number) =>
    rules.flatMap((rule, voice) =>
      rule !== null &&
      rulePositions(rule, played.length, voice as VoiceIndex).includes(rank)
        ? [voice as VoiceIndex]
        : [],
    )

  return (
    <>
      <PanelHeader className={HEADER}>
        <span className={TITLE}>
          <Localized name="sequencer-step-editor" /> {selected + 1}
        </span>
        <Select
          compact
          aria-label={localized["sequencer-step-state"]}
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
        <ButtonGroup>
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
        </ButtonGroup>
      </PanelHeader>

      {/* no gutter at the bottom: the envelope editor, last, keeps its own */}
      <div
        className={cn(
          "flex flex-col gap-2 pl-4",
          GUTTER_RIGHT,
          "pt-2 text-body text-fg-secondary",
        )}
      >
        <Row>
          {/* the scale the patch is in */}
          {scale !== null && (
            <span className="text-small text-fg-tertiary" data-step-scale>
              {scaleLabel(scale)}
            </span>
          )}
          <div className="grow" />
          <ButtonGroup>
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
          </ButtonGroup>
        </Row>

        {/* the scale's keys beside the notes, those out of it marked */}
        <div className="flex items-start gap-3">
          {scale !== null && <ScaleKeys scale={scale} />}
          <div className="flex min-w-0 grow flex-col gap-2">
            {step.notes.length === 0 && (
              <div className="text-fg-tertiary">
                <Localized name="sequencer-step-no-notes" />
              </div>
            )}

            {step.notes.map((note, position) => {
              // past the limit, a note is among those too high to be played
              const rank = played.indexOf(note)
              const beyond = rank === -1
              const voices = beyond ? [] : voicesAt(rank)
              const outside = scale !== null && !inScale(scale, note)
              return (
                <Row
                  key={note}
                  className={cn(beyond && "opacity-45")}
                  data-beyond={beyond}
                  data-out-of-scale={outside}
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
                      invalid={outside}
                      marker={
                        voices.length > 0 ? (
                          <VoiceDots voices={voices} />
                        ) : undefined
                      }
                      onChange={(next) => editNote(selected, position, next)}
                    />
                  </div>
                  {/* kept for every note while there is a scale, so the
                      notes line up whether or not they are in it */}
                  {scale !== null && (
                    <span
                      className="flex w-4 flex-none justify-center text-error"
                      title={
                        outside
                          ? localized["sequencer-step-out-of-scale"]
                          : undefined
                      }
                    >
                      {outside && (
                        <AlertIcon
                          size={16}
                          role="img"
                          aria-label={localized["sequencer-step-out-of-scale"]}
                        />
                      )}
                    </span>
                  )}
                  <IconButton
                    aria-label={`${localized["sequencer-step-remove-note"]} ${position + 1}`}
                    title={localized["sequencer-step-remove-note"]}
                    onClick={() => removeNote(selected, position)}
                  >
                    <CloseIcon size={16} />
                  </IconButton>
                </Row>
              )
            })}
          </div>
        </div>

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
          {!jumpShown && (
            <Button
              type="button"
              size="sm"
              onClick={() => setOpenedJump(selected)}
            >
              <PlusIcon size={14} />
              <Localized name="sequencer-jump-add" />
            </Button>
          )}
        </Row>

        {jumpShown && <JumpPatcher onRemove={() => setOpenedJump(null)} />}

        <EnvelopeEditor step={selected} column={column} />
      </div>
    </>
  )
})
