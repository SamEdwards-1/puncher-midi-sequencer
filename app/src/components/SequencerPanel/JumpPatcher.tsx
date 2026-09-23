import { JumpRule } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useGridMode, useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { ButtonField, Field, Fields } from "../ui/Field"
import { PanelHeader } from "../ui/Panel"
import { Select } from "../ui/Select"

const VALUE = "grow font-mono text-fg"

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

export const JumpPatcher: FC = () => {
  const patch = usePatch()
  const [selected] = useSelectedStep()
  const [mode, setMode] = useGridMode()
  const { editJump } = usePatchEditor()
  const localized = useLocalization()

  const jump = patch.steps[selected].jump

  const target = (
    kind: "dest" | "normal",
    value: number | null,
    emptyLabel: string,
  ) => (
    <div className="flex items-center gap-[0.4rem]">
      <span className={VALUE}>{value === null ? emptyLabel : value + 1}</span>
      <Button
        type="button"
        size="sm"
        active={mode === kind}
        onClick={() => setMode(mode === kind ? null : kind)}
      >
        <Localized name="sequencer-jump-pick" />
      </Button>
      <Button
        type="button"
        size="sm"
        aria-label={`${localized["sequencer-jump-clear"]} ${kind}`}
        disabled={value === null}
        onClick={() => editJump(selected, { [kind]: null })}
      >
        <CloseIcon size={14} />
      </Button>
    </div>
  )

  return (
    <>
      <PanelHeader>
        <Localized name="sequencer-jumps" />
      </PanelHeader>
      <Fields>
        <ButtonField label={localized["sequencer-jump-source"]}>
          <span className={VALUE}>{selected + 1}</span>
        </ButtonField>

        <Field label={localized["sequencer-jump-rule"]}>
          <Select
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
        </Field>

        <ButtonField label={localized["sequencer-jump-dest"]}>
          {target("dest", jump.dest, localized["sequencer-jump-none"])}
        </ButtonField>

        <ButtonField label={localized["sequencer-jump-normal"]}>
          {target("normal", jump.normal, localized["sequencer-jump-next"])}
        </ButtonField>
      </Fields>

      {(mode === "dest" || mode === "normal") && (
        <div className="px-4 pb-3 text-small text-fg-secondary">
          <Localized name="sequencer-jump-hint" />
        </div>
      )}
    </>
  )
}
