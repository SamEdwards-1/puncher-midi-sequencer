import {
  Accent,
  dotsPerStep,
  GM_PROGRAMS,
  MAX_PATTERN_LENGTH,
  modulatedVoice,
  NoteCollision,
  noteCollisions,
  noteNumberToName,
  PACE_LABELS,
  PACES,
  PatternStepJSON,
  playedVelocity,
  shownAccent,
  stepPace,
  VOICE_RULES,
  VoiceIndex,
  VoiceSetting,
  viewIndex,
} from "@midiseq/core"
import ArrowCollapseDownIcon from "mdi-react/ArrowCollapseDownIcon"
import ArrowExpandUpIcon from "mdi-react/ArrowExpandUpIcon"
import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import ChevronRightIcon from "mdi-react/ChevronRightIcon"
import HeadphonesIcon from "mdi-react/HeadphonesIcon"
import VolumeHighIcon from "mdi-react/VolumeHighIcon"
import VolumeOffIcon from "mdi-react/VolumeOffIcon"
import { comparer } from "mobx"
import { CSSProperties, FC, memo, ReactNode, useMemo, useState } from "react"
import { usePatternFileActions } from "../../actions/file"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { useActions } from "../../hooks/useActions"
import { useMobxGetter, useMobxSelector } from "../../hooks/useMobxSelector"
import { usePatchSelector } from "../../hooks/usePatch"
import {
  useSelectedLane,
  useSelectedStep,
  useSelectedVoice,
  useSoloRestore,
} from "../../hooks/useSequencerView"
import { useStepPreview } from "../../hooks/useStepPreview"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { BUILTIN_OUTPUT } from "../../stores/MIDIDeviceStore"
import { RULE_LABELS } from "../Modulation/labels"
import { ModulatedField } from "../Modulation/ModulatedField"
import { FitSelect } from "../Scale/ScalePicker"
import { ButtonGroup, IconButton } from "../ui/Button"
import { ComboBox } from "../ui/ComboBox"
import { cn } from "../ui/cn"
import { Field, FieldGroup, Fields } from "../ui/Field"
import { Panel, PanelHeader } from "../ui/Panel"
import { Slider } from "../ui/Slider"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"
import { StepOptions } from "./StepOptions"

const PACE_OPTIONS = PACES.map((pace) => ({
  value: pace,
  label: PACE_LABELS[pace],
}))

const INSTRUMENT_OPTIONS = GM_PROGRAMS.map((label, value) => ({
  value,
  label,
}))

const RULE_OPTIONS = VOICE_RULES.map((rule) => ({
  value: rule,
  label: RULE_LABELS[rule],
}))

const TAB =
  "flex h-9 flex-1 items-center justify-center gap-[0.4rem] whitespace-nowrap border-b-[0.15rem] bg-transparent text-body hover:bg-highlight"

const DOT =
  "relative aspect-square rounded-full border-2 font-mono text-micro leading-none transition-transform duration-100"

// a tail towards the next dot: solid for a hold, hollow for a tie
const TAIL =
  "before:absolute before:top-1/2 before:right-[-0.35rem] before:h-[0.16rem] before:w-[0.35rem] before:-translate-y-1/2 before:content-['']"

// a condition is otherwise invisible, so it marks the corner
const CONDITION_MARK =
  "after:absolute after:top-[-0.1rem] after:right-[-0.1rem] after:h-[0.3rem] after:w-[0.3rem] after:rounded-full after:bg-yellow after:content-['']"

const VOICES: VoiceIndex[] = [0, 1, 2, 3]

// the colours collisions take in turn, as styles.css defines them
const COLLISION_COLORS = 6
const collisionColor = (index: number) =>
  `var(--midiseq-collision-${index % COLLISION_COLORS})`

// Names what a dot collides with, for its tooltip: the key, and the other
// voices sounding it.
const describeCollision = (
  collision: NoteCollision,
  voice: VoiceIndex,
  localized: Record<string, string>,
): string => {
  const others = [
    ...new Set(
      collision.dots.map((dot) => dot.voice).filter((other) => other !== voice),
    ),
  ].map((other) => other + 1)
  return `${localized["sequencer-dot-collision"]} ${noteNumberToName(collision.note)} · ${localized["sequencer-voice"]} ${others.join(", ")}`
}

