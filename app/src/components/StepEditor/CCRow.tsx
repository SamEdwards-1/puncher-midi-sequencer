import { CCEventJSON } from "@midiseq/core"
import CloseIcon from "mdi-react/CloseIcon"
import { FC, ReactNode } from "react"
import { useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Stepper } from "../ui/Stepper"

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

export const CCRow: FC<{
  cc: CCEventJSON
  onChange: (changes: Partial<Omit<CCEventJSON, "id">>) => void
  onRemove: () => void
}> = ({ cc, onChange, onRemove }) => {
  const localized = useLocalization()
  const number = localized["sequencer-step-cc"]
  const value = localized["sequencer-step-cc-value"]
  const channel = localized["sequencer-midi-channel"]

  return (
    <div className="flex items-end gap-2">
      <Labelled label={number}>
        <Stepper
          label={`${number} ${cc.id}`}
          value={cc.cc}
          min={0}
          max={127}
          parse={parseNumber}
          onChange={(next) => onChange({ cc: next })}
        />
      </Labelled>
      <Labelled label={value}>
        <Stepper
          label={`${value} ${cc.id}`}
          value={cc.value}
          min={0}
          max={127}
          parse={parseNumber}
          onChange={(next) => onChange({ value: next })}
        />
      </Labelled>
      <Labelled label={channel}>
        <Stepper
          label={`${channel} ${cc.id}`}
          value={cc.channel}
          min={1}
          max={16}
          parse={parseNumber}
          onChange={(next) => onChange({ channel: next })}
        />
      </Labelled>
      <Button
        type="button"
        size="sm"
        aria-label={`${localized["sequencer-step-remove-cc"]} ${cc.id}`}
        onClick={onRemove}
      >
        <CloseIcon size={14} />
      </Button>
    </div>
  )
}
