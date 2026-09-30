import { useEffect } from "react"
import { useFileActions } from "../actions/file"
import { usePatchEditor } from "../actions/patch"
import { useSelectionAccess } from "./useSequencerView"
import { useStores } from "./useStores"

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)

// Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, Ctrl/Cmd+C and V
// copy and paste the selected step, as its menu's Copy and Paste do.
export function useKeyboardShortcuts() {
  const { history, sequencerStore } = useStores()
  const { open, save, saveAs } = useFileActions()
  const { paste } = usePatchEditor()
  const { selectedStep, copiedStep, copyStep } = useSelectionAccess()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || !(event.ctrlKey || event.metaKey)) {
        return
      }
      const copy = event.code === "KeyC" && !event.shiftKey
      const pasting = event.code === "KeyV" && !event.shiftKey
      // text selected on the page is the browser's to copy
      if (copy && !window.getSelection()?.isCollapsed) {
        return
      }
      if (copy) {
        event.preventDefault()
        copyStep(sequencerStore.patch.steps[selectedStep()])
        return
      }
      if (pasting) {
        event.preventDefault()
        const copied = copiedStep()
        if (copied !== null) {
          paste(selectedStep(), copied)
        }
        return
      }
      const redo =
        event.code === "KeyY" || (event.code === "KeyZ" && event.shiftKey)
      if (redo) {
        event.preventDefault()
        history.redo()
      } else if (event.code === "KeyZ") {
        event.preventDefault()
        history.undo()
      } else if (event.code === "KeyS") {
        event.preventDefault()
        void (event.shiftKey ? saveAs() : save())
      } else if (event.code === "KeyO") {
        event.preventDefault()
        void open()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    history,
    sequencerStore,
    open,
    save,
    saveAs,
    paste,
    selectedStep,
    copiedStep,
    copyStep,
  ])
}
