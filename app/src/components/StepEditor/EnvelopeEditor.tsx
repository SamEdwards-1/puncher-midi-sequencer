import { CC_NAMES, nextFreeCC, VoiceIndex } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import CursorDefaultOutlineIcon from "mdi-react/CursorDefaultOutlineIcon"
import PencilIcon from "mdi-react/PencilIcon"
import { CSSProperties, FC, ReactNode, useEffect, useRef } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePatch } from "../../hooks/usePatch"
import {
  EnvelopeLane,
  useEnvelopeGrid,
  useEnvelopeTool,
  useSelectedLane,
  useSelectedVoice,
} from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button, IconButton } from "../ui/Button"
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
    : b.kind === "cc" && a.cc === b.cc && a.channel === b.channel

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
  const { recorder } = useStores()
  const recorded = useMobxGetter(recorder, "recordedLane")

  // A knob recorded into this step opens its tab, so its values are seen
  // arriving. Once per knob, and only when a knob moves: a tab clicked away
  // from stays away, and clicking a step never opens one.
  const handled = useRef(recorded)
  useEffect(() => {
    if (recorded === handled.current) {
      return
    }
    handled.current = recorded
    if (recorded !== null && recorded.step === stepIndex) {
      const { cc, channel } = recorded
      setSelected({ kind: "cc", cc, channel })
    }
  }, [recorded, stepIndex, setSelected])

  // The lane left open stays open from step to step. A CC the step has no
  // envelope for is shown empty, ready to be drawn into, rather than
  // swapped for another tab.
  const lane: EnvelopeLane = selected ?? {
    kind: "velocity",
    voice: selectedVoice,
  }
  const envelope =
    lane.kind === "cc"
      ? (step.envelopes.find(
          ({ cc, channel }) => cc === lane.cc && channel === lane.channel,
        ) ?? null)
      : null
  const laneChannel =
    lane.kind === "velocity" ? patch.voices[lane.voice].channel : lane.channel

  // a new CC goes out on the channel of the lane it is added from
  const add = () => {
    const cc = nextFreeCC(step, laneChannel)
    setSelected({ kind: "cc", cc, channel: laneChannel })
    addEnvelope(stepIndex, {
      cc,
      channel: laneChannel,
      points: [{ time: 0, value: NEW_ENVELOPE_VALUE }],
    })
  }

  // The number or channel of the open CC: the envelope's, if the step has
  // one, and either way the tab follows it.
  const setLane = (cc: number, channel: number) => {
    if (envelope !== null) {
      editEnvelope(stepIndex, envelope.id, { cc, channel })
    }
    setSelected({ kind: "cc", cc, channel })
  }

  const channelLabel = localized["sequencer-midi-channel"]

  // the same CC can be on several channels, so those tabs say which
  const ccLabel = (cc: number, channel: number) =>
    step.envelopes.filter((each) => each.cc === cc).length > 1
      ? `${localized["sequencer-step-cc"]} ${cc} · ${localized["sequencer-step-cc-channel-short"]} ${channel}`
      : `${localized["sequencer-step-cc"]} ${cc}`

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
      label: ccLabel(each.cc, each.channel),
      lane: { kind: "cc", cc: each.cc, channel: each.channel } as const,
    })),
    // the CC left open, which this step has no envelope for: dimmed
    ...(lane.kind === "cc" && envelope === null
      ? [
          {
            key: `cc-${lane.cc}-${lane.channel}-empty`,
            label: ccLabel(lane.cc, lane.channel),
            lane,
            off: true,
          },
        ]
      : []),
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
          {/* a note's velocity goes out with the note, on its voice's
              channel, so the lane has no channel of its own: just the
              voice's velocity, shared with the Voices panel */}
          <div className="w-40 flex-none">
            <Labelled label={localized["sequencer-voice-velocity"]}>
              <Stepper
                label={`${localized["sequencer-voice"]} ${lane.voice + 1} ${localized["sequencer-voice-velocity"].toLowerCase()}`}
                value={patch.voices[lane.voice].velocity}
                min={1}
                max={127}
                parse={parseNumber}
                onChange={(velocity) =>
                  editVoice(lane.voice, { velocity }, `velocity-${lane.voice}`)
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
            {localized["sequencer-voice"]} {lane.voice + 1} ·{" "}
            {localized["sequencer-dot-accent"]} ±{accentAmount}
            {!patch.voices[lane.voice].enabled && (
              <span className="text-fg-tertiary">
                (<Localized name="sequencer-velocity-voice-off" />)
              </span>
            )}
          </div>
        </div>
      )}

      {lane.kind === "cc" && (
        <div className="flex items-end gap-2">
          <Labelled label={localized["sequencer-step-cc"]}>
            <Stepper
              label={localized["sequencer-envelope-cc-number"]}
              value={lane.cc}
              min={0}
              max={127}
              parse={parseNumber}
              onChange={(cc) => setLane(cc, lane.channel)}
            />
          </Labelled>
          <div
            className="min-w-0 flex-1 truncate pb-[0.35rem] text-small text-fg-secondary"
            title={CC_NAMES[lane.cc]}
          >
            {CC_NAMES[lane.cc]}
            {envelope === null && (
              <span className="text-fg-tertiary">
                {" "}
                (<Localized name="sequencer-envelope-not-on-step" />)
              </span>
            )}
          </div>
          <Labelled label={channelLabel}>
            <Stepper
              label={localized["sequencer-envelope-cc-channel"]}
              value={lane.channel}
              min={1}
              max={16}
              parse={parseNumber}
              onChange={(channel) => setLane(lane.cc, channel)}
            />
          </Labelled>
          {envelope !== null && (
            <IconButton
              aria-label={localized["sequencer-step-remove-cc"]}
              title={localized["sequencer-step-remove-cc"]}
              onClick={() => {
                removeEnvelope(stepIndex, envelope.id)
                setSelected({ kind: "velocity", voice: selectedVoice })
              }}
            >
              <CloseIcon size={16} />
            </IconButton>
          )}
        </div>
      )}

      {(lane.kind === "velocity" || lane.kind === "cc") && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            active={tool === "edit"}
            aria-pressed={tool === "edit"}
            // "Edit" alone is the menu in the bar
            aria-label={localized["sequencer-envelope-edit-tool"]}
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
            : { kind: "cc", envelope, cc: lane.cc, channel: lane.channel }
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
