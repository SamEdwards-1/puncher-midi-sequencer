import {
  createDefaultPatch,
  createFile,
  FILE_EXTENSION,
  parseFile,
  serializeFile,
} from "@midiseq/core"
import { useCallback } from "react"
import { useStores } from "../hooks/useStores"

const nameFor = (fileName: string | null, patchName: string) =>
  fileName ?? `${patchName === "" ? "untitled" : patchName}${FILE_EXTENSION}`

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
      const opened = await fileService.open()
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
      const name = await fileService.save(
        text,
        nameFor(sequencerStore.fileName, sequencerStore.patch.name),
      )
      if (name !== null) {
        sequencerStore.fileName = name
        sequencerStore.isSaved = true
        autoSave.clear()
      }
    }, [sequencerStore, fileService, autoSave]),

    saveAs: useCallback(async () => {
      const text = serializeFile(createFile(sequencerStore.patch))
      const name = await fileService.saveAs(
        text,
        nameFor(sequencerStore.fileName, sequencerStore.patch.name),
      )
      if (name !== null) {
        sequencerStore.fileName = name
        sequencerStore.isSaved = true
        autoSave.clear()
      }
    }, [sequencerStore, fileService, autoSave]),
  }
}
