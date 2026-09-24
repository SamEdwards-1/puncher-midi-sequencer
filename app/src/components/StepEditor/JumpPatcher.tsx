import { createDefaultJump, JumpJSON, JumpRule } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import CrosshairsGpsIcon from "mdi-react/CrosshairsGpsIcon"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useGridMode, useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { IconButton } from "../ui/Button"
import { Select } from "../ui/Select"

const VALUE = "font-mono text-fg"

// The rules a jump can follow, flattened for a select.
const RULES: { value: string; label: string }[] = [
  { value: "always", label: "Always" },
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
    value: `times:${n}`,
    label: `${n}x`,
  })),
  ...[2, 3, 4, 5, 6, 7, 8].map((n) => ({
    value: `every:${n}`,
    label: `${n}:${n}`,
  })),
  ...[10, 25, 33, 50, 67, 75, 90].map((pct) => ({
    value: `chance:${pct}`,
    label: `${pct}%`,
  })),
  { value: "last", label: "Last" },
  { value: "notLast", label: "Not last" },
]

const ruleValue = (rule: JumpRule): string => {
  switch (rule.kind) {
    case "times":
      return `times:${rule.n}`
    case "every":
      return `every:${rule.n}`
    case "chance":
      return `chance:${rule.pct}`
    default:
      return rule.kind
  }
}

const parseRule = (value: string): JumpRule => {
  const [kind, amount] = value.split(":")
  switch (kind) {
    case "times":
      return { kind: "times", n: Number(amount) as 1 }
    case "every":
      return { kind: "every", n: Number(amount) as 2 }
    case "chance":
      return { kind: "chance", pct: Number(amount) as 10 }
    case "last":
      return { kind: "last" }
    case "notLast":
      return { kind: "notLast" }
    default:
      return { kind: "always" }
  }
}

// A jump that does anything: somewhere to go, a rule other than always, or a
// step to carry on to.
export const hasJump = (jump: JumpJSON) =>
  jump.dest !== null || jump.normal !== null || jump.rule.kind !== "always"

/**
 * The step's own jump, on one row, so it sits in the step editor: the step it
 * leaves from is the one the editor is on. Its X takes the whole jump away.
 */
export const JumpPatcher: FC<{ onRemove: () => void }> = ({ onRemove }) => {
  const patch = usePatch()
  const [selected] = useSelectedStep()
  const [mode, setMode] = useGridMode()
  const { editJump } = usePatchEditor()
  const localized = useLocalization()

  const jump = patch.steps[selected].jump
  const picking = mode === "dest" || mode === "normal"

  const target = (
    kind: "dest" | "normal",
    label: string,
    value: number | null,
    emptyLabel: string,
  ) => (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <span className={VALUE}>{value === null ? emptyLabel : value + 1}</span>
      <IconButton
        aria-label={`${localized["sequencer-jump-pick"]} ${label.toLowerCase()}`}
        title={`${localized["sequencer-jump-pick"]} ${label.toLowerCase()}`}
        aria-pressed={mode === kind}
        active={mode === kind}
        onClick={() => setMode(mode === kind ? null : kind)}
      >
        <CrosshairsGpsIcon size={16} />
      </IconButton>
    </div>
  )

  const remove = () => {
    if (picking) {
      setMode(null)
    }
    editJump(selected, createDefaultJump())
    onRemove()
  }

  return (
    <div className="-mx-4 flex flex-col gap-2 border-t border-divider px-4 pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-[0.4rem]">
          <label htmlFor="jump-rule">{localized["sequencer-jump-rule"]}</label>
          <Select
            id="jump-rule"
            value={ruleValue(jump.rule)}
            onChange={(event) =>
              editJump(selected, { rule: parseRule(event.target.value) })
            }
          >
            {RULES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {target(
          "dest",
          localized["sequencer-jump-dest"],
          jump.dest,
          localized["sequencer-jump-none"],
        )}
        {target(
          "normal",
          localized["sequencer-jump-normal"],
          jump.normal,
          localized["sequencer-jump-next"],
        )}
        <IconButton
          aria-label={localized["sequencer-jump-remove"]}
          title={localized["sequencer-jump-remove"]}
          onClick={remove}
        >
          <CloseIcon size={16} />
        </IconButton>
      </div>

      {picking && (
        <div className="text-small text-fg-secondary">
          <Localized name="sequencer-jump-hint" />
        </div>
      )}
    </div>
  )
}
