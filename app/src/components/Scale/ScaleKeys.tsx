import { inScale, ScaleJSON } from "@midiseq/core"
import { FC } from "react"
import { scaleLabel, TONICS } from "../../theory/scales"

// a keyboard on its side, as beside a piano roll: the notes rise up it and
// the black keys reach in from the left
const WHITE_SIZE = 11
const WHITE_LENGTH = 44
const BLACK_SIZE = 7
const BLACK_LENGTH = 27

// each white key's pitch class, bottom to top
const WHITES = [0, 2, 4, 5, 7, 9, 11]
// each black key's pitch class, with the white key just below it
const BLACKS = [
  { pitch: 1, after: 0 },
  { pitch: 3, after: 1 },
  { pitch: 6, after: 3 },
  { pitch: 8, after: 4 },
  { pitch: 10, after: 5 },
]

const HEIGHT = WHITES.length * WHITE_SIZE

const WHITE_FILL = "var(--midiseq-piano-white)"
const BLACK_FILL = "color-mix(in srgb, var(--midiseq-piano-white) 55%, black)"
const IN_FILL = "var(--midiseq-theme)"

/**
 * An octave of the keyboard, C at the bottom to B at the top, with the keys
 * in the scale lit and its tonic marked with a dot.
 */
export const ScaleKeys: FC<{ scale: ScaleJSON }> = ({ scale }) => {
  const lit = (pitch: number) => inScale(scale, pitch)
  const names = TONICS.filter((_, pitch) => lit(pitch)).join(" ")

  // `y` is the key's top edge
  const key = (pitch: number, y: number, black: boolean) => {
    const size = black ? BLACK_SIZE : WHITE_SIZE
    const length = black ? BLACK_LENGTH : WHITE_LENGTH
    return (
      <g key={pitch} data-pitch={pitch} data-in-scale={lit(pitch)}>
        <rect
          x={0.5}
          y={y + 0.5}
          width={length - 1}
          height={size - 1}
          rx={1.5}
          fill={lit(pitch) ? IN_FILL : black ? BLACK_FILL : WHITE_FILL}
          stroke="var(--midiseq-piano-edge)"
        />
        {pitch === scale.tonic && (
          <circle
            data-tonic
            cx={length - 5}
            cy={y + size / 2}
            r={2}
            fill="var(--midiseq-on-surface)"
          />
        )}
      </g>
    )
  }

  // the top edge of the white key `index` up from C
  const whiteY = (index: number) => HEIGHT - (index + 1) * WHITE_SIZE

  return (
    <svg
      data-scale-keys
      role="img"
      aria-label={`${scaleLabel(scale)}: ${names}`}
      width={WHITE_LENGTH}
      height={HEIGHT}
      className="block flex-none select-none"
    >
      {WHITES.map((pitch, index) => key(pitch, whiteY(index), false))}
      {/* over the whites, straddling the line between two */}
      {BLACKS.map(({ pitch, after }) =>
        key(pitch, whiteY(after) - BLACK_SIZE / 2, true),
      )}
    </svg>
  )
}
