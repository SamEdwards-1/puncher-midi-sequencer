import styled from "@emotion/styled"
import {
  Accent,
  Articulation,
  createDefaultPatternStep,
  PatternCondition,
  PatternStepJSON,
  Probability,
  Ratchet,
} from "@midiseq/core"
import { FC, useEffect, useRef } from "react"
import { usePatchEditor } from "../../actions/patch"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Field, Fields } from "../ui/Field"
import { Select } from "../ui/Select"

const Popup = styled.div`
  position: fixed;
  z-index: 20;
  width: 15rem;
  padding: 0.25rem 0.75rem 0.75rem;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-popup-border);
  border-radius: 0.5rem;
  box-shadow: 0 1rem 3rem var(--color-shadow);
`

const Title = styled.div`
  padding: 0.5rem 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
`

const ARTICULATIONS: Articulation[] = ["none", "hold", "tie"]
const ACCENTS: Accent[] = ["none", "+", "-"]
const RATCHETS: Ratchet[] = [1, 2, 3, 4]
const PROBABILITIES: Probability[] = [100, 90, 75, 67, 50, 33, 25, 10]
const CONDITIONS: PatternCondition[] = [
  "always",
  "2:2",
  "3:3",
  "4:4",
  "1x",
  "2x",
  "3x",
  "last",
  "notLast",
]

export interface StepOptionsProps {
  voiceIndex: number
  dotIndex: number
  dot: PatternStepJSON
  at: { x: number; y: number }
  onClose: () => void
}

export const StepOptions: FC<StepOptionsProps> = ({
  voiceIndex,
  dotIndex,
  dot,
  at,
  onClose,
}) => {
  const { editPatternStep } = usePatchEditor()
  const localized = useLocalization()
  const popup = useRef<HTMLDivElement>(null)

  // closes on a click elsewhere or on Escape
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  const change = (changes: Partial<PatternStepJSON>) =>
    editPatternStep(voiceIndex, dotIndex, changes)

  return (
    <Popup
      ref={popup}
      role="dialog"
      aria-label={`${localized["sequencer-voice-dot"]} ${dotIndex + 1}`}
      style={{ left: at.x, top: at.y }}
    >
      <Title>
        <Localized name="sequencer-voice-dot" /> {dotIndex + 1}
      </Title>
      <Fields>
        <Field label={localized["sequencer-dot-articulation"]}>
          <Select
            value={dot.articulation}
            onChange={(event) =>
              change({ articulation: event.target.value as Articulation })
            }
          >
            {ARTICULATIONS.map((value) => (
              <option key={value} value={value}>
                {localized[`sequencer-dot-articulation-${value}`]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-dot-accent"]}>
          <Select
            value={dot.accent}
            onChange={(event) =>
              change({ accent: event.target.value as Accent })
            }
          >
            {ACCENTS.map((value) => (
              <option key={value} value={value}>
                {value === "none" ? localized["sequencer-dot-none"] : value}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-dot-ratchet"]}>
          <Select
            value={String(dot.ratchet)}
            onChange={(event) =>
              change({ ratchet: Number(event.target.value) as Ratchet })
            }
          >
            {RATCHETS.map((value) => (
              <option key={value} value={value}>
                {value === 1 ? localized["sequencer-dot-none"] : `${value}x`}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-dot-probability"]}>
          <Select
            value={String(dot.probability)}
            onChange={(event) =>
              change({ probability: Number(event.target.value) as Probability })
            }
          >
            {PROBABILITIES.map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </Select>
        </Field>

        <Field label={localized["sequencer-dot-condition"]}>
          <Select
            value={dot.condition}
            onChange={(event) =>
              change({ condition: event.target.value as PatternCondition })
            }
          >
            {CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {value === "always"
                  ? localized["sequencer-dot-always"]
                  : value === "last"
                    ? localized["sequencer-dot-last"]
                    : value === "notLast"
                      ? localized["sequencer-dot-not-last"]
                      : value}
              </option>
            ))}
          </Select>
        </Field>
      </Fields>

      <Button
        type="button"
        onClick={() => {
          const fresh = createDefaultPatternStep()
          change({ ...fresh, on: dot.on })
          onClose()
        }}
      >
        <Localized name="sequencer-dot-reset" />
      </Button>
    </Popup>
  )
}
