import {
  CC_NAMES,
  nextEnvelopeId,
  nextFreeCC,
  PatchJSON,
  VoiceIndex,
} from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import CursorDefaultOutlineIcon from "mdi-react/CursorDefaultOutlineIcon"
import PencilIcon from "mdi-react/PencilIcon"
import PlusIcon from "mdi-react/PlusIcon"
import { FC, ReactNode } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { usePatch } from "../../hooks/usePatch"
import {
  EnvelopeLane,
  useEnvelopeChannel,
  useEnvelopeGrid,
  useEnvelopeTool,
  useSelectedLane,
} from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { cn } from "../ui/cn"
import { PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { EnvelopeGraph, GRIDS } from "./EnvelopeGraph"

const CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1)

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

const voicesOn = (patch: PatchJSON, channel: number): VoiceIndex[] =>
  patch.voices.flatMap((voice, index) =>
    voice.channel === channel ? [index as VoiceIndex] : [],
  )

const TAB = "h-7 border-b-[0.15rem] px-2 text-small"

/**
 * The step's velocity and CCs, a channel at a time, as Signal shows a
 * track's: every channel a voice plays on has a Velocity lane — the notes'
 * velocities, a bar each — and any channel can hold CC envelopes across the
 * step. A CC keeps its channel when a voice moves to another.
 */
export const EnvelopeEditor: FC<{ step: number }> = ({ step: stepIndex }) => {
  const patch = usePatch()
  const step = patch.steps[stepIndex]
  const [channel, setChannel] = useEnvelopeChannel()
  const [selected, setSelected] = useSelectedLane()
  const [tool, setTool] = useEnvelopeTool()
  const [grid, setGrid] = useEnvelopeGrid()
  const { accentAmount } = useAccentAmount()
  const { addEnvelope, editEnvelope, removeEnvelope } = usePatchEditor()
  const localized = useLocalization()

  const voices = voicesOn(patch, channel)
  const envelopes = step.envelopes.filter(
    (envelope) => envelope.channel === channel,
  )
  const lanes: EnvelopeLane[] = [
    ...(voices.length > 0 ? (["velocity"] as const) : []),
    ...envelopes.map(({ id }) => id),
  ]
  // the lane left open, or the channel's first when that one isn't here
  const lane =
    selected !== null && lanes.includes(selected)
      ? selected
      : (lanes[0] ?? null)
  const envelope =
    typeof lane === "number"
      ? (envelopes.find(({ id }) => id === lane) ?? null)
      : null

  const channelLabel = (number: number) => {
    const on = voicesOn(patch, number).map((voice) => voice + 1)
    const ccs = step.envelopes.filter((each) => each.channel === number).length
    return [
      `${number}`,
      on.length === 0
        ? null
        : `${localized[on.length === 1 ? "sequencer-voice" : "sequencer-voices"]} ${on.join(", ")}`,
      ccs === 0 ? null : `${ccs} ${localized["sequencer-step-cc"]}`,
    ]
      .filter((part) => part !== null)
      .join(" · ")
  }

  const add = () => {
    setSelected(nextEnvelopeId(patch))
    addEnvelope(stepIndex, {
      cc: nextFreeCC(step, channel),
      channel,
      points: [{ time: 0, value: NEW_ENVELOPE_VALUE }],
    })
  }

  return (
    <>
      <PanelHeader as="div" className="flex items-center gap-2">
        <span className="grow">
          <Localized name="sequencer-step-ccs" />
        </span>
        <label className="text-small font-normal" htmlFor="envelope-channel">
          <Localized name="sequencer-midi-channel" />
        </label>
        <Select
          id="envelope-channel"
          value={String(channel)}
          onChange={(event) => setChannel(Number(event.target.value))}
        >
          {CHANNELS.map((number) => (
            <option key={number} value={String(number)}>
              {channelLabel(number)}
            </option>
          ))}
        </Select>
      </PanelHeader>

      <div className="flex flex-wrap items-end gap-1 border-b border-divider">
        <div
          role="tablist"
          aria-label={localized["sequencer-step-ccs"]}
          className="flex flex-wrap items-end gap-1"
        >
          {voices.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={lane === "velocity"}
              className={cn(
                TAB,
                lane === "velocity"
                  ? "border-envelope text-fg"
                  : "border-transparent text-fg-secondary hover:text-fg",
              )}
              onClick={() => setSelected("velocity")}
            >
              <Localized name="sequencer-voice-velocity" />
            </button>
          )}
          {envelopes.map((each) => {
            const open = each.id === lane
            return (
              <button
                key={each.id}
                type="button"
                role="tab"
                aria-selected={open}
                className={cn(
                  TAB,
                  open
                    ? "border-envelope text-fg"
                    : "border-transparent text-fg-secondary hover:text-fg",
                )}
                onClick={() => setSelected(each.id)}
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

      {lane === null && (
        <div className="text-fg-tertiary">
          <Localized name="sequencer-step-no-ccs" />
        </div>
      )}

      {lane === "velocity" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-secondary">
          {voices.map((voice) => (
            <span key={voice} className="flex items-center gap-[0.35rem]">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: `var(--midiseq-voice-${voice})` }}
              />
              {localized["sequencer-voice"]} {voice + 1}:{" "}
              {patch.voices[voice].velocity}, ±{accentAmount}
              {!patch.voices[voice].enabled && (
                <span className="text-fg-tertiary">
                  {" "}
                  (<Localized name="sequencer-velocity-voice-off" />)
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {envelope !== null && (
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

      {envelope !== null && (
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
      )}

      <EnvelopeGraph
        step={stepIndex}
        lane={
          lane === "velocity"
            ? { kind: "velocity", voices }
            : { kind: "cc", envelope }
        }
      />

      <div className="text-tiny text-fg-tertiary">
        <Localized
          name={
            lane === "velocity"
              ? "sequencer-velocity-hint"
              : tool === "draw"
                ? "sequencer-envelope-draw-hint"
                : "sequencer-envelope-edit-hint"
          }
        />
      </div>
    </>
  )
}
