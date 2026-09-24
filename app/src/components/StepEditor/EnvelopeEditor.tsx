import { CC_NAMES, nextEnvelopeId, nextFreeCC, VoiceIndex } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import CursorDefaultOutlineIcon from "mdi-react/CursorDefaultOutlineIcon"
import PencilIcon from "mdi-react/PencilIcon"
import { CSSProperties, FC, ReactNode } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { usePatch } from "../../hooks/usePatch"
import {
  EnvelopeLane,
  useEnvelopeGrid,
  useEnvelopeTool,
  useSelectedLane,
  useSelectedVoice,
} from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { EnvelopeGraph, GRIDS } from "./EnvelopeGraph"
import { LaneTab, LaneTabs } from "./LaneTabs"

const VOICES: VoiceIndex[] = [0, 1, 2, 3]

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

const voiceColor = (voice: VoiceIndex): CSSProperties =>
  ({ "--midiseq-voice": `var(--midiseq-voice-${voice})` }) as CSSProperties

const sameLane = (a: EnvelopeLane, b: EnvelopeLane) =>
  a.kind === "velocity"
    ? b.kind === "velocity" && a.voice === b.voice
    : b.kind === "cc" && a.id === b.id

/**
 * The step's velocities and CCs. Every voice has a Velocity tab — a line
 * through the velocities of the notes it plays, edited like an envelope —
 * and every CC on the step has a tab holding its envelope. The row above the graph sets the lane's
 * channel: the voice's own, shared with the Voices panel, or the CC's.
 */
export const EnvelopeEditor: FC<{ step: number }> = ({ step: stepIndex }) => {
  const patch = usePatch()
  const step = patch.steps[stepIndex]
  const [selected, setSelected] = useSelectedLane()
  const [selectedVoice] = useSelectedVoice()
  const [tool, setTool] = useEnvelopeTool()
  const [grid, setGrid] = useEnvelopeGrid()
  const { accentAmount } = useAccentAmount()
  const { addEnvelope, editEnvelope, removeEnvelope, editVoice } =
    usePatchEditor()
  const localized = useLocalization()

  // the lane left open while it is still here; otherwise the velocity of
  // the voice being worked on
  const lane: EnvelopeLane =
    selected !== null &&
    (selected.kind === "velocity" ||
      step.envelopes.some(({ id }) => id === selected.id))
      ? selected
      : { kind: "velocity", voice: selectedVoice }
  const envelope =
    lane.kind === "cc"
      ? (step.envelopes.find(({ id }) => id === lane.id) ?? null)
      : null
  const laneChannel =
    lane.kind === "velocity"
      ? patch.voices[lane.voice].channel
      : (envelope?.channel ?? 1)

  // a new CC goes out on the channel of the lane it is added from
  const add = () => {
    setSelected({ kind: "cc", id: nextEnvelopeId(patch) })
    addEnvelope(stepIndex, {
      cc: nextFreeCC(step, laneChannel),
      channel: laneChannel,
      points: [{ time: 0, value: NEW_ENVELOPE_VALUE }],
    })
  }

  const channelLabel = localized["sequencer-midi-channel"]

  // a Velocity tab for every voice, then the step's CCs
  const tabs: (LaneTab & { lane: EnvelopeLane })[] = [
    ...VOICES.map((voice) => ({
      key: `velocity-${voice}`,
      label: `${localized["sequencer-voice-velocity"]} ${voice + 1}`,
      lane: { kind: "velocity", voice } as const,
      voice,
      off: !patch.voices[voice].enabled,
    })),
    ...step.envelopes.map((each) => ({
      key: `cc-${each.id}`,
      label: `${localized["sequencer-step-cc"]} ${each.cc}`,
      lane: { kind: "cc", id: each.id } as const,
    })),
  ]

  return (
    <>
      {/* the page's gutter is the header's own, so its title lines up with the
          step editor's */}
      <PanelHeader as="div" className="-mx-4 flex items-center gap-2">
        <span className="grow">
          <Localized name="sequencer-step-ccs" />
        </span>
      </PanelHeader>

      <LaneTabs
        label={localized["sequencer-step-ccs"]}
        tabs={tabs.map(({ lane: _, ...tab }) => tab)}
        open={tabs.findIndex((tab) => sameLane(lane, tab.lane))}
        onSelect={(index) => setSelected(tabs[index].lane)}
        onAdd={add}
        addLabel={localized["sequencer-step-add-cc"]}
      />

      {lane.kind === "velocity" && (
        <div className="flex items-end gap-2">
          <div className="w-40 flex-none">
            <Labelled label={channelLabel}>
              <Stepper
                label={`${localized["sequencer-voice"]} ${lane.voice + 1} ${channelLabel.toLowerCase()}`}
                value={patch.voices[lane.voice].channel}
                min={1}
                max={16}
                parse={parseNumber}
                onChange={(channel) =>
                  editVoice(lane.voice, { channel }, `channel-${lane.voice}`)
                }
              />
            </Labelled>
          </div>
          <div
            className="flex min-w-0 flex-1 items-center gap-[0.35rem] truncate pb-[0.35rem] text-small text-fg-secondary"
            style={voiceColor(lane.voice)}
          >
            <span
              aria-hidden
              className="h-2 w-2 flex-none rounded-full bg-voice"
            />
            {localized["sequencer-voice"]} {lane.voice + 1}:{" "}
            {patch.voices[lane.voice].velocity}, ±{accentAmount}
            {!patch.voices[lane.voice].enabled && (
              <span className="text-fg-tertiary">
                (<Localized name="sequencer-velocity-voice-off" />)
              </span>
            )}
          </div>
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
            className="min-w-0 flex-1 truncate pb-[0.35rem] text-small text-fg-secondary"
            title={CC_NAMES[envelope.cc]}
          >
            {CC_NAMES[envelope.cc]}
          </div>
          <Labelled label={channelLabel}>
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

      {(lane.kind === "velocity" || envelope !== null) && (
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
          lane.kind === "velocity"
            ? { kind: "velocity", voice: lane.voice }
            : { kind: "cc", envelope }
        }
      />

      <div className="text-tiny text-fg-tertiary">
        <Localized
          name={
            lane.kind === "velocity"
              ? tool === "draw"
                ? "sequencer-velocity-draw-hint"
                : "sequencer-velocity-edit-hint"
              : tool === "draw"
                ? "sequencer-envelope-draw-hint"
                : "sequencer-envelope-edit-hint"
          }
        />
      </div>
    </>
  )
}
