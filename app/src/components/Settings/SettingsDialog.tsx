import { MAX_ACCENT_AMOUNT, MIN_ACCENT_AMOUNT } from "@midiseq/core"
import { FC, useState } from "react"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { useSettings } from "../../hooks/useSettings"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { themeNames } from "../../theme/Theme"
import { cn } from "../ui/cn"
import { Dialog } from "../ui/Dialog"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { MIDISettings } from "./MIDISettings"

type Tab = "general" | "midi"

const TABS: Tab[] = ["general", "midi"]

const ROW = "grid grid-cols-[6rem_1fr] items-center gap-3"

// Typed like the tempo: "25", "±25" and "+25" all mean the same thing.
const parseAmount = (text: string) => {
  const number = Number.parseFloat(text.replace(/[^0-9.]/g, ""))
  return Number.isFinite(number) ? Math.round(number) : null
}

const GeneralSettings: FC = () => {
  const { themeType, setThemeType } = useSettings()
  const { accentAmount, setAccentAmount } = useAccentAmount()
  const localized = useLocalization()

  return (
    <div className="flex flex-col gap-3 text-body text-fg-secondary">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the select is the row */}
      <label className={ROW}>
        {localized["sequencer-theme"]}
        <Select
          value={themeType}
          onChange={(event) =>
            setThemeType(event.target.value as (typeof themeNames)[number])
          }
        >
          {themeNames.map((name) => (
            <option key={name} value={name}>
              {localized[`sequencer-theme-${name}`]}
            </option>
          ))}
        </Select>
      </label>
      <div className={ROW}>
        <span>{localized["sequencer-accent-amount"]}</span>
        <div className="flex items-center gap-3">
          <div className="w-32 flex-none">
            <Stepper
              label={localized["sequencer-accent-amount"]}
              value={accentAmount}
              min={MIN_ACCENT_AMOUNT}
              max={MAX_ACCENT_AMOUNT}
              format={(amount) => `±${amount}`}
              parse={parseAmount}
              onChange={setAccentAmount}
            />
          </div>
          <span className="text-small text-fg-tertiary">
            <Localized name="sequencer-accent-amount-hint" />
          </span>
        </div>
      </div>
    </div>
  )
}

export const SettingsDialog: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>("midi")
  const localized = useLocalization()

  return (
    <Dialog
      title={localized["sequencer-settings"]}
      closeLabel={localized["sequencer-settings-close"]}
      onClose={onClose}
    >
      <nav className="flex w-28 flex-none flex-col gap-1">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
            className={cn(
              "rounded-sm px-3 py-2 text-left text-body",
              tab === name
                ? "bg-background-secondary text-fg"
                : "text-fg-secondary hover:bg-highlight",
            )}
          >
            <Localized name={`sequencer-settings-${name}`} />
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
        {tab === "general" ? <GeneralSettings /> : <MIDISettings />}
      </div>
    </Dialog>
  )
}
