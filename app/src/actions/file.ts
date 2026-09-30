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
  prepareMidi,
  readMidiFile,
  SequenceCC,
  StepIndex,
  sequenceCCs,
  serializeFile,
  serializePatterns,
  VoiceIndex,
  withPatchName,
} from "@midiseq/core"
import { useCallback } from "react"
import type { AudioRenderProgress } from "../audio/audioExport"
import { useAccentAmount } from "../hooks/useAccentAmount"
import { useStores } from "../hooks/useStores"
import { AudioRenderCancelled, AudioRenderJob } from "../services/AudioRenderer"
import {
  isGone,
  MIDI_FILE,
  MP3_FILE,
  PATTERNS_FILE,
  PickedFile,
  WAV_FILE,
} from "../services/FileService"
import { RecentFile, RecentKind } from "../services/RecentFilesStorage"
import { ccKey, ExportSettingsStore } from "../stores/ExportSettingsStore"
import { RecentFilesStore } from "../stores/RecentFilesStore"
import { usePatchEditor } from "./patch"

const nameFor = (fileName: string | null, patchName: string) =>
  fileName ?? `${patchName === "" ? "untitled" : patchName}${FILE_EXTENSION}`

// "Bassline.midiseq.json" exports its patterns as
// "Bassline.midiseq-patterns.json"
const patternsNameFor = (fileName: string | null, patchName: string) =>
  `${exportBaseNameFor(fileName, patchName)}${PATTERNS_EXTENSION}`

// "Bassline.midiseq.json" is "Bassline" once exported, before its extension
export const exportBaseNameFor = (
  fileName: string | null,
  patchName: string,
) => {
  const name = nameFor(fileName, patchName)
  return name.endsWith(FILE_EXTENSION)
    ? name.slice(0, -FILE_EXTENSION.length)
    : name.replace(/\.json$/i, "")
}

// "Bassline.midiseq.json" exports as "Bassline.mid"
const midiNameFor = (fileName: string | null, patchName: string) =>
  `${exportBaseNameFor(fileName, patchName)}${MIDI_EXTENSION}`

// A picker or a write that fails would otherwise leave a click that did
// nothing at all.
const attempt = async <T>(
  what: string,
  run: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await run()
  } catch (error) {
    complain(what, error)
    return null
  }
}

const complain = (what: string, error: unknown) => {
  const reason = error instanceof Error ? ` ${error.message}` : ""
  window.alert(`Couldn't ${what}.${reason}`)
}

/**
 * A recent file read again: a file since moved or deleted comes off its
 * list, saying so, and anything else that goes wrong says what.
 */
const attemptRecent = async <T>(
  recentFiles: RecentFilesStore,
  kind: RecentKind,
  recent: RecentFile,
  run: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await run()
  } catch (error) {
    if (isGone(error)) {
      window.alert(
        `Couldn't find ${recent.name}. It may have been moved or deleted.`,
      )
      await recentFiles.remove(kind, recent)
    } else {
      complain(`open ${recent.name}`, error)
    }
    return null
  }
}

