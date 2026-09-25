import { noteNumberToName } from "@midiseq/core"
import { FC, MouseEvent as ReactMouseEvent, useState } from "react"
import { isBlackKey } from "./envelopeGeometry"

export const PIANO_WIDTH = 40

/**
 * A keyboard beside the piano roll, as in Live: a row to each key, black
 * and white alike, level with the roll's.
 * Each C is named; the key under the mouse is lit and names itself.
 */
export const PianoKeys: FC<{
  keys: { low: number; high: number }
  height: number
  pad: number
}> = ({ keys, height, pad }) => {
  const [hover, setHover] = useState<number | null>(null)
  const count = keys.high - keys.low + 1
  const keyHeight = (height - 2 * pad) / count
  const keyY = (note: number) => pad + (keys.high - note) * keyHeight
  const notes = Array.from({ length: count }, (_, offset) => keys.low + offset)

  const onMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const top = event.currentTarget.getBoundingClientRect().top
    const row = Math.floor((event.clientY - top - pad) / keyHeight)
    setHover(row >= 0 && row < count ? keys.high - row : null)
  }

  const label = (note: number) => ({
    y: keyY(note) + keyHeight / 2,
    text: noteNumberToName(note),
  })
  const hovered = hover === null ? null : label(hover)

  return (
    <svg
      data-piano
      // the notes are named in the step editor above; these are for the eye
      aria-hidden
      width={PIANO_WIDTH}
      height={height}
      className="block flex-none select-none"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      <rect
        width={PIANO_WIDTH}
        height={height}
        fill="var(--midiseq-editor-background)"
      />
      {notes.map((note) => (
        <rect
          key={note}
          data-key={note}
          x={0}
          y={keyY(note)}
          width={PIANO_WIDTH}
          height={keyHeight}
          fill={
            note === hover
              ? "var(--midiseq-theme)"
              : isBlackKey(note)
                ? "var(--midiseq-piano-black)"
                : "var(--midiseq-piano-white)"
          }
        />
      ))}
      {/* between two white keys side by side, E and F or B and C */}
      {notes
        .filter(
          (note) =>
            note < keys.high && !isBlackKey(note) && !isBlackKey(note + 1),
        )
        .map((note) => (
          <line
            key={note}
            x1={0}
            x2={PIANO_WIDTH}
            y1={keyY(note)}
            y2={keyY(note)}
            stroke="var(--midiseq-piano-edge)"
          />
        ))}
      {notes
        .filter((note) => note % 12 === 0 && note !== hover)
        .map((note) => (
          <text
            key={note}
            x={PIANO_WIDTH - 3}
            y={label(note).y}
            dominantBaseline="central"
            textAnchor="end"
            fontSize={9}
            fill="var(--midiseq-piano-label)"
            fontFamily="var(--midiseq-mono-font)"
          >
            {label(note).text}
          </text>
        ))}
      {hovered !== null && (
        <g data-hover-note={hovered.text} pointerEvents="none">
          <rect
            x={PIANO_WIDTH - 30}
            y={hovered.y - 7}
            width={28}
            height={14}
            rx={3}
            fill="var(--midiseq-background-dark)"
          />
          <text
            x={PIANO_WIDTH - 16}
            y={hovered.y}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={10}
            fill="var(--midiseq-fg)"
            fontFamily="var(--midiseq-mono-font)"
          >
            {hovered.text}
          </text>
        </g>
      )}
    </svg>
  )
}
