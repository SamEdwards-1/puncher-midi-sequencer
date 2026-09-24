import {
  GM_PROGRAMS,
  MAX_PATTERN_LENGTH,
  PACE_LABELS,
  PACES,
  PaceId,
  PatternStepJSON,
  VoiceIndex,
  VoiceRule,
} from "@midiseq/core"
import { CSSProperties, FC, useState } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useSelectedVoice } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
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

// The overview's dots are small enough that the step options would be noise,
// so they show only whether a dot plays, and how surely.
const MINI_DOT = "aspect-square rounded-full border"

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
  localized: Record<string, string>,
): string => {
  const parts = [
    dot.articulation === "none"
      ? null
      : localized[`sequencer-dot-articulation-${dot.articulation}`],
    dot.accent === "none"
      ? null
      : `${localized["sequencer-dot-accent"]} ${dot.accent}`,
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
const dotClass = (dot: PatternStepJSON, beyond: boolean, editing: boolean) => {
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
    dot.accent === "+" && "scale-[1.15]",
    dot.accent === "-" && "scale-80",
    // the dot whose options are open
    editing && "outline-2 outline-offset-2 outline-fg",
    dot.articulation === "hold" && cn(TAIL, "before:bg-voice"),
    dot.articulation === "tie" &&
      cn(TAIL, "before:border-t-2 before:border-voice before:bg-transparent"),
    dot.condition !== "always" && CONDITION_MARK,
  )
}

export const VoicePanel: FC = () => {
  const patch = usePatch()
  const [selected, setSelected] = useSelectedVoice()
  const { editVoice, togglePatternDot } = usePatchEditor()
  const localized = useLocalization()
  const [options, setOptions] = useState<{
    dotIndex: number
    at: { x: number; y: number }
  } | null>(null)
  const voice = patch.voices[selected]

  return (
    <Panel
      aria-label={localized["sequencer-voices"]}
      className="overflow-y-auto border-l border-divider"
    >
      <PanelHeader>
        <Localized name="sequencer-voices" />
      </PanelHeader>

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

      <div
        className="grid grid-cols-8 gap-[0.3rem] px-4 pb-4"
        style={voiceColor(selected)}
      >
        {voice.pattern.map((dot, index) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: a dot's index is its position in the pattern
            key={index}
            type="button"
            aria-label={`${localized["sequencer-voice-dot"]} ${index + 1}`}
            data-on={dot.on}
            data-beyond={index >= voice.patternLength}
            data-editing={options?.dotIndex === index}
            data-articulation={dot.articulation}
            data-accent={dot.accent}
            data-chance={dot.probability < 100}
            data-condition={dot.condition !== "always"}
            className={dotClass(
              dot,
              index >= voice.patternLength,
              options?.dotIndex === index,
            )}
            title={describe(dot, localized)}
            onClick={() => togglePatternDot(selected, index)}
            onContextMenu={(event) => {
              event.preventDefault()
              setOptions({
                dotIndex: index,
                at: { x: event.clientX, y: event.clientY },
              })
            }}
          >
            {dot.ratchet > 1 ? dot.ratchet : ""}
          </button>
        ))}
      </div>
      <div className="px-4 pb-4 text-tiny text-fg-tertiary">
        <Localized name="sequencer-dot-hint" />
      </div>

      <PatternOverview selected={selected} onSelect={setSelected} />

      {options !== null && (
        <StepOptions
          voiceIndex={selected}
          dotIndex={options.dotIndex}
          dot={voice.pattern[options.dotIndex]}
          at={options.at}
          onClose={() => setOptions(null)}
        />
      )}
    </Panel>
  )
}

/**
 * Every voice's pattern at once, one row each, so how the voices interlock
 * can be read without flipping through the tabs. A row selects its voice.
 */
const PatternOverview: FC<{
  selected: VoiceIndex
  onSelect: (index: VoiceIndex) => void
}> = ({ selected, onSelect }) => {
  const patch = usePatch()
  const localized = useLocalization()

  return (
    <section
      aria-label={localized["sequencer-voice-overview"]}
      className="flex flex-col gap-[0.15rem] border-t border-divider px-3 py-3"
    >
      {VOICES.map((index) => {
        const voice = patch.voices[index]
        return (
          <button
            key={index}
            type="button"
            aria-label={`${localized["sequencer-voice"]} ${index + 1} ${localized["sequencer-voice-overview-row"]}`}
            aria-current={index === selected}
            data-enabled={voice.enabled}
            className={cn(
              "flex items-center gap-2 rounded px-1 py-[0.3rem]",
              index === selected ? "bg-highlight" : "hover:bg-highlight",
              !voice.enabled && "opacity-55",
            )}
            style={voiceColor(index)}
            onClick={() => onSelect(index)}
          >
            <span className="w-3 flex-none text-tiny text-voice">
              {index + 1}
            </span>
            <span className="grid flex-1 grid-cols-16 gap-[0.2rem]">
              {voice.pattern.map((dot, dotIndex) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: a dot's index is its position in the pattern
                  key={dotIndex}
                  data-on={dot.on}
                  data-beyond={dotIndex >= voice.patternLength}
                  className={cn(
                    MINI_DOT,
                    dot.on
                      ? dot.probability < 100
                        ? "border-voice bg-transparent"
                        : "border-transparent bg-voice"
                      : "border-transparent bg-step",
                    dotIndex >= voice.patternLength && "opacity-25",
                  )}
                />
              ))}
            </span>
          </button>
        )
      })}
    </section>
  )
}
