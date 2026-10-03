import DeleteOutlineIcon from "mdi-react/DeleteOutlineIcon"
import InformationOutlineIcon from "mdi-react/InformationOutlineIcon"
import { ChangeEvent, FC, useId, useState } from "react"
import { useMIDIDevice } from "../../hooks/useMIDIDevice"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { errorMessage } from "../../localize/messages"
import {
  Localized,
  useFormat,
  useLocalization,
} from "../../localize/useLocalization"
import { track } from "../../services/analytics"
import { BUILTIN_OUTPUT } from "../../stores/MIDIDeviceStore"
import {
  SOUNDFONT_EXTENSIONS,
  SoundFontFile,
} from "../../stores/SoundFontStore"
import { IconButton } from "../ui/Button"
import { cn } from "../ui/cn"

const MESSAGE = "m-0 text-small text-fg-tertiary"

/**
 * The SoundFonts the built-in synth can play, as Signal lists them: the
 * factory set and any added from disk, one chosen. The choice loads straight
 * away where the synth is in use, and is remembered for the next visit.
 */
export const SoundFontSettings: FC = () => {
  const { soundFonts, synthStore } = useStores()
  const files = useMobxGetter(soundFonts, "files")
  const selectedId = useMobxGetter(soundFonts, "selectedId")
  const synthState = useMobxGetter(synthStore, "state")
  const synthError = useMobxGetter(synthStore, "error")
  const { outputNames } = useMIDIDevice()
  const localized = useLocalization()
  const format = useFormat()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<unknown>(null)

  const inUse = [...outputNames.all, ...outputNames.voices].includes(
    BUILTIN_OUTPUT,
  )

  const onAdd = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    // cleared, so the same file can be picked again
    input.value = ""
    if (file === undefined) {
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      await soundFonts.add(file.name, await file.arrayBuffer())
      track("soundfont_add")
    } catch (error) {
      setAddError(error)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 text-body text-fg-secondary">
      <p className={MESSAGE}>
        <Localized name="sequencer-soundfont-hint" />
      </p>

      <div
        role="radiogroup"
        aria-label={localized["sequencer-soundfont-list"]}
        className="flex flex-col"
      >
        {files.map((file) => (
          <SoundFontRow
            key={file.id}
            file={file}
            selected={file.id === selectedId}
            loading={
              inUse && file.id === selectedId && synthState === "loading"
            }
            onSelect={() => soundFonts.select(file.id)}
            onRemove={() => void soundFonts.remove(file.id)}
          />
        ))}
      </div>

      {inUse && synthState === "error" && (
        <p className={MESSAGE}>
          <Localized name="sequencer-synth-error" /> {synthError}
        </p>
      )}
      {!inUse && (
        <p className={MESSAGE}>
          <Localized name="sequencer-soundfont-off-hint" />
        </p>
      )}

      <div className="flex items-center gap-3">
        {/* a label round a hidden file input, so the button is the picker */}
        <label
          className={cn(
            "flex h-8 items-center rounded-sm bg-background-secondary px-3 text-body text-fg",
            adding
              ? "cursor-default opacity-40"
              : "cursor-pointer hover:bg-highlight",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-theme",
          )}
        >
          {adding ? (
            <Localized name="sequencer-soundfont-adding" />
          ) : (
            <Localized name="sequencer-soundfont-add" />
          )}
          <input
            type="file"
            accept={SOUNDFONT_EXTENSIONS.join(",")}
            disabled={adding}
            onChange={onAdd}
            className="sr-only"
          />
        </label>
        {addError !== null && (
          <p className={MESSAGE}>
            <Localized name="sequencer-soundfont-add-error" />{" "}
            {errorMessage(addError, format)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-md bg-background-secondary px-4 py-3 text-small text-fg">
        <InformationOutlineIcon size={18} className="flex-none" />
        <Localized name="sequencer-soundfont-saved-notice" />
      </div>
    </div>
  )
}

const SoundFontRow: FC<{
  file: SoundFontFile
  selected: boolean
  loading: boolean
  onSelect: () => void
  onRemove: () => void
}> = ({ file, selected, loading, onSelect, onRemove }) => {
  const format = useFormat()
  const remove = format("sequencer-soundfont-remove", { name: file.name })
  const creditId = useId()
  const { credit } = file

  return (
    <div className="flex flex-col">
      <div className="flex min-h-8 items-center gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-[0.3rem] text-body text-fg">
          <span className="relative inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border border-divider bg-background has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-theme">
            <input
              type="radio"
              name="soundfont"
              checked={selected}
              onChange={onSelect}
              aria-describedby={credit === undefined ? undefined : creditId}
              className="absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0"
            />
            {selected && <span className="h-2 w-2 rounded-full bg-fg" />}
          </span>
          <span className="min-w-0 truncate">{file.name}</span>
          {loading && (
            <output className="flex flex-none items-center gap-2 text-small text-fg-tertiary">
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border-2 border-fg-tertiary border-t-theme motion-safe:animate-spin"
              />
              <Localized name="sequencer-soundfont-loading" />
            </output>
          )}
        </label>
        {!file.builtIn && (
          <IconButton aria-label={remove} title={remove} onClick={onRemove}>
            <DeleteOutlineIcon size={16} />
          </IconButton>
        )}
      </div>
      {credit !== undefined && (
        // under the name: past the radio, its border and the gap
        <p
          id={creditId}
          className="m-0 pb-1 pl-[calc(1.75rem+2px)] text-small text-fg-tertiary"
        >
          {format("sequencer-soundfont-by", { author: credit.author })} ·{" "}
          <a
            href={credit.licenceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-fg-secondary underline hover:text-fg"
          >
            {credit.licence}
          </a>
        </p>
      )}
    </div>
  )
}
