import {
  Accent,
  dotsPerStep,
  GM_PROGRAMS,
  MAX_PATTERN_LENGTH,
  PACE_LABELS,
  PACES,
  PaceId,
  PatternStepJSON,
  playedVelocity,
  shownAccent,
  VoiceIndex,
  VoiceRule,
} from "@midiseq/core"
import ArrowCollapseDownIcon from "mdi-react/ArrowCollapseDownIcon"
import ArrowExpandUpIcon from "mdi-react/ArrowExpandUpIcon"
import ChevronRightIcon from "mdi-react/ChevronRightIcon"
import { CSSProperties, FC, ReactNode, useState } from "react"
import { usePatternFileActions } from "../../actions/file"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePatch } from "../../hooks/usePatch"
import { useSelectedLane, useSelectedVoice } from "../../hooks/useSequencerView"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { IconButton } from "../ui/Button"
import { cn } from "../ui/cn"
import { Field, Fields } from "../ui/Field"
import { Panel, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Slider } from "../ui/Slider"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"
import { StepOptions } from "./StepOptions"

const TAB =
  "h-9 flex-1 border-b-[0.15rem] bg-transparent text-body hover:bg-highlight"

const DOT =
  "relative aspect-square rounded-full border-2 font-mono text-micro leading-none transition-transform duration-100"

// a tail towards the next dot: solid for a hold, hollow for a tie
const TAIL =
  "before:absolute before:top-1/2 before:right-[-0.35rem] before:h-[0.16rem] before:w-[0.35rem] before:-translate-y-1/2 before:content-['']"

// a condition is otherwise invisible, so it marks the corner
const CONDITION_MARK =
  "after:absolute after:top-[-0.1rem] after:right-[-0.1rem] after:h-[0.3rem] after:w-[0.3rem] after:rounded-full after:bg-yellow after:content-['']"

const RULES: { value: VoiceRule; label: string }[] = [
  { value: "nth", label: "Nth" },
  { value: "lowest", label: "Lowest" },
  { value: "highest", label: "Highest" },
  { value: "random", label: "Random" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "updown", label: "Up / Down" },
  { value: "downup", label: "Down / Up" },
  { value: "updown+", label: "Up / Down +" },
  { value: "downup+", label: "Down / Up +" },
  { value: "rise", label: "Rise" },
  { value: "fall", label: "Fall" },
]

