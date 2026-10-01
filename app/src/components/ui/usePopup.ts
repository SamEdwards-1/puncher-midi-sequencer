import { useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * A popup opened from a right-click at `requested`: it can be asked for at
 * the very edge of the window, so it is nudged back inside once its size is
 * known, and it closes on a press elsewhere or on Escape. The ref goes on
 * the popup; `at` is where to place it.
 */
export const usePopup = (
  requested: { x: number; y: number },
  onClose: () => void,
) => {
  const popup = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(requested)

  useLayoutEffect(() => {
    const element = popup.current
    if (element === null) {
      return
    }
    const { width, height } = element.getBoundingClientRect()
    const margin = 8
    setAt({
      x: Math.min(
        Math.max(margin, requested.x),
        window.innerWidth - width - margin,
      ),
      y: Math.min(
        Math.max(margin, requested.y),
        window.innerHeight - height - margin,
      ),
    })
  }, [requested])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  return { popup, at }
}
