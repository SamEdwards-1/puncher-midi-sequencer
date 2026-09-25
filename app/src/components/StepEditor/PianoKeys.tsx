import { noteNumberToName } from "@midiseq/core"
import { FC, MouseEvent as ReactMouseEvent, useState } from "react"
import { isBlackKey } from "./envelopeGeometry"

// the octaves' column on the left, the keys' on the right, as in Live
const OCTAVE_WIDTH = 34
const KEY_WIDTH = 22
export const PIANO_WIDTH = OCTAVE_WIDTH + KEY_WIDTH
// rows shorter than this are too close to name every one
const LABEL_ROOM = 9

/**
 * A keyboard beside the piano roll, as in Live: a row to each key, black
 * and white alike, level with the roll's — every key in its range, or with
 * the scale collapsed only those the sequence plays. Beside the keys, a
 * column marks each octave, ruled off under its C and named just above;
 * collapsed, it names every key if there is room. The key under the mouse
 * is lit and names itself there.
 */
export const PianoKeys: FC<{
  // top to bottom
  rows: number[]
  collapsed: boolean
  height: number
  pad: number
}> = ({ rows, collapsed, height, pad }) => {
  const [hover, setHover] = useState<number | null>(null)
  const keyHeight = (height - 2 * pad) / rows.length
  const keyY = (index: number) => pad + index * keyHeight

  const onMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const top = event.currentTarget.getBoundingClientRect().top
    const index = Math.floor((event.clientY - top - pad) / keyHeight)
    setHover(index >= 0 && index < rows.length ? index : null)
  }

  const named = (note: number) =>
    note % 12 === 0 || (collapsed && keyHeight >= LABEL_ROOM)
  const label = (index: number) => ({
    y: keyY(index) + keyHeight / 2,
    text: noteNumberToName(rows[index]),
  })
  const hovered = hover === null ? null : label(hover)

  return (
    <svg
      data-piano
      // the notes are named in the step editor above; these are for the eye
      aria-hidden="true"
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
      <rect
        x={0}
        y={pad}
        width={OCTAVE_WIDTH}
        height={height - 2 * pad}
        fill="var(--midiseq-piano-octave)"
      />
      {rows.map((note, index) => (
        <rect
          key={note}
          data-key={note}
          x={OCTAVE_WIDTH}
          y={keyY(index)}
          width={KEY_WIDTH}
          height={keyHeight}
          fill={
            index === hover
              ? "var(--midiseq-theme)"
              : isBlackKey(note)
                ? "var(--midiseq-piano-black)"
                : "var(--midiseq-piano-white)"
          }
        />
      ))}
      {/* between two keys of a colour side by side: E and F, B and C, or
          any two the collapsed scale has brought together */}
      {rows
        .slice(1)
        .map((note, index) =>
          isBlackKey(note) === isBlackKey(rows[index]) ? (
            <line
              key={note}
              x1={OCTAVE_WIDTH}
              x2={PIANO_WIDTH}
              y1={keyY(index + 1)}
              y2={keyY(index + 1)}
              stroke="var(--midiseq-piano-edge)"
            />
          ) : null,
        )}
      <line
        x1={OCTAVE_WIDTH - 0.5}
        x2={OCTAVE_WIDTH - 0.5}
        y1={pad}
        y2={height - pad}
        stroke="var(--midiseq-piano-edge)"
      />
      {/* each octave ruled off under its C */}
      {rows.map((note, index) =>
        note % 12 === 0 && index < rows.length - 1 ? (
          <line
            key={note}
            x1={0}
            x2={OCTAVE_WIDTH}
            y1={keyY(index + 1)}
            y2={keyY(index + 1)}
            stroke="var(--midiseq-piano-edge)"
          />
        ) : null,
      )}
      {rows.map((note, index) =>
        named(note) && index !== hover ? (
          <text
            key={note}
            x={3}
            // a C sits on its octave's rule; any other key in its row
            y={
              note % 12 === 0 && !collapsed
                ? keyY(index) + keyHeight - 3
                : label(index).y
            }
            dominantBaseline={
              note % 12 === 0 && !collapsed ? "auto" : "central"
            }
            fontSize={9}
            fill="var(--midiseq-piano-label)"
            fontFamily="var(--midiseq-mono-font)"
          >
            {label(index).text}
          </text>
        ) : null,
      )}
      {hovered !== null && (
        <g data-hover-note={hovered.text} pointerEvents="none">
          <rect
            x={2}
            y={hovered.y - 7}
            width={OCTAVE_WIDTH - 4}
            height={14}
            rx={3}
            fill="var(--midiseq-background-dark)"
          />
          <text
            x={OCTAVE_WIDTH / 2}
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