export function useFileActions() {
  const {
    sequencerStore,
    history,
    fileService,
    autoSave,
    recorder,
    recentFiles,
  } = useStores()

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

  // the patch's file goes to the top of the recent patches, once it has one
  const remember = useCallback(
    (name: string) => {
      const handle = fileService.currentHandle
      if (handle !== null) {
        void recentFiles.add("patch", { name, handle })
      }
    },
    [fileService, recentFiles],
  )

  const loadText = useCallback(
    (opened: { name: string; text: string }) => {
      const result = parseFile(opened.text)
      if (!result.ok) {
        window.alert(`Couldn't open that file. ${result.error}`)
        return
      }
      // Older unnamed patches use their filename, including recent files.
      load(
        withPatchName(result.patch, exportBaseNameFor(opened.name, "")),
        opened.name,
      )
      remember(opened.name)
    },
    [load, remember],
  )

  const saved = useCallback(
    (name: string | null) => {
      if (name !== null) {
        sequencerStore.fileName = name
        sequencerStore.isSaved = true
        autoSave.clear()
        remember(name)
      }
    },
    [sequencerStore, autoSave, remember],
  )

  return {
    newPatch: useCallback(() => {
      if (confirmDiscard()) {
        endTake()
        load(withPatchName(createDefaultPatch()), null)
      }
    }, [confirmDiscard, endTake, load]),

    open: useCallback(async () => {
      if (!confirmDiscard()) {
        return
      }
      endTake()
      const opened = await attempt("open a file", () => fileService.open())
      if (opened !== null) {
        loadText(opened)
      }
    }, [confirmDiscard, endTake, fileService, loadText]),

    /** A patch from the recent ones, opened again without a picker. */
    openRecent: useCallback(
      async (recent: RecentFile) => {
        if (!confirmDiscard()) {
          return
        }
        endTake()
        const opened = await attemptRecent(recentFiles, "patch", recent, () =>
          fileService.reopen(recent.handle),
        )
        if (opened !== null) {
          loadText(opened)
        }
      },
      [confirmDiscard, endTake, fileService, recentFiles, loadText],
    ),

    save: useCallback(async () => {
      endTake()
      const text = serializeFile(createFile(sequencerStore.patch))
      const name = await attempt("save the patch", () =>
        fileService.save(
          text,
          nameFor(sequencerStore.fileName, sequencerStore.patch.name),
        ),
      )
      saved(name)
    }, [endTake, sequencerStore, fileService, saved]),

    saveAs: useCallback(async () => {
      endTake()
      const text = serializeFile(createFile(sequencerStore.patch))
      const name = await attempt("save the patch", () =>
        fileService.saveAs(
          text,
          nameFor(sequencerStore.fileName, sequencerStore.patch.name),
        ),
      )
      saved(name)
    }, [endTake, sequencerStore, fileService, saved]),
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
 * Whether one of the CCs a patch can send goes in as the export settings
 * stand: ticked, and not one of those driving a setting while they are left
 * out — unless a mod output sends it too, which still goes in.
 */
export const exportsCC = (
  settings: Pick<ExportSettingsStore, "excludedCCs" | "modulationCCs">,
  each: SequenceCC,
): boolean =>
  !settings.excludedCCs.includes(ccKey(each)) &&
  (settings.modulationCCs ||
    each.modulation === undefined ||
    each.mods.length > 0)

/**
 * The export settings as they apply to a patch: the voices ticked that play,
 * and the CCs ticked among `ccs`, the ones it can send.
 */
export const exportOptionsFor = (
  settings: Pick<
    ExportSettingsStore,
    "voices" | "excludedCCs" | "modulationCCs" | "layout" | "passes"
  >,
  patch: PatchJSON,
  ccs: SequenceCC[],
): MidiExportOptions => ({
  voices: VOICES.filter(
    (index) => patch.voices[index].enabled && settings.voices[index],
  ),
  ccs: ccs
    .filter((each) => exportsCC(settings, each))
    .map(({ cc, channel }) => ({ cc, channel })),
  modulationCCs: settings.modulationCCs,
  layout: settings.layout,
  passes: settings.passes,
})

// Characters a file's name can't hold somewhere, and the colon that would
// end the name early in a drag's DownloadURL
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|]/g

// The patch "Velvet Heron" exports its step 3 as "Velvet Heron step 3.mid";
// one with no name goes by its file's, "Bassline step 3.mid"
const stepMidiNameFor = (
  fileName: string | null,
  patchName: string,
  step: number,
) => {
  const base =
    patchName.trim() !== ""
      ? patchName.trim()
      : exportBaseNameFor(fileName, patchName)
  return `${base.replace(UNSAFE_IN_FILE_NAME, "-")} step ${step + 1}${MIDI_EXTENSION}`
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

/**
 * Where a render is: fetching its SoundFont, then finding its level and
 * playing it into its file, then keeping the file.
 */
export type AudioRenderStatus =
  | { phase: "loading" }
  | AudioRenderProgress
  | { phase: "saving" }

/**
 * The sequence rendered to an audio file through the built-in sound's
 * SoundFont, with the audio export settings, on a thread of its own. Where
 * it goes is asked first, while the click that started it still lets a
 * picker open; the file named `name` is then written a piece at a time as
 * it is made, and kept once it is all written. Chance is rolled afresh and
 * accents move velocities as they do when playing, and the CCs driving
 * settings reach the synth if they reach the outputs. `done` is the name
 * written, or null if nothing was — the picker dismissed, the render
 * cancelled, or a failure, which says why — leaving the file as it was.
 */
export function useAudioRender() {
  const {
    sequencerStore,
    fileService,
    soundFonts,
    audioExportSettings,
    audioRenderer,
    midiDeviceStore,
    playbackSettings,
  } = useStores()

  return useCallback(
    (name: string, onStatus: (status: AudioRenderStatus) => void) => {
      let cancelled = false
      let job: AudioRenderJob | null = null
      const done = (async () => {
        const patch = sequencerStore.patch
        const { settings } = audioExportSettings
        const kind = settings.format === "mp3" ? MP3_FILE : WAV_FILE
        const file = await attempt("save the audio", () =>
          fileService.streamCopyLater(`${name}${kind.extension}`, kind),
        )
        if (file === null || cancelled) {
          return null
        }
        const written = await (async () => {
          onStatus({ phase: "loading" })
          // a copy of its own, since the render takes it
          const soundFont = await attempt("load the SoundFont", () =>
            soundFonts.bytes(soundFonts.selectedId),
          )
          if (soundFont === null || cancelled) {
            return null
          }
          job = audioRenderer(
            {
              patch,
              soundFont,
              settings,
              seed: freshSeed(),
              accentAmount: playbackSettings.accentAmount,
              modulationCCs: midiDeviceStore.sendModulationCCs,
            },
            onStatus,
            (bytes) => file.write(bytes),
          )
          const { result } = job
          return attempt("render the audio", async () => {
            try {
              await result
              return true
            } catch (error) {
              if (error instanceof AudioRenderCancelled) {
                return null
              }
              throw error
            }
          })
        })()
        if (written === null) {
          // what was written of it goes, leaving the file as it was
          await file.abort().catch(() => {})
          return null
        }
        onStatus({ phase: "saving" })
        return attempt("save the audio", () => file.close())
      })()
      return {
        done,
        cancel: () => {
          cancelled = true
          job?.cancel()
        },
      }
    },
    [
      sequencerStore,
      fileService,
      soundFonts,
      audioExportSettings,
      audioRenderer,
      midiDeviceStore,
      playbackSettings,
    ],
  )
}

// Waits for the page to be drawn — so a loading indicator shows before
// work that holds the page up — but no longer than a moment, since a tab in
// the background draws nothing.
const nextPaint = () =>
  new Promise<void>((resolve) => {
    let done = false
    const go = () => {
      if (!done) {
        done = true
        resolve()
      }
    }
    requestAnimationFrame(() => setTimeout(go, 0))
    setTimeout(go, 50)
  })

/**
 * Picks a MIDI file and reads it, ready for the import dialog; nothing is
 * changed until that dialog imports it. Given one of the recent MIDI files,
 * it reads that again instead of asking. `onLoading` hears the file's name
 * once it is picked, before it is read, so the wait can be shown. Picking a
 * file stops playback, so the sequence isn't left running under the import.
 * A file that can't be read says why; one that can goes to the top of the
 * recent MIDI files.
 */
export function useMidiFileLoader() {
  const { fileService, player, recentFiles } = useStores()
  return useCallback(
    async (onLoading: (name: string) => void, recent?: RecentFile) => {
      const picked: PickedFile | null =
        recent === undefined
          ? await attempt("open the MIDI file", () =>
              fileService.pickFile(MIDI_FILE),
            )
          : await attemptRecent(recentFiles, "midi", recent, async () => ({
              file: await fileService.reread(recent.handle),
              handle: recent.handle,
            }))
      if (picked === null) {
        return null
      }
      const { file, handle } = picked
      player.stop()
      onLoading(file.name)
      await nextPaint()
      const bytes = await attempt(
        "read the MIDI file",
        async () => new Uint8Array(await file.arrayBuffer()),
      )
      if (bytes === null) {
        return null
      }
      const result = readMidiFile(bytes)
      if (!result.ok) {
        window.alert(`Couldn't import that file. ${result.error}`)
        return null
      }
      if (handle !== null) {
        void recentFiles.add("midi", { name: file.name, handle })
      }
      return { name: file.name, prepared: prepareMidi(result.midi) }
    },
    [fileService, player, recentFiles],
  )
}
