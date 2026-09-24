export interface Drag {
  // how far the mouse is from where it went down, in pixels
  onMove?: (event: MouseEvent, delta: { x: number; y: number }) => void
  onUp?: (event: MouseEvent) => void
  // a press that never moved far enough to count as a drag
  onClick?: (event: MouseEvent) => void
}

// A hand never holds perfectly still; less than this is still a click.
const DRAG_THRESHOLD = 3

/**
 * Follows a drag from a mouse-down to its release, as Signal's control pane
 * does: listening on the document, so the drag carries on outside the
 * element and still ends wherever the button comes up.
 */
export const observeDrag = (
  down: MouseEvent,
  { onMove, onUp, onClick }: Drag,
) => {
  let moved = false

  const move = (event: MouseEvent) => {
    const delta = {
      x: event.clientX - down.clientX,
      y: event.clientY - down.clientY,
    }
    moved ||= Math.hypot(delta.x, delta.y) >= DRAG_THRESHOLD
    if (moved) {
      onMove?.(event, delta)
    }
  }

  const up = (event: MouseEvent) => {
    document.removeEventListener("mousemove", move)
    document.removeEventListener("mouseup", up)
    onUp?.(event)
    if (!moved) {
      onClick?.(event)
    }
  }

  document.addEventListener("mousemove", move)
  document.addEventListener("mouseup", up)
}