// Points the `voice` colour at one voice's, for the element and whatever is
// inside it.
const voiceColor = (index: VoiceIndex): CSSProperties =>
  ({ "--midiseq-voice": `var(--midiseq-voice-${index})` }) as CSSProperties

// Spells the options out on hover, since the marks are necessarily terse.
const describe = (
  dot: PatternStepJSON,
  accent: Accent,
  velocity: number,
  localized: Record<string, string>,
): string => {
  const parts = [
    dot.articulation === "none"
      ? null
      : localized[`sequencer-dot-articulation-${dot.articulation}`],
    accent === "none" ? null : `${localized["sequencer-dot-accent"]} ${accent}`,
    // a velocity of its own is invisible on the dot unless it is an accent's
    dot.velocityOffset === 0
      ? null
      : `${localized["sequencer-voice-velocity"]} ${velocity}`,
    dot.ratchet > 1
      ? `${localized["sequencer-dot-ratchet"]} ${dot.ratchet}x`
      : null,
    dot.probability < 100 ? `${dot.probability}%` : null,
    dot.condition === "always" ? null : dot.condition,
  ].filter((part) => part !== null)
  return parts.join(" · ")
}

/**
 * A dot shows its own step options: a ratchet count sits inside it, an accent
 * makes it bigger or smaller, a probability below 100% hollows it out, a hold
 * or tie draws a tail towards the next dot, and a condition marks the corner.
 */
const dotClass = (
  dot: PatternStepJSON,
  accent: Accent,
  beyond: boolean,
  editing: boolean,
) => {
  const chance = dot.probability < 100
  return cn(
    DOT,
    dot.on
      ? // played only sometimes: hollow, so it reads as less certain
        chance
        ? "border-voice bg-transparent text-fg"
        : "border-transparent bg-voice text-on-surface"
      : "border-transparent bg-step text-on-surface",
    beyond && "opacity-25",
    accent === "+" && "scale-[1.15]",
    accent === "-" && "scale-80",
    // the dot whose options are open
    editing && "outline-2 outline-offset-2 outline-fg",
    dot.articulation === "hold" && cn(TAIL, "before:bg-voice"),
    dot.articulation === "tie" &&
      cn(TAIL, "before:border-t-2 before:border-voice before:bg-transparent"),
    dot.condition !== "always" && CONDITION_MARK,
  )
}

