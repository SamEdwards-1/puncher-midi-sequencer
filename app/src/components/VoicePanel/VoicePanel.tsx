import styled from "@emotion/styled"
import {
  MAX_PATTERN_LENGTH,
  PACE_LABELS,
  PaceId,
  PatternStepJSON,
  VOICE_PACES,
  VoiceIndex,
  VoiceRule,
} from "@midiseq/core"
import { FC, useState } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useSelectedVoice } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Field, Fields } from "../ui/Field"
import { Panel, PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"
import { Slider } from "../ui/Slider"
import { Stepper } from "../ui/Stepper"
import { Toggle } from "../ui/Toggle"
import { StepOptions } from "./StepOptions"

const RightPanel = styled(Panel)`
  border-left: 1px solid var(--color-divider);
`

const Tabs = styled.div`
  display: flex;
  border-bottom: 1px solid var(--color-divider);
`

const Tab = styled.button`
  flex: 1;
  height: 2.25rem;
  border: none;
  border-bottom: 0.15rem solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    background: var(--color-highlight);
  }

  &[data-active="true"] {
    color: var(--color-text);
    border-bottom-color: var(--color-theme);
  }

  &[data-enabled="false"] {
    opacity: 0.55;
  }
`

const Dots = styled.div`
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.3rem;
  padding: 0 1rem 1rem;
`

/**
 * A dot shows its own step options: a ratchet count sits inside it, an accent
 * makes it bigger or smaller, a probability below 100% hollows it out, a hold
 * or tie draws a tail towards the next dot, and a condition marks the corner.
 */
const Dot = styled.button`
  position: relative;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--color-step);
  color: var(--color-on-surface);
  font-family: var(--font-mono);
  font-size: 0.55rem;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.1s ease;

  &[data-on="true"] {
    background: var(--color-theme);
  }

  &[data-beyond="true"] {
    opacity: 0.25;
  }

  /* played only sometimes: hollow, so it reads as less certain */
  &[data-chance="true"][data-on="true"] {
    background: transparent;
    border-color: var(--color-theme);
    color: var(--color-text);
  }

  &[data-accent="+"] {
    transform: scale(1.15);
  }

  &[data-accent="-"] {
    transform: scale(0.8);
  }

  /* a tail towards the next dot: solid for a hold, hollow for a tie */
  &[data-articulation="hold"]::before,
  &[data-articulation="tie"]::before {
    content: "";
    position: absolute;
    top: 50%;
    right: -0.35rem;
    width: 0.35rem;
    height: 0.16rem;
    transform: translateY(-50%);
    background: var(--color-theme);
  }

  &[data-articulation="tie"]::before {
    height: 0.16rem;
    background: transparent;
    border-top: 2px solid var(--color-theme);
  }

  /* the dot whose options are open */
  &[data-editing="true"] {
    outline: 2px solid var(--color-text);
    outline-offset: 2px;
  }

  /* a condition is otherwise invisible, so it marks the corner */
  &[data-condition="true"]::after {
    content: "";
    position: absolute;
    right: -0.1rem;
    top: -0.1rem;
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    background: var(--color-yellow);
  }
`

const Hint = styled.div`
  padding: 0 1rem 1rem;
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
`

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
    <RightPanel aria-label={localized["sequencer-voices"]}>
      <PanelHeader>
        <Localized name="sequencer-voices" />
      </PanelHeader>

      <Tabs>
        {VOICES.map((index) => (
          <Tab
            key={index}
            type="button"
            data-active={index === selected}
            data-enabled={patch.voices[index].enabled}
            aria-label={`${localized["sequencer-voice"]} ${index + 1}`}
            onClick={() => setSelected(index)}
          >
            {index + 1}
          </Tab>
        ))}
      </Tabs>

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
            {VOICE_PACES.map((pace) => (
              <option key={pace} value={pace}>
                {PACE_LABELS[pace]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-voice-length"]}>
          <Slider
            type="range"
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

      <Dots>
        {voice.pattern.map((dot, index) => (
          <Dot
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
          </Dot>
        ))}
      </Dots>
      <Hint>
        <Localized name="sequencer-dot-hint" />
      </Hint>

      {options !== null && (
        <StepOptions
          voiceIndex={selected}
          dotIndex={options.dotIndex}
          dot={voice.pattern[options.dotIndex]}
          at={options.at}
          onClose={() => setOptions(null)}
        />
      )}
    </RightPanel>
  )
}
