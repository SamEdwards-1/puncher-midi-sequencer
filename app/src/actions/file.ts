import {
  createDefaultPatch,
  createFile,
  createPatternsFile,
  exportMidi,
  exportStepMidi,
  FILE_EXTENSION,
  MIDI_EXTENSION,
  MidiExportOptions,
  PATTERNS_EXTENSION,
  PatchJSON,
  parseFile,
  parsePatternsFile,
  SequenceCC,
  StepIndex,
  sequenceCCs,
  serializeFile,
  serializePatterns,
  VoiceIndex,
} from "@midiseq/core"
import { useCallback } from "react"
import { useAccentAmount } from "../hooks/useAccentAmount"
import { useStores } from "../hooks/useStores"
import { MIDI_FILE, PATTERNS_FILE } from "../services/FileService"
import { ccKey, ExportSettingsStore } from "../stores/ExportSettingsStore"
import { usePatchEditor } from "./patch"

const nameFor = (fileName: string | null, patchName: string) =>
  fileName ?? `${patchName === "" ? "untitled" : patchName}${FILE_EXTENSION}`

// "Bassline.midiseq.json" exports its patterns as
// "Bassline.midiseq-patterns.json"
const patternsNameFor = (fileName: string | null, patchName: string) => {
  const name = nameFor(fileName, patchName)
  const base = name.endsWith(FILE_EXTENSION)
    ? name.slice(0, -FILE_EXTENSION.length)
    : name.replace(/\.json$/i, "")
  return `${base}${PATTERNS_EXTENSION}`
}

// "Bassline.midiseq.json" exports as "Bassline.mid"
const midiNameFor = (fileName: string | null, patchName: string) => {
  const name = nameFor(fileName, patchName)
  const base = name.endsWith(FILE_EXTENSION)
    ? name.slice(0, -FILE_EXTENSION.length)
    : name.replace(/\.json$/i, "")
  return `${base}${MIDI_EXTENSION}`
}

// A picker or a write that fails would otherwise leave a click that did
// nothing at all.
const attempt = async <T>(
  what: string,
  run: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await run()
  } catch (error) {
    const reason = error instanceof Error ? ` ${error.message}` : ""
    window.alert(`Couldn't ${what}.${reason}`)
    return null
  }
}

export function useFileActions() {
  const { sequencerStore, history, fileService, autoSave, recorder } =
    useStores()

  /**
   * Each of these acts on the whole patch, so a take ends first: a save
   * writes the patch as the take left it rather than one still being played
   * into, and a new or opened patch doesn't carry on recording into itself.
   */
  const endTake = useCallback(() => recorder.setRecording(false), [recorder])

  const load = useCallback(
    (patch: ReturnType<typeof createDefaultPatch>, fileName: string | null) => {
      sequencerStore.patch = patch
      sequencerStore.fileName = fileName
      sequencerStore.isSaved = true
      // a fresh document starts with a clean slate
      history.clear()
      autoSave.clear()
    },
    [sequencerStore, history, autoSave],
  )

  const confirmDiscard = useCallback(
    () =>
      sequencerStore.isSaved ||
      window.confirm("This patch has unsaved changes. Discard them?"),
    [sequencerStore],
  )

  return {
    newPatch: useCallback(() => {
      if (confirmDiscard()) {
        endTake()
        load(createDefaultPatch(), null)
      }
    }, [confirmDiscard, endTake, load]),

    open: useCallback(async () => {
      if (!confirmDiscard()) {
        return
      }
      endTake()
      const opened = await attempt("open a file", () => fileService.open())
      if (opened === null) {
        return
      }
      const result = parseFile(opened.text)
      if (!result.ok) {
        window.alert(`Couldn't open that file. ${result.error}`)
        return
      }
      load(result.patch, opened.name)
    }, [confirmDiscard, endTake, fileService, load]),

    save: useCallback(async () => {
      endTake()
      const text = serializeFile(createFile(sequencerStore.patch))
      const name = await attempt("save the patch", () =>
        fileService.save(
          text,
          nameFor(sequencerStore.fileName, sequencerStore.patch.name),
        ),
      )
      if (name !== null) {
        sequencerStore.fileName = name
        sequencerStore.isSaved = true
        autoSave.clear()
      }
    }, [endTake, sequencerStore, fileService, autoSave]),

    saveAs: useCallback(async () => {
      endTake()
      const text = serializeFile(createFile(sequencerStore.patch))
      const name = await attempt("save the patch", () =>
        fileService.saveAs(
          text,
          nameFor(sequencerStore.fileName, sequencerStore.patch.name),
        ),
      )
      if (name !== null) {
        sequencerStore.fileName = name
        sequencerStore.isSaved = true
        autoSave.clear()
      }
    }, [endTake, sequencerStore, fileService, autoSave]),
  }
}

