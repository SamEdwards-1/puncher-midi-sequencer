import {
  CC_NAMES,
  envelopeShape,
  envelopeValues,
  modulationForCC,
  nextFreeCC,
  VoiceIndex,
} from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import CursorDefaultOutlineIcon from "mdi-react/CursorDefaultOutlineIcon"
import DotsVerticalIcon from "mdi-react/DotsVerticalIcon"
import EraserIcon from "mdi-react/EraserIcon"
import PencilIcon from "mdi-react/PencilIcon"
import SlopeUphillIcon from "mdi-react/SlopeUphillIcon"
import SquareWaveIcon from "mdi-react/SquareWaveIcon"
import { comparer } from "mobx"
import {
  CSSProperties,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePatchSelector } from "../../hooks/usePatch"
import {
  EnvelopeLane,
  useCopiedEnvelope,
  useEnvelopeGrid,
  useEnvelopeTool,
  useRevealEnvelope,
  useSelectedLane,
  useSelectedVoice,
} from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import {
  Localized,
  useFormat,
  useLocalization,
} from "../../localize/useLocalization"
import { modulationTabLabel, modulationTargetLabel } from "../Modulation/labels"
import { Button, ButtonGroup, IconButton } from "../ui/Button"
import { cn } from "../ui/cn"
import { ContextMenu, MenuDivider, MenuItem, Point } from "../ui/Menu"
import { BLEED_RIGHT, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { EnvelopeGraph, GRIDS } from "./EnvelopeGraph"
import { Column, useGraphHeight } from "./graphHeight"
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
 * The step's velocities and CCs. Every voice has a Velocity tab — a lollipop
 * for each note it plays, over the other voices' dimmed —
 * and every CC on the step has a tab holding its envelope. The row above the graph sets the lane's
 * channel: the voice's own, shared with the Voices panel, or the CC's.
 *
 * Last in the `column`, it keeps room below it to grow into: scrolled on
 * once it is all in view, its graph grows, keeping the editor's bottom at
 * the window's, until the step editor above it is under the grid.
 */
export const EnvelopeEditor: FC<{ step: number; column?: Column }> = ({
  step: stepIndex,
  column,
}) => {
  // the step, and of the rest only what its tabs and fields name: the
  // voices, and the modulations a CC may drive
  const { step, voices, modulations } = usePatchSelector(
    (patch) => ({
      step: patch.steps[stepIndex],
      voices: patch.voices,
      modulations: patch.modulations,
    }),
    [stepIndex],
    comparer.shallow,
  )
  const [selected, setSelected] = useSelectedLane()
  const [selectedVoice] = useSelectedVoice()
  const [tool, setTool] = useEnvelopeTool()
  const [grid, setGrid] = useEnvelopeGrid()
  const { accentAmount } = useAccentAmount()
  const {
    addEnvelope,
    editEnvelope,
    removeEnvelope,
    clearEnvelope,
    pasteEnvelope,
    editVoice,
  } = usePatchEditor()
  const [copiedEnvelope, setCopiedEnvelope] = useCopiedEnvelope()
  // where the CC's values menu is open, under its button
  const [valuesMenu, setValuesMenu] = useState<Point | null>(null)
  const localized = useLocalization()
  const format = useFormat()
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

  // A lane opened from elsewhere — a setting's modulation — is brought into
  // view, if it isn't already, once it is showing.
  const editor = useRef<HTMLDivElement>(null)
  const [reveal, setReveal] = useRevealEnvelope()
  useEffect(() => {
    if (reveal) {
      setReveal(false)
      editor.current?.scrollIntoView?.({ block: "nearest" })
    }
  }, [reveal, setReveal])
  const graphHeight = useGraphHeight(editor, column)

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
  // The eraser is for envelope points; a velocity lane, which has none, is
  // edited as usual until a CC is open again.
  const activeTool =
    lane.kind === "velocity" && tool === "erase" ? "edit" : tool
  const laneChannel =
    lane.kind === "velocity" ? voices[lane.voice].channel : lane.channel

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

  // A CC's tab is named for the setting it modulates, if it does. The same
  // CC can be on several channels, so those tabs say which.
  const ccLabel = (cc: number, channel: number) => {
    const modulation = modulationForCC({ modulations }, cc)
    const name =
      modulation === undefined
        ? `${localized["sequencer-step-cc"]} ${cc}`
        : modulationTabLabel(modulation.target, localized)
    return step.envelopes.filter((each) => each.cc === cc).length > 1
      ? `${name} · ${format("sequencer-channel-short", { channel })}`
      : name
  }
  const modulation =
    lane.kind === "cc" ? modulationForCC({ modulations }, lane.cc) : undefined
  // Removing the last envelope for a modulation's CC removes the
  // modulation too, so the button says so.
  const modulatedCC = modulation?.cc
  const envelopesOnCC = usePatchSelector(
    (patch) =>
      patch.steps
        .flatMap((each) => each.envelopes)
        .filter(({ cc }) => cc === modulatedCC).length,
    [modulatedCC],
  )
  const removes =
    modulation !== undefined && envelopesOnCC === 1
      ? format("sequencer-step-remove-cc-modulation", {
          target: modulationTargetLabel(modulation.target, localized),
        })
      : localized["sequencer-step-remove-cc"]

  // a CC modulating one of a voice's settings has the voice's dot, as the
  // voice's Velocity tab does
  const ccDot = (cc: number) => {
    const target = modulationForCC({ modulations }, cc)?.target
    return target !== undefined && "voice" in target ? target.voice : undefined
  }

  // a Velocity tab for every voice, then the step's CCs
  const tabs: (LaneTab & { lane: EnvelopeLane })[] = [
    ...VOICES.map((voice) => ({
      key: `velocity-${voice}`,
      label: `${localized["sequencer-voice-velocity"]} ${voice + 1}`,
      lane: { kind: "velocity", voice } as const,
      voice,
      dot: voice,
      off: !voices[voice].enabled,
    })),
    ...step.envelopes.map((each) => ({
      key: `cc-${each.id}`,
      label: ccLabel(each.cc, each.channel),
      dot: ccDot(each.cc),
      lane: { kind: "cc", cc: each.cc, channel: each.channel } as const,
    })),
    // the CC left open, which this step has no envelope for: dimmed
    ...(lane.kind === "cc" && envelope === null
      ? [
          {
            key: `cc-${lane.cc}-${lane.channel}-empty`,
            label: ccLabel(lane.cc, lane.channel),
            dot: ccDot(lane.cc),
            lane,
            off: true,
          },
        ]
      : []),
  ]

  return (
    // Room to grow into: as tall as the column's view, so the column scrolls
    // on until the editor fills it. The editor itself, with the gutter below
    // it, is only as tall as its graph makes it.
    <div style={{ minHeight: column?.view }}>
      <div
        ref={editor}
        className="flex flex-col gap-2 pb-4"
        data-envelope-editor
      >
        {/* the page's gutter is the header's own, so its title lines up
            with the step editor's */}
        <PanelHeader
          as="div"
          className={cn("-ml-4", BLEED_RIGHT, "flex items-center gap-2")}
        >
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
                  label={format("sequencer-voice-velocity-of", {
                    voice: lane.voice + 1,
                  })}
                  value={voices[lane.voice].velocity}
                  min={1}
                  max={127}
                  parse={parseNumber}
                  onChange={(velocity) =>
                    editVoice(
                      lane.voice,
                      { velocity },
                      `velocity-${lane.voice}`,
                    )
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
              {!voices[lane.voice].enabled && (
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
              data-lane-name
            >
              {modulation === undefined ? (
                CC_NAMES[lane.cc]
              ) : (
                <span className="text-envelope">
                  {format("sequencer-modulation-modulates", {
                    target: modulationTargetLabel(modulation.target, localized),
                  })}
                </span>
              )}
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
            {/* the CC's values copied, pasted from any CC on any step, or
                cleared from this one, leaving the CC to draw into */}
            <IconButton
              aria-label={localized["sequencer-step-cc-values"]}
              title={localized["sequencer-step-cc-values"]}
              aria-haspopup="menu"
              aria-expanded={valuesMenu !== null}
              active={valuesMenu !== null}
              // the open menu would close on this press, and the click
              // open it again
              onPointerDown={(event) => {
                if (valuesMenu !== null) {
                  event.stopPropagation()
                }
              }}
              onClick={(event) => {
                if (valuesMenu !== null) {
                  setValuesMenu(null)
                  return
                }
                const { left, bottom } =
                  event.currentTarget.getBoundingClientRect()
                setValuesMenu({ x: left, y: bottom + 4 })
              }}
            >
              <DotsVerticalIcon size={16} />
            </IconButton>
            {valuesMenu !== null && (
              <ContextMenu
                label={localized["sequencer-step-cc-values"]}
                at={valuesMenu}
                onClose={() => setValuesMenu(null)}
              >
                {(close) => (
                  <>
                    <MenuItem
                      close={close}
                      disabled={envelope === null}
                      onSelect={() => {
                        if (envelope !== null) {
                          setCopiedEnvelope(envelopeValues(envelope))
                        }
                      }}
                    >
                      <Localized name="sequencer-step-cc-copy" />
                    </MenuItem>
                    <MenuItem
                      close={close}
                      disabled={copiedEnvelope === null}
                      onSelect={() => {
                        if (copiedEnvelope !== null) {
                          pasteEnvelope(
                            stepIndex,
                            lane.cc,
                            lane.channel,
                            copiedEnvelope,
                          )
                        }
                      }}
                    >
                      <Localized name="sequencer-step-cc-paste" />
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem
                      close={close}
                      disabled={
                        envelope === null || envelope.points.length === 0
                      }
                      onSelect={() => {
                        if (envelope !== null) {
                          clearEnvelope(stepIndex, envelope.id)
                        }
                      }}
                    >
                      <Localized name="sequencer-step-cc-clear" />
                    </MenuItem>
                  </>
                )}
              </ContextMenu>
            )}
            {envelope !== null && (
              <IconButton
                aria-label={localized["sequencer-step-remove-cc"]}
                title={removes}
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
          <div className="flex items-center gap-2">
            <ButtonGroup>
              <Button
                type="button"
                size="sm"
                active={activeTool === "edit"}
                aria-pressed={activeTool === "edit"}
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
                active={activeTool === "draw"}
                aria-pressed={activeTool === "draw"}
                title={`${localized["sequencer-envelope-draw"]} (B)`}
                onClick={() => setTool("draw")}
              >
                <PencilIcon size={14} />
                <Localized name="sequencer-envelope-draw" />
              </Button>
              {/* velocities are notes', not points, so there is nothing to
                  erase on that lane */}
              {lane.kind === "cc" && (
                <Button
                  type="button"
                  size="sm"
                  active={activeTool === "erase"}
                  aria-pressed={activeTool === "erase"}
                  title={localized["sequencer-envelope-erase-hint"]}
                  onClick={() => setTool("erase")}
                >
                  <EraserIcon size={14} />
                  <Localized name="sequencer-envelope-erase" />
                </Button>
              )}
            </ButtonGroup>
            {lane.kind === "cc" && envelope !== null && (
              <ButtonGroup>
                <Button
                  type="button"
                  size="sm"
                  active={envelopeShape(envelope) === "steps"}
                  aria-pressed={envelopeShape(envelope) === "steps"}
                  title={localized["sequencer-envelope-steps-hint"]}
                  onClick={() =>
                    editEnvelope(stepIndex, envelope.id, { shape: "steps" })
                  }
                >
                  <SquareWaveIcon size={14} />
                  <Localized name="sequencer-envelope-steps" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  active={envelopeShape(envelope) === "ramps"}
                  aria-pressed={envelopeShape(envelope) === "ramps"}
                  title={localized["sequencer-envelope-ramps-hint"]}
                  onClick={() =>
                    editEnvelope(stepIndex, envelope.id, { shape: "ramps" })
                  }
                >
                  <SlopeUphillIcon size={14} />
                  <Localized name="sequencer-envelope-ramps" />
                </Button>
              </ButtonGroup>
            )}
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
          height={graphHeight}
        />
      </div>
    </div>
  )
}