const VOICES: VoiceIndex[] = [0, 1, 2, 3]

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
  const patch = usePatch()
  const [selected, setSelected] = useSelectedVoice()
  const { editVoice } = usePatchEditor()
  const localized = useLocalization()
  const voice = patch.voices[selected]

  return (
    <Panel
      aria-label={localized["sequencer-voices"]}
      className={cn("overflow-y-auto", className)}
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
            data-enabled={patch.voices[index].enabled}
            aria-label={`${localized["sequencer-voice"]} ${index + 1}`}
            className={cn(
              TAB,
              index === selected
                ? "border-voice text-fg"
                : "border-transparent text-fg-secondary",
              !patch.voices[index].enabled && "opacity-55",
            )}
            style={voiceColor(index)}
            onClick={() => setSelected(index)}
          >
            {index + 1}
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

        <Field label={localized["sequencer-pace"]}>
          <Select
            value={voice.pace}
            onChange={(event) =>
              editVoice(selected, { pace: event.target.value as PaceId })
            }
          >
            {PACES.map((pace) => (
              <option key={pace} value={pace}>
                {PACE_LABELS[pace]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-voice-length"]}>
          <Slider
            min={10}
            max={100}
            step={5}
            value={Math.round(voice.length * 100)}
            aria-label={localized["sequencer-voice-length"]}
            onChange={(event) =>
              editVoice(
                selected,
                { length: Number(event.target.value) / 100 },
                `length-${selected}`,
              )
            }
          />
        </Field>

        <Field label={localized["sequencer-voice-rule"]}>
          <Select
            value={voice.rule}
            onChange={(event) =>
              editVoice(selected, { rule: event.target.value as VoiceRule })
            }
          >
            {RULES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-voice-offset"]}>
          <Stepper
            label={localized["sequencer-voice-offset"]}
            value={voice.offset}
            min={-24}
            max={24}
            onChange={(offset) =>
              editVoice(selected, { offset }, `offset-${selected}`)
            }
          />
        </Field>

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
          <Select
            value={String(voice.program)}
            onChange={(event) =>
              editVoice(selected, { program: Number(event.target.value) })
            }
          >
            {GM_PROGRAMS.map((name, program) => (
              <option key={name} value={program}>
                {name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-voice-pattern-length"]}>
          <Stepper
            label={localized["sequencer-voice-pattern-length"]}
            value={voice.patternLength}
            min={1}
            max={MAX_PATTERN_LENGTH}
            onChange={(patternLength) =>
              editVoice(selected, { patternLength }, `pattern-${selected}`)
            }
          />
        </Field>
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
  const patch = usePatch()
  const { player } = useStores()
  const voiceDots = useMobxGetter(player, "voiceDots")
  const playingDots = useMobxGetter(player, "playingDots")
  const { togglePatternDot } = usePatchEditor()
  const { accentAmount } = useAccentAmount()
  const [, setLane] = useSelectedLane()

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

  return (
    <section
      aria-label={localized["sequencer-voice-patterns"]}
      className="flex flex-col gap-[0.35rem] border-t border-divider px-3 pt-3"
    >
      {VOICES.map((voiceIndex) => {
        const voice = patch.voices[voiceIndex]
        // The dots the voice reaches while the sequencer sits on one step:
        // from the dot it is on when the step sounds, or from its first when
        // stopped, which is where playing starts.
        const reach = dotsPerStep(patch.pace, voice.pace, voice.patternLength)
        const runs = bands(
          voiceDots?.[voiceIndex] ?? 0,
          reach,
          voice.patternLength,
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
            className={cn(
              "m-0 flex min-w-0 items-center gap-2 px-0 py-[0.4rem]",
              !voice.enabled && "opacity-55",
            )}
            style={voiceColor(voiceIndex)}
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
              {runs.map(([first, count]) => (
                <span
                  key={first}
                  aria-hidden
                  data-band
                  className="-m-[0.25rem] rounded-full bg-pace-band"
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
                    data-playing={playingDots?.[voiceIndex] === dotIndex}
                    data-articulation={dot.articulation}
                    data-accent={accent}
                    data-velocity={playedVelocity(
                      voice.velocity,
                      accentAmount,
                      dot,
                    )}
                    data-chance={dot.probability < 100}
                    data-condition={dot.condition !== "always"}
                    className={dotClass(
                      dot,
                      accent,
                      dotIndex >= voice.patternLength,
                      editing,
                    )}
                    style={{ gridRow: 1, gridColumn: dotIndex + 1 }}
                    title={describe(
                      dot,
                      accent,
                      playedVelocity(voice.velocity, accentAmount, dot),
                      localized,
                    )}
                    onClick={() => {
                      togglePatternDot(voiceIndex, dotIndex)
                      focusVoice(voiceIndex)
                    }}
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
                    {playingDots?.[voiceIndex] === dotIndex && (
                      // under the dot rather than on it, so it reads the same
                      // on a dot that is on, off or hollow
                      <span
                        aria-hidden
                        data-playhead
                        className="absolute -bottom-[0.3rem] left-1/2 h-[0.13rem] w-3/4 -translate-x-1/2 rounded-full bg-white"
                      />
                    )}
                  </button>
                )
              })}
            </span>
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
          dot={patch.voices[options.voiceIndex].pattern[options.dotIndex]}
          at={options.at}
          onClose={() => setOptions(null)}
        />
      )}
    </section>
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
