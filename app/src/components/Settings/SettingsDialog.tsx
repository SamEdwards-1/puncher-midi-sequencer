import {
  MAX_ACCENT_AMOUNT,
  MIN_ACCENT_AMOUNT,
  sequenceCCs,
} from "@midiseq/core"
import { FC, useMemo } from "react"
import { useAccentAmount } from "../../hooks/useAccentAmount"
import { useImportSettings } from "../../hooks/useImportSettings"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePatch } from "../../hooks/usePatch"
import { useSettings } from "../../hooks/useSettings"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { IMPORT_SNAPS } from "../../stores/ImportSettingsStore"
import { SETTINGS_TABS } from "../../stores/SettingsTabStore"
import { THEME_MODES, ThemeKind, themesOfKind } from "../../theme/Theme"
import { ExportOptions } from "../FileMenu/ExportOptions"
import { Button } from "../ui/Button"
import { Checkbox } from "../ui/Checkbox"
import { cn } from "../ui/cn"
import { Dialog } from "../ui/Dialog"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { MIDISettings } from "./MIDISettings"
import { SoundFontSettings } from "./SoundFontSettings"

const ROW = "grid grid-cols-[6rem_1fr] items-center gap-3"

// Typed like the tempo: "25", "±25" and "+25" all mean the same thing.
const parseAmount = (text: string) => {
  const number = Number.parseFloat(text.replace(/[^0-9.]/g, ""))
  return Number.isFinite(number) ? Math.round(number) : null
}

const GeneralSettings: FC = () => {
  const { accentAmount, setAccentAmount } = useAccentAmount()
  const localized = useLocalization()

  return (
    <div className="flex flex-col gap-3 text-body text-fg-secondary">
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

// Light, dark or the system's way, and the theme to wear for each: the
// dark one's list is the dark themes, the light one's the light. Only the
// ones the mode can reach are shown.
const ThemeSettings: FC = () => {
  const { themeChoice, setThemeChoice } = useSettings()
  const localized = useLocalization()
  const { mode } = themeChoice

  const picker = (kind: ThemeKind) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: the select is the row
    <label className={ROW}>
      {localized[`sequencer-theme-${kind}-theme`]}
      <Select
        value={themeChoice[kind]}
        onChange={(event) => setThemeChoice({ [kind]: event.target.value })}
      >
        {themesOfKind(kind).map((theme) => (
          <option key={theme.id} value={theme.id}>
            {"name" in theme
              ? theme.name
              : localized["sequencer-theme-default"]}
          </option>
        ))}
      </Select>
    </label>
  )

  return (
    <div className="flex flex-col gap-3 text-body text-fg-secondary">
      <div className={ROW}>
        <span>{localized["sequencer-theme-mode"]}</span>
        <div className="flex gap-1">
          {THEME_MODES.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              active={mode === option}
              aria-pressed={mode === option}
              onClick={() => setThemeChoice({ mode: option })}
            >
              <Localized name={`sequencer-theme-mode-${option}`} />
            </Button>
          ))}
        </div>
      </div>
      {mode === "system" && (
        <p className="m-0 -mt-1 pl-[calc(6rem+0.75rem)] text-small text-fg-tertiary">
          <Localized name="sequencer-theme-system-hint" />
        </p>
      )}
      {mode !== "light" && picker("dark")}
      {mode !== "dark" && picker("light")}
    </div>
  )
}

// The export's settings, with the CCs of the sequence as it stands.
const ExportSettings: FC = () => {
  const patch = usePatch()
  const ccs = useMemo(() => sequenceCCs(patch), [patch])
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-small text-fg-tertiary">
        <Localized name="sequencer-export-settings-hint" />
      </p>
      <ExportOptions ccs={ccs} passes />
    </div>
  )
}

// Where a MIDI import starts.
const ImportSettings: FC = () => {
  const settings = useImportSettings()
  const localized = useLocalization()
  return (
    <div className="flex flex-col gap-2 text-body text-fg-secondary">
      <p className="m-0 mb-2 text-small text-fg-tertiary">
        <Localized name="sequencer-import-settings-hint" />
      </p>
      <Checkbox
        label={localized["sequencer-import-skip-drums"]}
        note={localized["sequencer-import-skip-drums-note"]}
        checked={settings.skipDrums}
        onChange={(on) => settings.set("skipDrums", on)}
      />
      <Checkbox
        label={localized["sequencer-import-ccs-default"]}
        checked={settings.ccs}
        onChange={(on) => settings.set("ccs", on)}
      />
      <Checkbox
        label={localized["sequencer-import-loop"]}
        checked={settings.loop}
        onChange={(on) => settings.set("loop", on)}
      />
      <Checkbox
        label={localized["sequencer-import-tempo"]}
        checked={settings.fileTempo}
        onChange={(on) => settings.set("fileTempo", on)}
      />
      <div className="mt-2 flex items-center gap-3">
        <span className="text-small">
          <Localized name="sequencer-import-snap-setting" />
        </span>
        <div className="flex gap-1">
          {IMPORT_SNAPS.map((snap) => (
            <Button
              key={snap}
              type="button"
              size="sm"
              active={settings.snap === snap}
              aria-pressed={settings.snap === snap}
              onClick={() => settings.set("snap", snap)}
            >
              <Localized name={`sequencer-import-snap-${snap}`} />
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

export const SettingsDialog: FC<{ onClose: () => void }> = ({ onClose }) => {
  // General the first time, then the group that was open last
  const { settingsTab } = useStores()
  const tab = useMobxGetter(settingsTab, "tab")
  const setTab = settingsTab.set
  const localized = useLocalization()

  return (
    <Dialog
      title={localized["sequencer-settings"]}
      closeLabel={localized["sequencer-settings-close"]}
      onClose={onClose}
    >
      <nav className="flex w-28 flex-none flex-col gap-1">
        {SETTINGS_TABS.map((name) => (
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
        {tab === "general" ? (
          <GeneralSettings />
        ) : tab === "theme" ? (
          <ThemeSettings />
        ) : tab === "midi" ? (
          <MIDISettings />
        ) : tab === "soundfont" ? (
          <SoundFontSettings />
        ) : tab === "export" ? (
          <ExportSettings />
        ) : (
          <ImportSettings />
        )}
      </div>
    </Dialog>
  )
}