/**
 * Every voice's dots on their own, to try against another patch. Exporting
 * leaves the patch's file alone; importing is one undoable edit that swaps
 * the patterns in and keeps each voice's other settings.
 */
export function usePatternFileActions() {
  const { sequencerStore, fileService } = useStores()
  const { replacePatterns } = usePatchEditor()

  return {
    exportPatterns: useCallback(async () => {
      const text = serializePatterns(createPatternsFile(sequencerStore.patch))
      await attempt("export the patterns", () =>
        fileService.saveCopy(
          text,
          patternsNameFor(sequencerStore.fileName, sequencerStore.patch.name),
          PATTERNS_FILE,
        ),
      )
    }, [sequencerStore, fileService]),

    importPatterns: useCallback(async () => {
      const opened = await attempt("import patterns", () =>
        fileService.openCopy(PATTERNS_FILE),
      )
      if (opened === null) {
        return
      }
      const result = parsePatternsFile(opened.text)
      if (!result.ok) {
        window.alert(`Couldn't import those patterns. ${result.error}`)
        return
      }
      replacePatterns(result.voices)
    }, [fileService, replacePatterns]),
  }
}

const VOICES: VoiceIndex[] = [0, 1, 2, 3]

/**
 * The export settings as they apply to a patch: the voices ticked that play,
 * and the CCs ticked among `ccs`, the ones it can send.
 */
export const exportOptionsFor = (
  settings: Pick<
    ExportSettingsStore,
    "voices" | "excludedCCs" | "layout" | "passes"
  >,
  patch: PatchJSON,
  ccs: SequenceCC[],
): MidiExportOptions => ({
  voices: VOICES.filter(
    (index) => patch.voices[index].enabled && settings.voices[index],
  ),
  ccs: ccs
    .filter((each) => !settings.excludedCCs.includes(ccKey(each)))
    .map(({ cc, channel }) => ({ cc, channel })),
  layout: settings.layout,
  passes: settings.passes,
})

// "Bassline.midiseq.json" exports its step 3 as "Bassline step 3.mid"
const stepMidiNameFor = (
  fileName: string | null,
  patchName: string,
  step: number,
) => {
  const name = midiNameFor(fileName, patchName)
  return `${name.slice(0, -MIDI_EXTENSION.length)} step ${step + 1}${MIDI_EXTENSION}`
}

// A performance rolls chance afresh each time, and so does an export.
const freshSeed = () => Math.floor(Math.random() * 2 ** 32)

/**
 * The sequence, or one step of it, as a MIDI file, with the export settings:
 * worked out at once and in silence, as a performance would go — chance and
 * the random rules rolled afresh, accents moving velocities by this
 * machine's amount. Written as a copy, leaving the patch's own file alone.
 * `stepFile` makes a step's file there and then, for dragging out of the
 * browser, where nothing can wait.
 */
export function useMidiExport() {
  const { sequencerStore, fileService, exportSettings } = useStores()
  const { accentAmount } = useAccentAmount()

  const stepFile = useCallback(
    (step: StepIndex) => {
      const patch = sequencerStore.patch
      const options = exportOptionsFor(
        exportSettings,
        patch,
        sequenceCCs(patch, [step]),
      )
      return {
        bytes: exportStepMidi(patch, step, {
          ...options,
          accentAmount,
          seed: freshSeed(),
        }),
        name: stepMidiNameFor(sequencerStore.fileName, patch.name, step),
      }
    },
    [sequencerStore, exportSettings, accentAmount],
  )

  return {
    stepFile,

    exportSequence: useCallback(async () => {
      const patch = sequencerStore.patch
      const bytes = exportMidi(patch, {
        ...exportOptionsFor(exportSettings, patch, sequenceCCs(patch)),
        accentAmount,
        seed: freshSeed(),
      })
      return attempt("export MIDI", () =>
        fileService.saveCopy(
          bytes,
          midiNameFor(sequencerStore.fileName, patch.name),
          MIDI_FILE,
        ),
      )
    }, [sequencerStore, fileService, exportSettings, accentAmount]),

    exportStep: useCallback(
      async (step: StepIndex) => {
        const { bytes, name } = stepFile(step)
        return attempt("export the step as MIDI", () =>
          fileService.saveCopy(bytes, name, MIDI_FILE),
        )
      },
      [stepFile, fileService],
    ),
  }
}
