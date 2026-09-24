import {
  createDefaultPatch,
  createFile,
  createPatternsFile,
  FILE_EXTENSION,
  PATTERNS_EXTENSION,
  parseFile,
  parsePatternsFile,
  serializeFile,
  serializePatterns,
} from "@midiseq/core"
import { useCallback } from "react"
import { useStores } from "../hooks/useStores"
import { PATTERNS_FILE } from "../services/FileService"
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
  const { sequencerStore, history, fileService, autoSave } = useStores()

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
        load(createDefaultPatch(), null)
      }
    }, [confirmDiscard, load]),

    open: useCallback(async () => {
      if (!confirmDiscard()) {
        return
      }
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
    }, [confirmDiscard, fileService, load]),

    save: useCallback(async () => {
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
    }, [sequencerStore, fileService, autoSave]),

    saveAs: useCallback(async () => {
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
    }, [sequencerStore, fileService, autoSave]),
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
