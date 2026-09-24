import {
  Accent,
  Articulation,
  createDefaultPatternStep,
  PatternCondition,
  PatternStepJSON,
  Probability,
  Ratchet,
  shownAccent,
} from "@midiseq/core"
import { FC, useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { usePatch } from "../../hooks/usePatch"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Field, Fields } from "../ui/Field"
import { Select } from "../ui/Select"

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
  at: requestedAt,
  onClose,
}) => {
  const { editPatternStep } = usePatchEditor()
  const { accentAmount } = useAccentAmount()
  const voiceVelocity = usePatch().voices[voiceIndex].velocity
  const localized = useLocalization()
  const popup = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(requestedAt)

  // Opened from a right-click, so it can be asked for at the very edge of the
  // window; it is nudged back inside once its size is known.
  useLayoutEffect(() => {
    const element = popup.current
    if (element === null) {
      return
    }
    const { width, height } = element.getBoundingClientRect()
    const margin = 8
    setAt({
      x: Math.min(
        Math.max(margin, requestedAt.x),
        window.innerWidth - width - margin,
      ),
      y: Math.min(
        Math.max(margin, requestedAt.y),
        window.innerHeight - height - margin,
      ),
    })
  }, [requestedAt])

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
    <div
      ref={popup}
      role="dialog"
      aria-label={`${localized["sequencer-voice"]} ${voiceIndex + 1} ${localized["sequencer-voice-dot"]} ${dotIndex + 1}`}
      className="fixed z-20 w-60 rounded-lg border border-popup-border bg-background-secondary px-3 pt-1 pb-3 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
      style={{ left: at.x, top: at.y }}
    >
      <div className="pt-2 pb-1 text-small font-semibold text-fg">
        <Localized name="sequencer-voice" /> {voiceIndex + 1} ·{" "}
        <Localized name="sequencer-voice-dot" /> {dotIndex + 1}
      </div>
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
            value={shownAccent(voiceVelocity, accentAmount, dot)}
            // an accent picked here is exactly that accent, so it clears any
            // velocity of the dot's own
            onChange={(event) =>
              change({
                accent: event.target.value as Accent,
                velocityOffset: 0,
              })
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
    </div>
  )
}
