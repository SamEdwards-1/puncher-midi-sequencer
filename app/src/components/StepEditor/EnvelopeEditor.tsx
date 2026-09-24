import { CC_NAMES, nextEnvelopeId, nextFreeCC } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import CursorDefaultOutlineIcon from "mdi-react/CursorDefaultOutlineIcon"
import PencilIcon from "mdi-react/PencilIcon"
import PlusIcon from "mdi-react/PlusIcon"
import { FC, ReactNode } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import {
  useEnvelopeGrid,
  useEnvelopeTool,
  useSelectedEnvelope,
} from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { cn } from "../ui/cn"
import { PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { EnvelopeGraph, GRIDS } from "./EnvelopeGraph"

const Labelled: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-w-0 flex-1 flex-col gap-1">
    <span className="text-tiny text-fg-tertiary">{label}</span>
    {children}
  </div>
)

// Every field is typed as well as stepped, like the tempo: digits are all
// that mean anything, and the stepper clamps whatever is typed to its range.
const parseNumber = (text: string) => {
  const number = Number.parseInt(text.replace(/[^0-9]/g, ""), 10)
  return Number.isFinite(number) ? number : null
}

// a new CC starts as a flat line at the middle, which sends one value
const NEW_ENVELOPE_VALUE = 64

/**
 * The step's CCs, each an envelope across the step. A tab per CC, a button
 * to add one, and the open CC's number and channel above its graph.
 */
export const EnvelopeEditor: FC<{ step: number }> = ({ step: stepIndex }) => {
  const patch = usePatch()
  const step = patch.steps[stepIndex]
  const [selectedId, setSelectedId] = useSelectedEnvelope()
  const [tool, setTool] = useEnvelopeTool()
  const [grid, setGrid] = useEnvelopeGrid()
  const { addEnvelope, editEnvelope, removeEnvelope } = usePatchEditor()
  const localized = useLocalization()

  // the tab left open, or the step's first CC when that one isn't here
  const envelope =
    step.envelopes.find(({ id }) => id === selectedId) ??
    step.envelopes[0] ??
    null

  const add = () => {
    setSelectedId(nextEnvelopeId(patch))
    addEnvelope(stepIndex, {
      cc: nextFreeCC(step),
      channel: 1,
      points: [{ time: 0, value: NEW_ENVELOPE_VALUE }],
    })
  }

  return (
    <>
      <PanelHeader as="div" className="flex items-center gap-2">
        <span className="grow">
          <Localized name="sequencer-step-ccs" />
        </span>
      </PanelHeader>

      <div className="flex flex-wrap items-end gap-1 border-b border-divider">
        <div
          role="tablist"
          aria-label={localized["sequencer-step-ccs"]}
          className="flex flex-wrap items-end gap-1"
        >
          {step.envelopes.map((each) => {
            const open = each.id === envelope?.id
            return (
              <button
                key={each.id}
                type="button"
                role="tab"
                aria-selected={open}
                className={cn(
                  "h-7 border-b-[0.15rem] px-2 text-small",
                  open
                    ? "border-envelope text-fg"
                    : "border-transparent text-fg-secondary hover:text-fg",
                )}
                onClick={() => setSelectedId(each.id)}
              >
                {localized["sequencer-step-cc"]} {each.cc}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-label={localized["sequencer-step-add-cc"]}
          title={localized["sequencer-step-add-cc"]}
          className="mb-1 flex h-6 w-6 items-center justify-center rounded-sm text-fg-secondary hover:bg-highlight hover:text-fg"
          onClick={add}
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {envelope === null ? (
        <div className="text-fg-tertiary">
          <Localized name="sequencer-step-no-ccs" />
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Labelled label={localized["sequencer-step-cc"]}>
            <Stepper
              label={localized["sequencer-envelope-cc-number"]}
              value={envelope.cc}
              min={0}
              max={127}
              parse={parseNumber}
              onChange={(cc) => editEnvelope(stepIndex, envelope.id, { cc })}
            />
          </Labelled>
          <div
            className="min-w-0 flex-[2] truncate pb-[0.35rem] text-small text-fg-secondary"
            title={CC_NAMES[envelope.cc]}
          >
            {CC_NAMES[envelope.cc]}
          </div>
          <Labelled label={localized["sequencer-midi-channel"]}>
            <Stepper
              label={localized["sequencer-envelope-cc-channel"]}
              value={envelope.channel}
              min={1}
              max={16}
              parse={parseNumber}
              onChange={(channel) =>
                editEnvelope(stepIndex, envelope.id, { channel })
              }
            />
          </Labelled>
          <Button
            type="button"
            size="sm"
            aria-label={localized["sequencer-step-remove-cc"]}
            title={localized["sequencer-step-remove-cc"]}
            onClick={() => removeEnvelope(stepIndex, envelope.id)}
          >
            <CloseIcon size={14} />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          active={tool === "edit"}
          aria-pressed={tool === "edit"}
          title={localized["sequencer-envelope-edit"]}
          onClick={() => setTool("edit")}
        >
          <CursorDefaultOutlineIcon size={14} />
          <Localized name="sequencer-envelope-edit" />
        </Button>
        <Button
          type="button"
          size="sm"
          active={tool === "draw"}
          aria-pressed={tool === "draw"}
          title={`${localized["sequencer-envelope-draw"]} (B)`}
          onClick={() => setTool("draw")}
        >
          <PencilIcon size={14} />
          <Localized name="sequencer-envelope-draw" />
        </Button>
        <div className="grow" />
        <label className="text-small" htmlFor="envelope-grid">
          <Localized name="sequencer-envelope-grid" />
        </label>
        <Select
          id="envelope-grid"
          value={String(grid)}
          onChange={(event) => setGrid(Number(event.target.value))}
        >
          {GRIDS.map(({ beats, label }) => (
            <option key={label} value={String(beats)}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <EnvelopeGraph step={stepIndex} envelope={envelope} />

      <div className="text-tiny text-fg-tertiary">
        <Localized
          name={
            tool === "draw"
              ? "sequencer-envelope-draw-hint"
              : "sequencer-envelope-edit-hint"
          }
        />
      </div>
    </>
  )
}