// `header` is left off when the panel sits under a tab that names it.
export const VoicePanel: FC<{ header?: boolean; className?: string }> = ({
  header = true,
  className = "border-l border-divider",
}) => {
  const voices = usePatchSelector((patch) => patch.voices)
  const [selected, setSelected] = useSelectedVoice()
  const { editVoice } = usePatchEditor()
  const localized = useLocalization()
  const voice = voices[selected]
  // An instrument only means something to the built-in synth: the voice
  // reaches it when it is one of the outputs, or the voice's own. Otherwise
  // it is shown but can't be changed.
  const { midiDeviceStore } = useStores()
  const outputNames = useMobxGetter(midiDeviceStore, "outputNames")
  // the built-in synth's tick among the outputs in MIDI settings
  const builtInOn = outputNames.all.includes(BUILTIN_OUTPUT)
  const playsBuiltIn =
    builtInOn || outputNames.voices[selected] === BUILTIN_OUTPUT
  // a setting of the voice's that a CC can drive
  const target = (setting: VoiceSetting) =>
    ({ kind: "voice", voice: selected, setting }) as const

  return (
    <Panel
      aria-label={localized["sequencer-voices"]}
      scrolls
      className={className}
    >
      {header && (
        <PanelHeader>
          <Localized name="sequencer-voices" />
        </PanelHeader>
      )}

      <div className="flex border-b border-divider">
        {VOICES.map((index) => (
          <button
            key={index}
            type="button"
            data-active={index === selected}
            data-enabled={voices[index].enabled}
            className={cn(
              TAB,
              index === selected
                ? "border-voice text-fg"
                : "border-transparent text-fg-secondary",
              !voices[index].enabled && "opacity-55",
            )}
            style={voiceColor(index)}
            onClick={() => setSelected(index)}
          >
            {/* the voice's colour, as its dots and notes have it */}
            <span
              aria-hidden
              className="h-2 w-2 flex-none rounded-full bg-voice"
            />
            {localized["sequencer-voice"]} {index + 1}
          </button>
        ))}
      </div>

      <Fields>
        <Field label={localized["sequencer-voice-enable"]}>
          <Toggle
            label={localized["sequencer-voice-enable"]}
            checked={voice.enabled}
            onChange={(enabled) => editVoice(selected, { enabled })}
          />
        </Field>

        <ModulatedField
          label={localized["sequencer-pace"]}
          target={target("pace")}
        >
          {(shown) => (
            <ComboBox
              value={shown(voice.pace)}
              options={PACE_OPTIONS}
              onChange={(pace) => editVoice(selected, { pace })}
            />
          )}
        </ModulatedField>

        <ModulatedField
          label={localized["sequencer-voice-length"]}
          target={target("length")}
        >
          {(shown) => (
            <Slider
              min={10}
              max={100}
              step={5}
              value={Math.round(shown(voice.length) * 100)}
              aria-label={localized["sequencer-voice-length"]}
              onChange={(event) =>
                editVoice(
                  selected,
                  { length: Number(event.target.value) / 100 },
                  `length-${selected}`,
                )
              }
            />
          )}
        </ModulatedField>

        <ModulatedField
          label={localized["sequencer-voice-rule"]}
          target={target("rule")}
        >
          {(shown) => (
            <ComboBox
              value={shown(voice.rule)}
              options={RULE_OPTIONS}
              onChange={(rule) => editVoice(selected, { rule })}
            />
          )}
        </ModulatedField>

        <FieldGroup>
          <ModulatedField
            label={localized["sequencer-transpose-amt"]}
            target={target("transposeAmt")}
          >
            {(shown) => (
              <Stepper
                label={localized["sequencer-transpose-amt"]}
                value={shown(voice.transposeAmt)}
                min={-24}
                max={24}
                onChange={(transposeAmt) =>
                  editVoice(selected, { transposeAmt }, `transpose-${selected}`)
                }
              />
            )}
          </ModulatedField>

          <ModulatedField
            label={localized["sequencer-transpose-fit"]}
            target={target("transposeFit")}
          >
            {(shown) => (
              <FitSelect
                value={shown(voice.transposeFit)}
                onChange={(transposeFit) =>
                  editVoice(selected, { transposeFit })
                }
              />
            )}
          </ModulatedField>
        </FieldGroup>

        <Field label={localized["sequencer-voice-velocity"]}>
          <Stepper
            label={localized["sequencer-voice-velocity"]}
            value={voice.velocity}
            min={1}
            max={127}
            onChange={(velocity) =>
              editVoice(selected, { velocity }, `velocity-${selected}`)
            }
          />
        </Field>

        <Field label={localized["sequencer-voice-channel"]}>
          <Stepper
            label={localized["sequencer-voice-channel"]}
            value={voice.channel}
            min={1}
            max={16}
            onChange={(channel) =>
              editVoice(selected, { channel }, `channel-${selected}`)
            }
          />
        </Field>

        <Field label={localized["sequencer-voice-instrument"]}>
          <div className="flex min-w-0 items-center gap-1">
            <div className="grid min-w-0 flex-1">
              <ComboBox
                value={voice.program}
                options={INSTRUMENT_OPTIONS}
                // muted, it has nothing to play the instrument
                disabled={!playsBuiltIn}
                onChange={(program) => editVoice(selected, { program })}
              />
            </div>
            <IconButton
              aria-label={localized["sequencer-synth-mute"]}
              aria-pressed={!builtInOn}
              title={localized["sequencer-synth-mute-hint"]}
              active={!builtInOn}
              onClick={() =>
                midiDeviceStore.toggleOutput(BUILTIN_OUTPUT, !builtInOn)
              }
            >
              {builtInOn ? (
                <VolumeHighIcon size={16} />
              ) : (
                <VolumeOffIcon size={16} />
              )}
            </IconButton>
          </div>
        </Field>

        <ModulatedField
          label={localized["sequencer-voice-pattern-length"]}
          target={target("patternLength")}
        >
          {(shown) => (
            <Stepper
              label={localized["sequencer-voice-pattern-length"]}
              value={shown(voice.patternLength)}
              min={1}
              max={MAX_PATTERN_LENGTH}
              onChange={(patternLength) =>
                editVoice(selected, { patternLength }, `pattern-${selected}`)
              }
            />
          )}
        </ModulatedField>
      </Fields>

      <Patterns selected={selected} onSelect={setSelected} />
    </Panel>
  )
}

