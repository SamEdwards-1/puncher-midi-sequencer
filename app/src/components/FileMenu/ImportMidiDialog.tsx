import {
  ALL_CCS,
  ALL_CHANNELS,
  CC_NAMES,
  DRUM_CHANNEL,
  ENVELOPE_RESOLUTION,
  importPitchWeights,
  importPlan,
  MAX_NOTE_NUMBER,
  MAX_STEPS,
  MIDIFilterJSON,
  MIN_NOTE_NUMBER,
  MidiFileCC,
  MidiImportOptions,
  MidiSource,
  NOTE_OFF_SCALE,
  NOTE_QUIET,
  NOTES_PER_STEP,
  noteNumberToName,
  PreparedMidi,
  ScaleJSON,
  sourceKey,
  stepCount,
} from "@midiseq/core"
import {
  CSSProperties,
  FC,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { usePatchEditor } from "../../actions/patch"
import { useImportSettings } from "../../hooks/useImportSettings"
import { usePatch } from "../../hooks/usePatch"
import { useStores } from "../../hooks/useStores"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { IMPORT_SNAPS, ImportSnap } from "../../stores/ImportSettingsStore"
import { guessScales } from "../../theory/scales"
import { FitButtons, ScaleGuesses, ScaleSelects } from "../Scale/ScalePicker"
import { MIDIFilterFields } from "../Settings/MIDIFilterSettings"
import { Accordion } from "../ui/Accordion"
import { Button } from "../ui/Button"
import { Checkbox } from "../ui/Checkbox"
import { Dialog } from "../ui/Dialog"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import {
  ImportRange,
  MidiPreview,
  NoteRange,
  PREVIEW_HEIGHT,
  sourceColour,
} from "./MidiPreview"

const ccKey = ({ cc, channel }: { cc: number; channel: number }) =>
  `${channel}:${cc}`

// The roll's height: all of it on a tall screen, less on a short one, so
// the options under it keep room to scroll.
const rollHeightFor = (viewport: number) =>
  Math.round(Math.min(PREVIEW_HEIGHT, Math.max(120, viewport * 0.28)))

const useRollHeight = () => {
  const [height, setHeight] = useState(() => rollHeightFor(window.innerHeight))
  useEffect(() => {
    const measure = () => setHeight(rollHeightFor(window.innerHeight))
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  return height
}

const toggled = <T,>(set: Set<T>, key: T, on: boolean) => {
  const next = new Set(set)
  if (on) {
    next.add(key)
  } else {
    next.delete(key)
  }
  return next
}

// Whether a filter lets everything through, as a fresh one does.
const letsAllThrough = (filter: MIDIFilterJSON) =>
  filter.channels.length === ALL_CHANNELS.length &&
  filter.ccs.length === ALL_CCS.length &&
  filter.noteLow === MIN_NOTE_NUMBER &&
  filter.noteHigh === MAX_NOTE_NUMBER &&
  filter.transpose === 0

// A labelled area of the dialog, with room for a control beside its label.
const Section: FC<{
  label: string
  aside?: ReactNode
  children: ReactNode
}> = ({ label, aside, children }) => (
  <section className="flex min-w-0 flex-col gap-1">
    <div className="flex items-center justify-between gap-3">
      <h3 className="m-0 text-small font-normal text-fg-secondary">{label}</h3>
      {aside}
    </div>
    {children}
  </section>
)

// The file's parts to choose from. Kept apart, so dragging the range
// doesn't draw them again.
const Parts: FC<{
  sources: MidiSource[]
  chosen: Set<string>
  heard: (channel: number) => boolean
  onToggle: (key: string, on: boolean) => void
  onAll: (on: boolean) => void
}> = memo(({ sources, chosen, heard, onToggle, onAll }) => {
  const localized = useLocalization()
  return (
    <Section
      label={localized["sequencer-import-parts"]}
      aside={
        sources.length > 0 && (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              disabled={chosen.size === sources.length}
              onClick={() => onAll(true)}
            >
              <Localized name="sequencer-import-all-parts" />
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={chosen.size === 0}
              onClick={() => onAll(false)}
            >
              <Localized name="sequencer-import-no-parts" />
            </Button>
          </div>
        )
      }
    >
      {sources.length === 0 ? (
        <p className="m-0 py-[0.3rem] text-small text-fg-tertiary">
          <Localized name="sequencer-import-no-notes" />
        </p>
      ) : (
        <fieldset
          aria-label={localized["sequencer-import-parts"]}
          className="m-0 flex max-h-44 min-w-0 flex-col overflow-y-auto border-0 p-0"
        >
          {sources.map((source, index) => (
            <div
              key={sourceKey(source)}
              className="[&_svg]:text-[var(--source)]"
              style={{ "--source": sourceColour(index) } as CSSProperties}
            >
              <Checkbox
                label={`${source.name === "" ? `${localized["sequencer-import-track"]} ${source.track + 1}` : source.name} · ${localized["sequencer-step-cc-channel-short"]} ${source.channel}`}
                checked={chosen.has(sourceKey(source))}
                note={[
                  `${source.notes} ${localized["sequencer-import-notes"]}`,
                  `${noteNumberToName(source.low)}–${noteNumberToName(source.high)}`,
                  ...(source.channel === DRUM_CHANNEL
                    ? [localized["sequencer-import-drums"]]
                    : []),
                  ...(heard(source.channel)
                    ? []
                    : [localized["sequencer-import-filtered"]]),
                ].join(" · ")}
                onChange={(on) => onToggle(sourceKey(source), on)}
              />
            </div>
          ))}
        </fieldset>
      )}
    </Section>
  )
})

// The file's controllers to choose from; those the filter keeps out can't
// be chosen.
const Controllers: FC<{
  ccs: MidiFileCC[]
  chosen: Set<string>
  allowed: (cc: MidiFileCC) => boolean
  onToggle: (key: string, on: boolean) => void
  onAll: (on: boolean) => void
}> = memo(({ ccs, chosen, allowed, onToggle, onAll }) => {
  const localized = useLocalization()
  const open = ccs.filter(allowed)
  const all = open.length > 0 && open.every((each) => chosen.has(ccKey(each)))
  const some = open.some((each) => chosen.has(ccKey(each)))
  return (
    <Section
      label={localized["sequencer-export-ccs"]}
      aside={
        open.length > 0 && (
          <Checkbox
            label={localized["sequencer-export-all-ccs"]}
            checked={all}
            mixed={!all && some}
            onChange={() => onAll(!all)}
          />
        )
      }
    >
      {ccs.length === 0 ? (
        <p className="m-0 py-[0.3rem] text-small text-fg-tertiary">
          <Localized name="sequencer-import-no-ccs" />
        </p>
      ) : (
        <fieldset
          aria-label={localized["sequencer-export-ccs"]}
          className="m-0 flex max-h-36 min-w-0 flex-col overflow-y-auto border-0 p-0"
        >
          {ccs.map((each) => (
            <Checkbox
              key={ccKey(each)}
              label={`CC ${each.cc} · ${localized["sequencer-step-cc-channel-short"]} ${each.channel}`}
              checked={allowed(each) && chosen.has(ccKey(each))}
              disabled={!allowed(each)}
              note={[
                CC_NAMES[each.cc] === undefined ||
                CC_NAMES[each.cc] === "Undefined"
                  ? null
                  : CC_NAMES[each.cc],
                `${each.changes} ${localized["sequencer-import-changes"]}`,
                allowed(each) ? null : localized["sequencer-import-filtered"],
              ]
                .filter((part) => part !== null)
                .join(" · ")}
              onChange={(on) => onToggle(ccKey(each), on)}
            />
          ))}
        </fieldset>
      )}
    </Section>
  )
})

// The filter the notes and controllers pass through, folded away until
// wanted, with what it does said beside its name.
const Filter: FC<{
  filter: MIDIFilterJSON
  open: boolean
  onOpen: (open: boolean) => void
  onChange: (changes: Partial<MIDIFilterJSON>) => void
}> = memo(({ filter, open, onOpen, onChange }) => {
  const localized = useLocalization()
  const channels =
    filter.channels.length === ALL_CHANNELS.length
      ? localized["sequencer-import-all-channels"]
      : filter.channels.length === 0
        ? localized["sequencer-import-no-channels"]
        : `${localized["sequencer-step-cc-channel-short"]} ${filter.channels.join(", ")}`
  const notes =
    filter.noteLow === MIN_NOTE_NUMBER && filter.noteHigh === MAX_NOTE_NUMBER
      ? localized["sequencer-import-all-notes"]
      : `${noteNumberToName(filter.noteLow)}–${noteNumberToName(filter.noteHigh)}`
  const summary = [
    channels,
    notes,
    ...(filter.transpose === 0
      ? []
      : [`${filter.transpose > 0 ? "+" : ""}${filter.transpose}`]),
  ].join(" · ")
  return (
    <Accordion
      label={localized["sequencer-import-filter"]}
      summary={summary}
      open={open}
      onOpen={onOpen}
    >
      <p className="m-0 text-tiny text-fg-tertiary">
        <Localized name="sequencer-import-filter-hint" />
      </p>
      <MIDIFilterFields filter={filter} onChange={onChange} />
    </Accordion>
  )
})

/**
 * The choices a MIDI import makes, over a preview of the file. Which parts —
 * a track's notes on one channel — go in, merged, and which CCs, through a
 * filter like the MIDI input's; the stretch of the file, set on the
 * preview's ruler; how many notes a step takes, the step they start at and
 * how many steps the sequence has after;
 * whether they go round until the grid is full; and whether the file's
 * tempo comes too. It starts from the import settings and the input's
 * filter, and what it fills is shown as the choices change.
 */
export const ImportMidiDialog: FC<{
  name: string
  prepared: PreparedMidi
  onClose: () => void
}> = ({ name, prepared, onClose }) => {
  const patch = usePatch()
  const settings = useImportSettings()
  const { midiDeviceStore } = useStores()
  const { importMidi } = usePatchEditor()
  const localized = useLocalization()
  const { midi, sources, ccs } = prepared

  const beatsPerBar =
    midi.timeSignature === null
      ? 4
      : (midi.timeSignature[0] * 4) / midi.timeSignature[1]
  const [chosen, setChosen] = useState(
    () =>
      new Set(
        sources
          .filter(
            (source) =>
              !(settings.skipDrums && source.channel === DRUM_CHANNEL),
          )
          .map(sourceKey),
      ),
  )
  const [chosenCCs, setChosenCCs] = useState(
    () => new Set(settings.ccs ? ccs.map(ccKey) : []),
  )
  // the MIDI input's filter to start, changed here for this import only
  const [filter, setFilter] = useState<MIDIFilterJSON>(
    () => midiDeviceStore.filter,
  )
  const [filterOpen, setFilterOpen] = useState(() => !letsAllThrough(filter))
  const [optionsOpen, setOptionsOpen] = useState(true)
  const rollHeight = useRollHeight()
  const [notesPerStep, setNotesPerStep] = useState(patch.maxNotesPerStep)
  const [fromStep, setFromStep] = useState(0)
  // the grid's size after the import, the sequencer's own to start
  const [size, setSize] = useState(patch.size)
  const [loop, setLoop] = useState(settings.loop)
  const [fileTempo, setFileTempo] = useState(
    settings.fileTempo && midi.bpm !== null,
  )
  const [snapTo, setSnapTo] = useState<ImportSnap>(settings.snap)
  const [minVelocity, setMinVelocity] = useState(settings.minVelocity)
  // the sequencer's own scale to start; the import then sets it
  const [scale, setScale] = useState<ScaleJSON | null>(patch.scale)

  const snap =
    snapTo === "bar" ? beatsPerBar : snapTo === "beat" ? 1 : ENVELOPE_RESOLUTION
  // the whole file, out to the end of its last bar
  const totalBeats = Math.max(
    beatsPerBar,
    Math.ceil(midi.lengthBeats / beatsPerBar - 1e-9) * beatsPerBar,
  )
  const [range, setRange] = useState<ImportRange>({ start: 0, end: totalBeats })

  const heard = useCallback(
    (channel: number) => filter.channels.includes(channel),
    [filter],
  )
  const allowed = useCallback(
    (cc: MidiFileCC) =>
      filter.channels.includes(cc.channel) && filter.ccs.includes(cc.cc),
    [filter],
  )

  const options: MidiImportOptions = useMemo(
    () => ({
      sources: sources.filter((source) => chosen.has(sourceKey(source))),
      ccs: ccs.filter((each) => chosenCCs.has(ccKey(each)) && allowed(each)),
      filter,
      start: range.start,
      end: range.end,
      fromStep,
      size,
      loop,
      notesPerStep,
      bpm: fileTempo ? midi.bpm : null,
      minVelocity,
      scale,
    }),
    [
      minVelocity,
      scale,
      sources,
      ccs,
      chosen,
      chosenCCs,
      allowed,
      filter,
      range,
      fromStep,
      size,
      loop,
      notesPerStep,
      fileTempo,
      midi,
    ],
  )
  const plan = useMemo(
    () => importPlan(patch, prepared, options),
    [patch, prepared, options],
  )
  // the notes dealt past the grid's end, and those too soft or that the
  // scale leaves out
  const { cut, quiet, offScale } = useMemo(() => {
    const counts = { cut: 0, quiet: 0, offScale: 0 }
    for (const fate of plan.fates) {
      if (fate >= plan.placed) {
        counts.cut++
      } else if (fate === NOTE_QUIET) {
        counts.quiet++
      } else if (fate === NOTE_OFF_SCALE) {
        counts.offScale++
      }
    }
    return counts
  }, [plan])
  // The scales that best fit the notes the import would take, as they are
  // before any scale fits them. Kept apart from the scale itself, so
  // choosing one doesn't move the guesses.
  const { sources: chosenSources, start, end } = options
  const guesses = useMemo(
    () =>
      guessScales(
        importPitchWeights(prepared, {
          sources: chosenSources,
          start,
          end,
          filter,
          minVelocity,
        }),
      ),
    [prepared, chosenSources, start, end, filter, minVelocity],
  )
  const dealt = plan.chunks.length
  const steps = stepCount(size)
  const canImport =
    plan.filled > 0 && (options.sources.length > 0 || options.ccs.length > 0)

  const toggleSource = useCallback(
    (key: string, on: boolean) => setChosen((set) => toggled(set, key, on)),
    [],
  )
  // every part, or none, drums and all
  const allSources = useCallback(
    (on: boolean) => setChosen(new Set(on ? sources.map(sourceKey) : [])),
    [sources],
  )
  const toggleCC = useCallback(
    (key: string, on: boolean) => setChosenCCs((set) => toggled(set, key, on)),
    [],
  )
  const allCCs = useCallback(
    (on: boolean) =>
      setChosenCCs(new Set(on ? ccs.filter(allowed).map(ccKey) : [])),
    [ccs, allowed],
  )
  const changeFilter = useCallback(
    (changes: Partial<MIDIFilterJSON>) =>
      setFilter((current) => ({ ...current, ...changes })),
    [],
  )
  // the filter's keys, set on the preview as well as in its fields
  const noteRange = useMemo(
    () => ({ low: filter.noteLow, high: filter.noteHigh }),
    [filter.noteLow, filter.noteHigh],
  )
  const changeNotes = useCallback(
    ({ low, high }: NoteRange) =>
      setFilter((current) => ({ ...current, noteLow: low, noteHigh: high })),
    [],
  )
  const labels = useMemo(
    () => ({
      start: localized["sequencer-import-start"],
      end: localized["sequencer-import-end"],
      bar: localized["sequencer-import-bar"],
      preview: `${localized["sequencer-import-preview"]}: ${name}`,
      low: localized["sequencer-import-note-low"],
      high: localized["sequencer-import-note-high"],
    }),
    [localized, name],
  )

  // what the options come to, said beside them, and all there is to see of
  // them when folded away
  const chosenCount = sources.filter((source) =>
    chosen.has(sourceKey(source)),
  ).length
  const optionsSummary = [
    `${chosenCount} ${localized["sequencer-import-of"]} ${sources.length} ${localized[sources.length === 1 ? "sequencer-import-track-count" : "sequencer-import-tracks-count"]}`,
    ...(ccs.length === 0
      ? []
      : [
          `${options.ccs.length} ${localized[options.ccs.length === 1 ? "sequencer-step-cc" : "sequencer-export-ccs"]}`,
        ]),
    `${notesPerStep} ${localized[notesPerStep === 1 ? "sequencer-import-note-a-step" : "sequencer-import-notes-a-step"]}`,
    `${localized["sequencer-import-from"]} ${fromStep + 1}`,
    ...(size === patch.size
      ? []
      : [`${size} ${localized["sequencer-export-steps"]}`]),
    ...(loop ? [localized["sequencer-import-looping"]] : []),
    ...(minVelocity > 1
      ? [`${localized["sequencer-import-min-velocity"]} ${minVelocity}`]
      : []),
    ...(options.bpm === null
      ? []
      : [`${Math.round(options.bpm)} ${localized["sequencer-bpm"]}`]),
  ].join(" · ")

  const summary =
    plan.filled === 0
      ? localized["sequencer-import-nothing"]
      : `${localized["sequencer-import-fills"]} ${plan.firstStep + 1}–${plan.firstStep + plan.filled} ${localized["sequencer-import-of"]} ${steps}` +
        (loop && dealt > 0 && plan.filled > dealt
          ? ` · ${localized["sequencer-import-round"]} ${Math.round((plan.filled / dealt) * 10) / 10}×`
          : "") +
        ` · ${dealt} ${localized[dealt === 1 ? "sequencer-export-step" : "sequencer-export-steps"]} ${localized["sequencer-import-of"]} ${notesPerStep} ${localized[notesPerStep === 1 ? "sequencer-import-note" : "sequencer-import-notes"]}`

  return (
    <Dialog
      title={`${localized["sequencer-import-midi"]}: ${name}`}
      closeLabel={localized["sequencer-export-cancel"]}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            <Localized name="sequencer-export-cancel" />
          </Button>
          <Button
            type="button"
            primary
            disabled={!canImport}
            onClick={() => {
              importMidi(prepared, options)
              onClose()
            }}
          >
            <Localized name="sequencer-import-action" />
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 text-body text-fg-secondary">
        {/* the scale the notes are fitted to, found from them or chosen */}
        <section
          data-import-scale
          aria-label={localized["sequencer-scale"]}
          className="flex flex-none flex-col gap-1 text-small"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <Localized name="sequencer-scale" />
            </span>
            <div className="w-60 min-w-0">
              <ScaleSelects scale={scale} onScale={setScale} />
            </div>
            <span>
              <Localized name="sequencer-scale-fit" />
            </span>
            <FitButtons scale={scale} onScale={setScale} />
            {scale !== null && (
              <span className="text-fg-tertiary" data-scale-summary>
                {`${plan.shifted} ${localized["sequencer-scale-moved"]} · ${offScale} ${localized["sequencer-scale-left-out"]}`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span title={localized["sequencer-import-scale-hint"]}>
              <Localized name="sequencer-scale-detected" />
            </span>
            <ScaleGuesses guesses={guesses} scale={scale} onScale={setScale} />
          </div>
        </section>

        {/* the preview stays in view; the options under it scroll */}
        <div className="flex flex-none flex-col gap-1" data-import-preview>
          <div className="flex items-center justify-between gap-3 text-small">
            <span data-import-summary className={plan.cut ? "text-yellow" : ""}>
              {summary}
              {plan.cut &&
                ` · ${cut} ${localized[cut === 1 ? "sequencer-import-note" : "sequencer-import-notes"]} ${localized["sequencer-import-dont-fit"]}`}
            </span>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: the select is inside */}
            <label className="flex items-center gap-2">
              <Localized name="sequencer-import-snap" />
              <Select
                value={snapTo}
                onChange={(event) =>
                  setSnapTo(event.target.value as ImportSnap)
                }
              >
                {IMPORT_SNAPS.map((each) => (
                  <option key={each} value={each}>
                    {localized[`sequencer-import-snap-${each}`]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <MidiPreview
            prepared={prepared}
            plan={plan}
            chosen={chosen}
            range={range}
            onRange={setRange}
            totalBeats={totalBeats}
            beatsPerBar={beatsPerBar}
            snap={snap}
            notes={noteRange}
            onNotes={changeNotes}
            labels={labels}
            height={rollHeight}
          />
        </div>

        <div
          data-import-options
          className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2 pb-1"
        >
          <Accordion
            label={localized["sequencer-import-options"]}
            summary={optionsSummary}
            open={optionsOpen}
            onOpen={setOptionsOpen}
          >
            {/* side by side, or one above the other on a narrow screen */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-4">
                <Parts
                  sources={sources}
                  chosen={chosen}
                  heard={heard}
                  onToggle={toggleSource}
                  onAll={allSources}
                />
                <Controllers
                  ccs={ccs}
                  chosen={chosenCCs}
                  allowed={allowed}
                  onToggle={toggleCC}
                  onAll={allCCs}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <Section label={localized["sequencer-import-steps"]}>
                  <div className="grid grid-cols-[6rem_1fr] items-center gap-3 text-small">
                    <span>
                      <Localized name="sequencer-import-notes-per-step" />
                    </span>
                    <Stepper
                      label={localized["sequencer-import-notes-per-step"]}
                      value={notesPerStep}
                      min={1}
                      max={NOTES_PER_STEP}
                      onChange={setNotesPerStep}
                    />
                  </div>
                  <div className="grid grid-cols-[6rem_1fr] items-center gap-3 text-small">
                    <span>
                      <Localized name="sequencer-size" />
                    </span>
                    <div className="flex items-center gap-2">
                      <Stepper
                        label={localized["sequencer-size"]}
                        value={size}
                        min={1}
                        max={MAX_STEPS}
                        onChange={(value) => {
                          setSize(value)
                          setFromStep((from) => Math.min(from, value - 1))
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        title={localized["sequencer-import-size-fit-hint"]}
                        disabled={
                          dealt === 0 ||
                          size === Math.min(MAX_STEPS, fromStep + dealt)
                        }
                        onClick={() =>
                          setSize(Math.min(MAX_STEPS, fromStep + dealt))
                        }
                      >
                        <Localized name="sequencer-import-size-fit" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[6rem_1fr] items-center gap-3 text-small">
                    <span>
                      <Localized name="sequencer-import-from-step" />
                    </span>
                    <Stepper
                      label={localized["sequencer-import-from-step"]}
                      value={fromStep + 1}
                      min={1}
                      max={steps}
                      onChange={(value) => setFromStep(value - 1)}
                    />
                  </div>
                  <div className="grid grid-cols-[6rem_1fr] items-center gap-3 text-small">
                    <span>
                      <Localized name="sequencer-import-min-velocity" />
                    </span>
                    <Stepper
                      label={localized["sequencer-import-min-velocity"]}
                      value={minVelocity}
                      min={1}
                      max={127}
                      onChange={setMinVelocity}
                    />
                  </div>
                  <p
                    className="m-0 pl-[calc(6rem+0.75rem)] text-small text-fg-tertiary"
                    data-quiet-count
                  >
                    {minVelocity > 1
                      ? `${quiet} ${localized[quiet === 1 ? "sequencer-import-note" : "sequencer-import-notes"]} ${localized["sequencer-import-quiet"]}`
                      : localized["sequencer-import-min-velocity-note"]}
                  </p>
                </Section>
                <Checkbox
                  label={localized["sequencer-import-loop"]}
                  checked={loop}
                  onChange={setLoop}
                />
                <Checkbox
                  label={localized["sequencer-import-tempo"]}
                  checked={fileTempo}
                  disabled={midi.bpm === null}
                  note={
                    midi.bpm === null
                      ? localized["sequencer-import-no-tempo"]
                      : `${Math.round(midi.bpm)} ${localized["sequencer-bpm"]}`
                  }
                  onChange={setFileTempo}
                />
                <p className="m-0 text-small text-fg-tertiary">
                  <Localized name="sequencer-import-hint" />
                </p>
              </div>
            </div>
          </Accordion>

          <Filter
            filter={filter}
            open={filterOpen}
            onOpen={setFilterOpen}
            onChange={changeFilter}
          />
        </div>
      </div>
    </Dialog>
  )
}
