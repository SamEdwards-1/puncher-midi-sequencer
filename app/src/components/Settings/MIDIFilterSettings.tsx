import {
  ALL_CCS,
  ALL_CHANNELS,
  ccName,
  MAX_NOTE_NUMBER,
  MAX_TRANSPOSE,
  MIN_NOTE_NUMBER,
  MIN_TRANSPOSE,
  noteNumberToName,
} from "@midiseq/core"
import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import ChevronRightIcon from "mdi-react/ChevronRightIcon"
import { FC, ReactNode, useState } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Button } from "../ui/Button"
import { Checkbox } from "../ui/Checkbox"
import { cn } from "../ui/cn"
import { parseNoteText, sanitizeNoteText } from "../ui/noteInput"
import { Stepper } from "../ui/Stepper"

const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center gap-3 py-1">
    <span className="w-28 flex-none text-body text-fg-secondary">{label}</span>
    {children}
  </div>
)

const parseSigned = (text: string) => {
  const number = Number.parseInt(text.replace(/[^0-9-]/g, ""), 10)
  return Number.isFinite(number) ? number : null
}

/**
 * What the chosen inputs are allowed to send in. Everything here is about the
 * keyboard rather than the music, so it is kept with the other settings and
 * never saved in a patch.
 */
export const MIDIFilterSettings: FC = () => {
  const { filter, setFilter } = useMIDIDevice()
  const localized = useLocalization()
  const [ccsOpen, setCCsOpen] = useState(false)

  const toggleChannel = (channel: number, on: boolean) =>
    setFilter({
      channels: on
        ? [...filter.channels, channel].sort((a, b) => a - b)
        : filter.channels.filter((current) => current !== channel),
    })

  const toggleCC = (cc: number, on: boolean) =>
    setFilter({
      ccs: on
        ? [...filter.ccs, cc].sort((a, b) => a - b)
        : filter.ccs.filter((current) => current !== cc),
    })

  return (
    <section className="flex flex-col gap-2 pt-4">
      <h3 className="m-0 border-t border-divider pt-4 text-small font-semibold text-fg">
        <Localized name="sequencer-filter" />
      </h3>
      <p className="m-0 text-tiny text-fg-tertiary">
        <Localized name="sequencer-filter-hint" />
      </p>

      <Field label={localized["sequencer-filter-channels"]}>
        <div className="flex flex-wrap gap-1">
          {ALL_CHANNELS.map((channel) => {
            const on = filter.channels.includes(channel)
            return (
              <button
                key={channel}
                type="button"
                aria-label={`${localized["sequencer-midi-channel"]} ${channel}`}
                aria-pressed={on}
                onClick={() => toggleChannel(channel, !on)}
                className={cn(
                  "h-6 w-7 rounded-sm text-tiny",
                  on
                    ? "bg-theme text-on-surface"
                    : "bg-background-secondary text-fg-secondary hover:bg-highlight",
                )}
              >
                {channel}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setFilter({ channels: [] })}
          >
            <Localized name="sequencer-filter-none" />
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setFilter({ channels: [...ALL_CHANNELS] })}
          >
            <Localized name="sequencer-filter-all" />
          </Button>
        </div>
      </Field>

      <Field label={localized["sequencer-filter-range"]}>
        <div className="flex flex-1 items-center gap-2">
          <div className="w-24">
            <Stepper
              label={localized["sequencer-filter-low"]}
              value={filter.noteLow}
              min={MIN_NOTE_NUMBER}
              max={filter.noteHigh}
              format={noteNumberToName}
              parse={(text) => parseNoteText(text, filter.noteLow)}
              sanitize={sanitizeNoteText}
              onChange={(noteLow) => setFilter({ noteLow })}
            />
          </div>
          <span className="text-tiny text-fg-tertiary">–</span>
          <div className="w-24">
            <Stepper
              label={localized["sequencer-filter-high"]}
              value={filter.noteHigh}
              min={filter.noteLow}
              max={MAX_NOTE_NUMBER}
              format={noteNumberToName}
              parse={(text) => parseNoteText(text, filter.noteHigh)}
              sanitize={sanitizeNoteText}
              onChange={(noteHigh) => setFilter({ noteHigh })}
            />
          </div>
        </div>
      </Field>

      <Field label={localized["sequencer-filter-transpose"]}>
        <div className="w-36">
          <Stepper
            label={localized["sequencer-filter-transpose"]}
            value={filter.transpose}
            min={MIN_TRANSPOSE}
            max={MAX_TRANSPOSE}
            format={(value) =>
              `${value > 0 ? "+" : ""}${value} ${localized["sequencer-filter-semitones"]}`
            }
            parse={parseSigned}
            onChange={(transpose) => setFilter({ transpose })}
          />
        </div>
      </Field>

      <button
        type="button"
        aria-expanded={ccsOpen}
        onClick={() => setCCsOpen(!ccsOpen)}
        className="flex items-center gap-1 py-1 text-body text-fg"
      >
        {ccsOpen ? (
          <ChevronDownIcon size={16} />
        ) : (
          <ChevronRightIcon size={16} />
        )}
        <Localized name="sequencer-filter-ccs" />
        <span className="text-tiny text-fg-tertiary">
          {filter.ccs.length} / {ALL_CCS.length}
        </span>
      </button>

      {ccsOpen && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setFilter({ ccs: [] })}
            >
              <Localized name="sequencer-filter-none" />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setFilter({ ccs: [...ALL_CCS] })}
            >
              <Localized name="sequencer-filter-all" />
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-sm border border-divider px-3 py-1">
            {ALL_CCS.map((cc) => (
              <Checkbox
                key={cc}
                label={`${cc} ${ccName(cc)}`}
                checked={filter.ccs.includes(cc)}
                onChange={(on) => toggleCC(cc, on)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
