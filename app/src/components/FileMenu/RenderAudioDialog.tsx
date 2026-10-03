import { FC, ReactNode, useEffect, useId, useRef, useState } from "react"
import {
  AudioRenderStatus,
  exportBaseNameFor,
  useAudioRender,
} from "../../actions/file"
import {
  AUDIO_CHANNELS,
  AUDIO_EXTENSIONS,
  AUDIO_FORMATS,
  MAX_TAIL_SECONDS,
  MP3_BITRATES,
  renderSeconds,
  SAMPLE_RATES,
  WAV_BIT_DEPTHS,
} from "../../audio/audioExport"
import { useAudioExportSettings } from "../../hooks/useAudioExportSettings"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { usePatch } from "../../hooks/usePatch"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { MAX_EXPORT_PASSES } from "../../stores/ExportSettingsStore"
import { Button, ButtonGroup } from "../ui/Button"
import { Checkbox } from "../ui/Checkbox"
import { cn } from "../ui/cn"
import { Dialog } from "../ui/Dialog"
import { Stepper } from "../ui/Stepper"

// a length of time as minutes and seconds
const clock = (seconds: number) => {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

const kHz = (rate: number) => `${rate / 1000} kHz`

// A setting's label, and its control beside it.
const Row: FC<{ label: ReactNode; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center gap-3">
    <span className="w-24 flex-none text-small">{label}</span>
    <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
  </div>
)

// One of a few choices, as a bar of radio buttons, the chosen one lit. The
// inputs are hidden but stay focusable, so the arrow keys move between them.
const Choice = <T extends string | number>({
  label,
  choices,
  value,
  name,
  onChange,
}: {
  label: string
  choices: readonly T[]
  value: T
  name: (choice: T) => string
  onChange: (choice: T) => void
}) => {
  const group = useId()
  return (
    <ButtonGroup role="radiogroup" aria-label={label}>
      {choices.map((choice) => {
        const chosen = choice === value
        return (
          <label
            key={choice}
            className={cn(
              "flex cursor-pointer items-center whitespace-nowrap px-[0.6rem] text-small has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-theme",
              chosen
                ? "bg-theme text-on-surface hover:brightness-110"
                : "bg-background-secondary text-fg hover:bg-highlight",
            )}
          >
            <input
              type="radio"
              name={group}
              checked={chosen}
              onChange={() => onChange(choice)}
              className="sr-only"
            />
            {name(choice)}
          </label>
        )
      })}
    </ButtonGroup>
  )
}

// A name typed with the extension on the end already doesn't get another.
const withoutExtension = (name: string) =>
  name.trim().replace(/\.(wav|mp3)$/i, "")

/**
 * File → Render Audio: the sequence played through the built-in sound's
 * SoundFont into a WAV or MP3 file, with the settings for each — which it
 * keeps for next time. Rendering asks where the file goes, then shows how
 * far along it is until it is written; closing the dialog meanwhile stops
 * it.
 */
export const RenderAudioDialog: FC<{ onClose: () => void }> = ({ onClose }) => {
  const patch = usePatch()
  const { soundFonts, sequencerStore } = useStores()
  const font = useMobxGetter(soundFonts, "selected")
  const { settings, set } = useAudioExportSettings()
  const localized = useLocalization()
  // the SoundFont's name sits inside the hint, in a colour of its own
  const [before, after] = localized["sequencer-render-hint"].split("{font}")
  const render = useAudioRender()
  const [name, setName] = useState(() =>
    exportBaseNameFor(sequencerStore.fileName, patch.name),
  )
  // null until Render is pressed, then where the render has got to
  const [status, setStatus] = useState<AudioRenderStatus | "picking" | null>(
    null,
  )
  const cancel = useRef<(() => void) | null>(null)
  // a render still going when the dialog goes is stopped with it
  useEffect(() => () => cancel.current?.(), [])

  const baseName = withoutExtension(name)
  const seconds = renderSeconds(patch, settings)
  // the sequence itself plays for no time at all: there is nothing to hear
  const silent = seconds === settings.tail
  const extension = AUDIO_EXTENSIONS[settings.format]

  const start = async () => {
    setStatus("picking")
    const job = render(baseName, setStatus)
    cancel.current = job.cancel
    const written = await job.done
    cancel.current = null
    if (written === null) {
      setStatus(null)
    } else {
      onClose()
    }
  }

  const stop = () => {
    cancel.current?.()
    onClose()
  }

  // the picker is up, over the options, until a place is chosen
  const picking = status === "picking"
  const rendering = status !== null && !picking

  return (
    <Dialog
      title={localized["sequencer-render-audio"]}
      closeLabel={localized["sequencer-export-cancel"]}
      onClose={rendering ? stop : onClose}
      medium
      footer={
        <>
          <Button type="button" onClick={rendering ? stop : onClose}>
            <Localized name="sequencer-export-cancel" />
          </Button>
          {!rendering && (
            <Button
              type="button"
              primary
              disabled={baseName === "" || silent || picking}
              onClick={() => void start()}
            >
              <Localized name="sequencer-render-audio-action" />
            </Button>
          )}
        </>
      }
    >
      {rendering ? (
        <Progress status={status} />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 text-body text-fg-secondary">
          <p className="m-0 text-small text-fg-tertiary">
            {before}
            <span className="text-fg-secondary">{font.name}</span>
            {after}
          </p>

          <Row label={<Localized name="sequencer-render-name" />}>
            <input
              type="text"
              aria-label={localized["sequencer-render-name"]}
              value={name}
              spellCheck={false}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && baseName !== "" && !picking) {
                  void start()
                }
              }}
              className="box-border h-[1.7rem] min-w-0 flex-1 rounded-sm border border-divider bg-background px-[0.4rem] text-body text-fg focus:border-theme focus:outline-none"
            />
            <span className="text-small text-fg-tertiary">{extension}</span>
          </Row>

          <Row label={<Localized name="sequencer-render-format" />}>
            <Choice
              label={localized["sequencer-render-format"]}
              choices={AUDIO_FORMATS}
              value={settings.format}
              name={(format) => localized[`sequencer-render-format-${format}`]}
              onChange={(format) => set("format", format)}
            />
          </Row>

          <Row label={<Localized name="sequencer-render-sample-rate" />}>
            <Choice
              label={localized["sequencer-render-sample-rate"]}
              choices={SAMPLE_RATES}
              value={settings.sampleRate}
              name={kHz}
              onChange={(rate) => set("sampleRate", rate)}
            />
          </Row>

          {settings.format === "wav" ? (
            <Row label={<Localized name="sequencer-render-bit-depth" />}>
              <Choice
                label={localized["sequencer-render-bit-depth"]}
                choices={WAV_BIT_DEPTHS}
                value={settings.wavBitDepth}
                name={(depth) =>
                  localized[`sequencer-render-bit-depth-${depth}`]
                }
                onChange={(depth) => set("wavBitDepth", depth)}
              />
            </Row>
          ) : (
            <Row label={<Localized name="sequencer-render-bitrate" />}>
              <Choice
                label={localized["sequencer-render-bitrate"]}
                choices={MP3_BITRATES}
                value={settings.mp3Bitrate}
                name={(kbps) => `${kbps} kbps`}
                onChange={(kbps) => set("mp3Bitrate", kbps)}
              />
            </Row>
          )}

          <Row label={<Localized name="sequencer-render-channels" />}>
            <Choice
              label={localized["sequencer-render-channels"]}
              choices={AUDIO_CHANNELS}
              value={settings.channels}
              name={(count) =>
                localized[
                  count === 1
                    ? "sequencer-render-channels-1"
                    : "sequencer-render-channels-2"
                ]
              }
              onChange={(count) => set("channels", count)}
            />
          </Row>

          <Row label={<Localized name="sequencer-export-passes" />}>
            <div className="w-28 flex-none">
              <Stepper
                label={localized["sequencer-export-passes"]}
                value={settings.passes}
                min={1}
                max={MAX_EXPORT_PASSES}
                onChange={(passes) => set("passes", passes)}
              />
            </div>
            <span className="text-small text-fg-tertiary" data-render-length>
              {clock(seconds)}
            </span>
          </Row>

          <Row label={<Localized name="sequencer-render-tail" />}>
            <div className="w-28 flex-none">
              <Stepper
                label={localized["sequencer-render-tail"]}
                value={settings.tail}
                min={0}
                max={MAX_TAIL_SECONDS}
                format={(tail) => `${tail} s`}
                parse={(text) => {
                  const tail = Number.parseFloat(text)
                  return Number.isFinite(tail) ? Math.round(tail) : null
                }}
                onChange={(tail) => set("tail", tail)}
              />
            </div>
            <span className="text-small text-fg-tertiary">
              <Localized name="sequencer-render-tail-note" />
            </span>
          </Row>

          <Checkbox
            label={localized["sequencer-render-normalize"]}
            note={localized["sequencer-render-normalize-note"]}
            checked={settings.normalize}
            onChange={(on) => set("normalize", on)}
          />
        </div>
      )}
    </Dialog>
  )
}

const PHASE_LABELS = {
  loading: "sequencer-render-loading",
  measure: "sequencer-render-measuring",
  render: "sequencer-render-rendering",
  saving: "sequencer-render-saving",
} as const

// How far along a render is: what it is doing, and a bar that fills as it
// goes — one that just waits while the SoundFont loads and the file is kept.
const Progress: FC<{ status: AudioRenderStatus }> = ({ status }) => {
  const localized = useLocalization()
  const done = "done" in status ? status.done : null
  const label = localized[PHASE_LABELS[status.phase]]
  const percent = done === null ? null : Math.round(done * 100)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 py-2">
      <div className="flex justify-between text-body text-fg">
        <output>{label}</output>
        {percent !== null && (
          <span className="font-mono text-fg-secondary">{percent}%</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={localized["sequencer-render-progress"]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? label : `${label} ${percent}%`}
        className="h-2 overflow-hidden rounded-full bg-background-secondary"
      >
        <div
          className={
            percent === null
              ? "h-full w-1/3 rounded-full bg-theme motion-safe:animate-pulse"
              : "h-full rounded-full bg-theme transition-[width] duration-150"
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