/**
 * The runs of dots `reach` long from `start`, as [first, count] grid spans.
 * A run that passes the end of the pattern carries on from its first dot, as
 * the voice does, so it comes back as two.
 */
const bands = (
  start: number,
  reach: number,
  patternLength: number,
): [number, number][] => {
  const first = start % patternLength
  const beforeEnd = Math.min(reach, patternLength - first)
  return beforeEnd === reach
    ? [[first, reach]]
    : [
        [first, beforeEnd],
        [0, reach - beforeEnd],
      ]
}

/**
 * Every voice's pattern at once, one row each and every dot editable, so the
 * voices can be written against each other without flipping through tabs.
 * A row's number selects its voice for the fields above without touching the
 * pattern; editing one of its dots selects the voice as well.
 */
const Patterns: FC<{
  selected: VoiceIndex
  onSelect: (index: VoiceIndex) => void
}> = ({ selected, onSelect }) => {
  const voices = usePatchSelector((patch) => patch.voices)
  const size = usePatchSelector((patch) => patch.size)
  const { player } = useStores()
  const voiceDots = useMobxGetter(player, "voiceDots")
  const position = useMobxGetter(player, "position")
  const { actions } = useActions()
  const { togglePatternDot, editVoice, editVoicesEnabled } = usePatchEditor()
  const { accentAmount } = useAccentAmount()
  const [, setLane] = useSelectedLane()
  const [step] = useSelectedStep()
  // the step the bands are for: the one playing, or the one in the editor
  const bandStep =
    voiceDots !== null && position !== null
      ? viewIndex(position, size, actions.flip)
      : step
  // The dots each voice reaches while the sequencer sits on that step, and
  // how many dots its pattern runs to there: the step may modulate its own
  // length, and the voice's pace and pattern, as it lands.
  const landings = usePatchSelector(
    (patch) =>
      VOICES.map((voice) => {
        const landed = modulatedVoice(patch, voice, bandStep, 0)
        return {
          reach: dotsPerStep(
            stepPace(patch, bandStep),
            landed.pace,
            landed.patternLength,
          ),
          patternLength: landed.patternLength,
        }
      }),
    [bandStep],
    comparer.structural,
  )

  // The step in the editor as the sequence reaches it — which dots each
  // voice has come round to by then, and what they play, this time round
  // while it sounds — and the voices sounding one key at once on it, each
  // collision numbered in time order.
  const preview = useStepPreview(step)
  const collisions = useMemo(
    () => noteCollisions(preview.notes),
    [preview.notes],
  )
  const collisionsAt = useMemo(() => {
    const at = new Map<string, number[]>()
    collisions.forEach((collision, index) => {
      for (const { voice, dot } of collision.dots) {
        const key = `${voice}:${dot}`
        at.set(key, [...(at.get(key) ?? []), index])
      }
    })
    return at
  }, [collisions])
  // the dot under the mouse, whose collisions bob wherever they're marked
  const [hovered, setHovered] = useState<string | null>(null)
  const bouncing = new Set(
    hovered === null ? [] : (collisionsAt.get(hovered) ?? []),
  )

  // Editing a dot brings its voice up: its tab in the fields above, and its
  // Velocity tab in the step editor if a Velocity tab is what is open there.
  const focusVoice = (voice: VoiceIndex) => {
    onSelect(voice)
    setLane((lane) =>
      lane?.kind === "velocity" ? { kind: "velocity", voice } : lane,
    )
  }
  const { exportPatterns, importPatterns } = usePatternFileActions()
  const localized = useLocalization()
  const [options, setOptions] = useState<{
    voiceIndex: VoiceIndex
    dotIndex: number
    at: { x: number; y: number }
  } | null>(null)
  // Mute and solo are the voices' own Enable settings: a muted voice is one
  // switched off, and a soloed voice the only one on.
  const enabled = voices.map((voice) => voice.enabled)
  const soloed = (voice: VoiceIndex) =>
    enabled.every((on, index) => on === (index === voice))
  const [soloRestore, setSoloRestore] = useSoloRestore()
  const mute = (voice: VoiceIndex) =>
    editVoice(voice, { enabled: !enabled[voice] })
  // Soloing switches the others off, remembering which were on; soloing
  // another voice from a solo keeps what was on before the first. Un-soloing
  // switches them back on, or, with nothing remembered — a solo made by
  // hand, or before a reload — every voice.
  const solo = (voice: VoiceIndex) => {
    if (soloed(voice)) {
      const before =
        soloRestore?.voice === voice
          ? soloRestore.enabled
          : enabled.map(() => true)
      editVoicesEnabled(before.map((on, index) => on || index === voice))
      setSoloRestore(null)
      return
    }
    const other = VOICES.find(soloed)
    setSoloRestore({
      voice,
      enabled:
        other !== undefined && soloRestore?.voice === other
          ? soloRestore.enabled
          : enabled,
    })
    editVoicesEnabled(enabled.map((_, index) => index === voice))
  }

  return (
    <section
      aria-label={localized["sequencer-voice-patterns"]}
      aria-busy={preview.status === "pending"}
      // 0.75rem each side, the right less the panel's scrollbar, though
      // never less than the 0.25rem a band hangs past its dots
      className="flex flex-col gap-[1.1rem] border-t border-divider pr-[max(0.25rem,calc(0.75rem-var(--scrollbar-gutter,0px)))] pt-3 pl-3"
    >
      {preview.status !== undefined && (
        <span className="text-small text-fg-tertiary">
          {
            localized[
              preview.status === "pending"
                ? "sequencer-preview-pending"
                : "sequencer-preview-unavailable"
            ]
          }
        </span>
      )}
      {VOICES.map((voiceIndex) => {
        const voice = voices[voiceIndex]
        // The dots the voice reaches while the sequencer sits on one step:
        // from the dot it is on when the step playing sounds, or stopped,
        // from the one it will have come round to by the step in the editor.
        const { reach, patternLength } = landings[voiceIndex]
        const runs = bands(
          (voiceDots ?? preview.voiceDots)[voiceIndex] ?? 0,
          reach,
          patternLength,
        )
        const reached = (dotIndex: number) =>
          runs.some(
            ([first, count]) => dotIndex >= first && dotIndex < first + count,
          )
        return (
          <fieldset
            key={voiceIndex}
            aria-label={`${localized["sequencer-voice"]} ${voiceIndex + 1} ${localized["sequencer-voice-pattern"]}`}
            aria-current={voiceIndex === selected}
            data-enabled={voice.enabled}
            data-reach={reach}
            className="m-0 flex min-w-0 flex-col gap-[0.6rem] border-0 px-0 py-[0.4rem]"
            style={voiceColor(voiceIndex)}
          >
            <div
              className={cn(
                "flex min-w-0 items-center gap-2",
                !voice.enabled && "opacity-55",
              )}
            >
              <button
                type="button"
                aria-label={`${localized["sequencer-voice-select"]} ${voiceIndex + 1}`}
                aria-pressed={voiceIndex === selected}
                className="flex h-5 w-5 flex-none items-center justify-center rounded text-tiny text-voice hover:bg-highlight hover:brightness-125"
                onClick={() => onSelect(voiceIndex)}
              >
                {voiceIndex === selected ? (
                  <ChevronRightIcon size={14} />
                ) : (
                  voiceIndex + 1
                )}
              </button>
              {/* dots fill the column, up to a size that still reads as a
                row of dots when the panel has the whole window */}
              <span className="grid flex-1 grid-cols-[repeat(16,minmax(0,1.75rem))] gap-[0.3rem]">
                {/* a band the pattern's end cuts in two is square where it
                    breaks off and where it carries on, round at its ends */}
                {runs.map(([first, count], run) => (
                  <span
                    key={first}
                    aria-hidden
                    data-band
                    data-cut={
                      runs.length === 1
                        ? undefined
                        : run === 0
                          ? "end"
                          : "start"
                    }
                    className={cn(
                      "-m-[0.25rem] border-[1.5px] border-theme",
                      runs.length === 1
                        ? "rounded-full"
                        : run === 0
                          ? "rounded-l-full"
                          : "rounded-r-full",
                    )}
                    style={{
                      gridRow: 1,
                      gridColumn: `${first + 1} / span ${count}`,
                    }}
                  />
                ))}
                {voice.pattern.map((dot, dotIndex) => {
                  const editing =
                    options?.voiceIndex === voiceIndex &&
                    options.dotIndex === dotIndex
                  // a velocity landing on an accent's shows as that accent
                  const accent = shownAccent(voice.velocity, accentAmount, dot)
                  const collided =
                    collisionsAt.get(`${voiceIndex}:${dotIndex}`) ?? []
                  return (
                    <button
                      // biome-ignore lint/suspicious/noArrayIndexKey: a dot's index is its position in the pattern
                      key={dotIndex}
                      type="button"
                      aria-label={`${localized["sequencer-voice"]} ${voiceIndex + 1} ${localized["sequencer-voice-dot"]} ${dotIndex + 1}`}
                      data-on={dot.on}
                      data-beyond={dotIndex >= voice.patternLength}
                      data-reached={reached(dotIndex)}
                      data-editing={editing}
                      data-articulation={dot.articulation}
                      data-accent={accent}
                      data-velocity={playedVelocity(
                        voice.velocity,
                        accentAmount,
                        dot,
                      )}
                      data-chance={dot.probability < 100}
                      data-condition={dot.condition !== "always"}
                      data-collisions={
                        collided.length > 0 ? collided.join(" ") : undefined
                      }
                      className={dotClass(
                        dot,
                        accent,
                        dotIndex >= voice.patternLength,
                        editing,
                      )}
                      style={{ gridRow: 1, gridColumn: dotIndex + 1 }}
                      title={[
                        describe(
                          dot,
                          accent,
                          playedVelocity(voice.velocity, accentAmount, dot),
                          localized,
                        ),
                        ...collided.map((index) =>
                          describeCollision(
                            collisions[index],
                            voiceIndex,
                            localized,
                          ),
                        ),
                      ]
                        .filter((part) => part !== "")
                        .join("\n")}
                      onClick={() => {
                        togglePatternDot(voiceIndex, dotIndex)
                        focusVoice(voiceIndex)
                      }}
                      onMouseEnter={() =>
                        setHovered(`${voiceIndex}:${dotIndex}`)
                      }
                      onMouseLeave={() => setHovered(null)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        focusVoice(voiceIndex)
                        setOptions({
                          voiceIndex,
                          dotIndex,
                          at: { x: event.clientX, y: event.clientY },
                        })
                      }}
                    >
                      {dot.ratchet > 1 ? dot.ratchet : ""}
                      {collided.length > 0 && (
                        // above the dot and clear of the band's line, one
                        // chevron per collision it is in, each in that
                        // collision's colour. An accent scales the dot, and
                        // everything in it, about its middle, so the marks
                        // undo that: the same size and height on every dot.
                        <span
                          aria-hidden
                          data-collision-mark
                          className={cn(
                            "pointer-events-none absolute left-1/2 flex origin-bottom -translate-x-1/2 -space-x-3",
                            accent === "-"
                              ? "bottom-[calc(112.5%+2.5px)] scale-[1.25]"
                              : accent === "+"
                                ? "bottom-[calc(93.5%+1.75px)] scale-[0.87]"
                                : "bottom-[calc(100%+2px)]",
                          )}
                        >
                          {collided.map((index) => (
                            <span
                              key={index}
                              data-collision={index}
                              data-bouncing={bouncing.has(index)}
                              className={cn(
                                "flex",
                                bouncing.has(index) && "collision-bounce",
                              )}
                              style={{ color: collisionColor(index) }}
                            >
                              <ChevronDownIcon
                                size={22}
                                stroke="currentColor"
                                strokeWidth={1.2}
                                strokeLinejoin="round"
                              />
                            </span>
                          ))}
                        </span>
                      )}
                      <DotPlayhead voice={voiceIndex} dot={dotIndex} />
                    </button>
                  )
                })}
              </span>
            </div>
            {/* under the dots, lined up with the first */}
            <VoiceButtons
              voice={voiceIndex}
              muted={!voice.enabled}
              soloed={soloed(voiceIndex)}
              onMute={mute}
              onSolo={solo}
            />
          </fieldset>
        )
      })}
      <div className="flex items-center gap-1 pt-1 pb-4 pl-1">
        <span className="flex-1 text-tiny text-fg-tertiary">
          <Localized name="sequencer-dot-hint" />
        </span>
        <PatternFileButton
          label={localized["sequencer-patterns-import"]}
          onClick={importPatterns}
        >
          <ArrowCollapseDownIcon size={16} />
        </PatternFileButton>
        <PatternFileButton
          label={localized["sequencer-patterns-export"]}
          onClick={exportPatterns}
        >
          <ArrowExpandUpIcon size={16} />
        </PatternFileButton>
      </div>

      {options !== null && (
        <StepOptions
          voiceIndex={options.voiceIndex}
          dotIndex={options.dotIndex}
          dot={voices[options.voiceIndex].pattern[options.dotIndex]}
          at={options.at}
          onClose={() => setOptions(null)}
        />
      )}
    </section>
  )
}

