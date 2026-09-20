import { useEffect } from "react"
import { useFileActions } from "../actions/file"
import { useStores } from "./useStores"

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)

// Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
export function useKeyboardShortcuts() {
  const { history } = useStores()
  const { open, save, saveAs } = useFileActions()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || !(event.ctrlKey || event.metaKey)) {
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
  }, [history, open, save, saveAs])
}
