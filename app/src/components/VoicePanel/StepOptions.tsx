import {
  Accent,
  Articulation,
  createDefaultPatternStep,
  PatternCondition,
  PatternStepJSON,
  Probability,
  playedVelocity,
  Ratchet,
  shownAccent,
  typedVelocityToDot,
} from "@midiseq/core"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { usePatchSelector } from "../../hooks/usePatch"
import { useCopiedDot } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Field, Fields } from "../ui/Field"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { usePopup } from "../ui/usePopup"

// digits are all a typed velocity means; the stepper clamps it to 1-127
const parseNumber = (text: string) => {
  const number = Number.parseInt(text.replace(/[^0-9]/g, ""), 10)
  return Number.isFinite(number) ? number : null
}

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
  const { editPatternStep, rearrangePattern } = usePatchEditor()
  const [copiedDot, setCopiedDot] = useCopiedDot()
  const { accentAmount } = useAccentAmount()
  const voiceVelocity = usePatchSelector(
    (patch) => patch.voices[voiceIndex].velocity,
    [voiceIndex],
  )
  const patternLength = usePatchSelector(
    (patch) => patch.voices[voiceIndex].patternLength,
    [voiceIndex],
  )
  const localized = useLocalization()
  // opened from a right-click, nudged inside the window, and closed on a
  // click elsewhere or on Escape
  const { popup, at } = usePopup(requestedAt, onClose)

  const change = (changes: Partial<PatternStepJSON>) =>
    editPatternStep(voiceIndex, dotIndex, changes)

  return (
    <div
      ref={popup}
      role="dialog"
      aria-label={`${localized["sequencer-voice"]} ${voiceIndex + 1} ${localized["sequencer-voice-dot"]} ${dotIndex + 1}`}
      // over the panel, not beside its scrollbar, so its gutters are whole
      className="fixed z-20 max-h-[calc(100vh-1rem)] w-60 overflow-y-auto rounded-lg border border-popup-border bg-background-secondary px-3 pt-1 pb-3 shadow-[0_1rem_3rem_var(--midiseq-shadow)] [--scrollbar-gutter:0px]"
      style={{ left: at.x, top: at.y }}
    >
      <div className="pt-2 pb-1 text-small font-semibold text-fg">
        <Localized name="sequencer-voice" /> {voiceIndex + 1} ·{" "}
        <Localized name="sequencer-voice-dot" /> {dotIndex + 1}
      </div>
      <div className="grid grid-cols-2 gap-1 border-b border-divider pb-2">
        <Button
          type="button"
          onClick={() => {
            setCopiedDot({ ...dot })
            onClose()
          }}
        >
          <Localized name="sequencer-dot-copy" />
        </Button>
        <Button
          type="button"
          disabled={copiedDot === null}
          onClick={() => {
            if (copiedDot !== null)
              editPatternStep(voiceIndex, dotIndex, copiedDot)
            onClose()
          }}
        >
          <Localized name="sequencer-dot-paste" />
        </Button>
        <Button
          type="button"
          disabled={dotIndex >= patternLength}
          onClick={() => {
            rearrangePattern(voiceIndex, dotIndex, "shift-left")
            onClose()
          }}
        >
          <Localized name="sequencer-dot-shift-left" />
        </Button>
        <Button
          type="button"
          disabled={dotIndex >= patternLength}
          onClick={() => {
            rearrangePattern(voiceIndex, dotIndex, "shift-right")
            onClose()
          }}
        >
          <Localized name="sequencer-dot-shift-right" />
        </Button>
        <Button
          type="button"
          disabled={dotIndex <= 0 || dotIndex >= patternLength}
          onClick={() => {
            rearrangePattern(voiceIndex, dotIndex, "swap-left")
            onClose()
          }}
        >
          <Localized name="sequencer-dot-swap-left" />
        </Button>
        <Button
          type="button"
          disabled={dotIndex >= patternLength - 1}
          onClick={() => {
            rearrangePattern(voiceIndex, dotIndex, "swap-right")
            onClose()
          }}
        >
          <Localized name="sequencer-dot-swap-right" />
        </Button>
        <Button
          type="button"
          disabled={dotIndex >= patternLength}
          onClick={() => {
            rearrangePattern(voiceIndex, dotIndex, "insert-before")
            onClose()
          }}
        >
          <Localized name="sequencer-dot-insert-before" />
        </Button>
        <Button
          type="button"
          disabled={dotIndex >= patternLength || dotIndex === 15}
          onClick={() => {
            rearrangePattern(voiceIndex, dotIndex, "insert-after")
            onClose()
          }}
        >
          <Localized name="sequencer-dot-insert-after" />
        </Button>
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

        <Field label={localized["sequencer-voice-velocity"]}>
          <Stepper
            label={localized["sequencer-voice-velocity"]}
            value={playedVelocity(voiceVelocity, accentAmount, dot)}
            min={1}
            max={127}
            parse={parseNumber}
            // exactly as typed or stepped: an accent only where it lands on
            // one, and one undo entry for a run of steps
            onChange={(velocity) =>
              editPatternStep(
                voiceIndex,
                dotIndex,
                typedVelocityToDot(voiceVelocity, accentAmount, velocity),
                `dot-velocity-${voiceIndex}-${dotIndex}`,
              )
            }
          />
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
            title={localized[`sequencer-dot-condition-${dot.condition}-hint`]}
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
