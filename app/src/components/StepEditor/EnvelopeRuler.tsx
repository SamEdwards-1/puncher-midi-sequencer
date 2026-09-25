import { FC, MouseEvent as ReactMouseEvent, useState } from "react"
import { createPortal } from "react-dom"
import { useLocalization } from "../../localize/useLocalization"
import { Plot, toX, View, WHOLE_STEP } from "./envelopeGeometry"
import { observeDrag } from "./observeDrag"
import { moveRulerDrag, rulerMarks, startRulerDrag } from "./rulerView"

export const RULER_HEIGHT = 20

/**
 * Where on the step the graph is looking, in bars, beats and sixteenths —
 * and, as Live's ruler is, the handle that zooms and scrolls it. Press and
 * drag: up zooms in and down out, around the place pressed, and left and
 * right scroll — one or the other at a time, changing over when the drag
 * turns. The
 * pointer hides while it drags, as the view is what moves, and a rule
 * through the roll marks the time it was pressed on.
 */
export const EnvelopeRuler: FC<{
  plot: Plot
  stepBeats: number
  // the time pressed on, as a fraction of the step, while a drag lasts
  mark: number | null
  onView: (view: View) => void
  onMark: (time: number | null) => void
}> = ({ plot, stepBeats, mark, onView, onMark }) => {
  const localized = useLocalization()
  const [zooming, setZooming] = useState(false)
  const view = plot.view ?? WHOLE_STEP
  const across = plot.width - 2 * plot.pad
  const { every, marks } = rulerMarks(view, stepBeats, across)
  const at = (beat: number) => toX(plot, beat / stepBeats)

  const onMouseDown = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    const down = event.nativeEvent
    const left = event.currentTarget.getBoundingClientRect().left
    const anchor = Math.min(
      1,
      Math.max(0, (down.clientX - left - plot.pad) / across),
    )
    setZooming(true)
    let drag = startRulerDrag(view, anchor)
    onMark(drag.time)
    let last = { x: 0, y: 0 }
    observeDrag(down, {
      onMove: (_, delta) => {
        drag = moveRulerDrag(
          drag,
          { x: delta.x - last.x, y: delta.y - last.y },
          across,
          stepBeats,
        )
        last = delta
        onView(drag.view)
      },
      onUp: () => {
        setZooming(false)
        onMark(null)
      },
    })
  }

  return (
    <>
      <svg
        data-view={`${view.start}-${view.end}`}
        width={plot.width}
        height={RULER_HEIGHT}
        className="block cursor-zoom-in select-none"
        onMouseDown={onMouseDown}
      >
        <title>{localized["sequencer-envelope-ruler"]}</title>
        <rect
          width={plot.width}
          height={RULER_HEIGHT}
          fill="var(--midiseq-ruler-background)"
        />
        {marks.map(({ beat }) => (
          <line
            key={`half-${beat}`}
            x1={at(beat + every / 2)}
            x2={at(beat + every / 2)}
            y1={RULER_HEIGHT - 4}
            y2={RULER_HEIGHT}
            stroke="var(--midiseq-editor-grid)"
          />
        ))}
        {marks.map(({ beat, label }) => (
          <g key={beat} data-mark={label}>
            <line
              x1={at(beat)}
              x2={at(beat)}
              y1={RULER_HEIGHT - 9}
              y2={RULER_HEIGHT}
              stroke="var(--midiseq-fg-tertiary)"
            />
            <text
              x={at(beat) + 3}
              y={10}
              fontSize={10}
              fill="var(--midiseq-fg-secondary)"
              fontFamily="var(--midiseq-mono-font)"
            >
              {label}
            </text>
          </g>
        ))}
        {mark !== null && (
          <line
            x1={toX(plot, mark)}
            x2={toX(plot, mark)}
            y1={0}
            y2={RULER_HEIGHT}
            stroke="var(--midiseq-fg)"
          />
        )}
      </svg>
      {/* over everything while dragging, so no other cursor shows through */}
      {zooming &&
        createPortal(
          <div className="fixed inset-0 z-50 cursor-none" />,
          document.body,
        )}
    </>
  )
}
