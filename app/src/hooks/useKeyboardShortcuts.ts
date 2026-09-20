import { useEffect } from "react"
import { useStores } from "./useStores"

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)

// Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
export function useKeyboardShortcuts() {
  const { history } = useStores()

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
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [history])
}