/**
 * The mark under the dot a voice is playing. It moves on several times a
 * step, so each dot watches for it on its own rather than the whole pattern
 * drawing again every time it does; and the pattern drawing again leaves
 * the marks be.
 */
const DotPlayhead: FC<{ voice: VoiceIndex; dot: number }> = memo(
  ({ voice, dot }) => {
    const { player } = useStores()
    const playing = useMobxSelector(
      () => player.playingDots?.[voice] === dot,
      [player, voice, dot],
    )
    return playing ? (
      // under the dot rather than on it, so it reads the same on a dot that is
      // on, off or hollow
      <span
        aria-hidden
        data-playhead
        className="absolute -bottom-[0.3rem] left-1/2 h-[0.13rem] w-3/4 -translate-x-1/2 rounded-full bg-white"
      />
    ) : null
  },
)

const VoiceButtons: FC<{
  voice: VoiceIndex
  muted: boolean
  soloed: boolean
  onMute: (voice: VoiceIndex) => void
  onSolo: (voice: VoiceIndex) => void
}> = ({ voice, muted, soloed, onMute, onSolo }) => {
  const localized = useLocalization()
  const buttons = [
    {
      label: localized["sequencer-voice-mute"],
      on: muted,
      onClick: onMute,
      icon: <VolumeOffIcon size={16} />,
    },
    {
      label: localized["sequencer-voice-solo"],
      on: soloed,
      onClick: onSolo,
      icon: <HeadphonesIcon size={16} />,
    },
  ]
  return (
    // the select button's width and the gap after it
    <ButtonGroup className="ml-7 self-start">
      {buttons.map(({ label, on, onClick, icon }) => (
        // square, so not a Button: its padding would crowd the icon
        <button
          key={label}
          type="button"
          data-active={on}
          aria-pressed={on}
          aria-label={`${label} ${localized["sequencer-voice"]} ${voice + 1}`}
          title={label}
          className={cn(
            "flex w-[1.7rem] items-center justify-center",
            on
              ? "bg-theme text-on-surface hover:brightness-110"
              : "bg-background-secondary text-fg-secondary hover:bg-highlight hover:text-fg",
          )}
          onClick={() => onClick(voice)}
        >
          {icon}
        </button>
      ))}
    </ButtonGroup>
  )
}

const PatternFileButton: FC<{
  label: string
  onClick: () => void
  children: ReactNode
}> = ({ label, onClick, children }) => (
  <IconButton aria-label={label} title={label} onClick={onClick}>
    {children}
  </IconButton>
)
