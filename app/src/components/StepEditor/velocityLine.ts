import { StepNote, VoiceIndex } from "@midiseq/core"
import { Plot, toX, toY } from "./envelopeGeometry"

/**
 * A note's velocity, drawn as a lollipop: a head where the note starts, at
 * how hard it plays, and a stem running on at that height for as long as the
 * note sounds. The voice's length and its dot's ratchet set how far that is.
 * Moving the head sets the velocity of the dot that played the note.
 */
export interface VelocityPoint {
  voice: VoiceIndex
  dot: number
  time: number
  end: number
  value: number
}

export const velocityPoints = (
  notes: StepNote[],
  voice: VoiceIndex,
): VelocityPoint[] =>
  notes
    .filter((note) => note.voice === voice)
    .map(({ dot, start, end, velocity }) => ({
      voice,
      dot,
      time: start,
      end,
      value: velocity,
    }))
    .sort((a, b) => a.time - b.time)

/**
 * The lollipop under (x, y): its head, within `radius`, or its stem, within
 * `tolerance` of it. Where they overlap, the nearest wins, and on a tie the
 * later one, as it is drawn on top.
 */
export const hitLollipop = (
  points: VelocityPoint[],
  plot: Plot,
  x: number,
  y: number,
  radius = 7,
  tolerance = 4,
): number | null => {
  let found: number | null = null
  let nearest = Number.POSITIVE_INFINITY
  points.forEach((point, index) => {
    const headX = toX(plot, point.time)
    const endX = toX(plot, point.end)
    const levelY = toY(plot, point.value)
    const head = Math.hypot(headX - x, levelY - y)
    const stem =
      x >= headX && x <= endX ? Math.abs(levelY - y) : Number.POSITIVE_INFINITY
    const distance = head <= radius ? head : stem <= tolerance ? stem : null
    if (distance !== null && distance <= nearest) {
      nearest = distance
      found = index
    }
  })
  return found
}

/**
 * The points a Draw stroke passes on its way from one place to the next,
 * each with the value the stroke has where it crosses: a straight line
 * between the two.
 */
export const pointsAlong = (
  points: VelocityPoint[],
  plot: Plot,
  from: { x: number; value: number },
  to: { x: number; value: number },
): { point: VelocityPoint; value: number }[] => {
  const low = Math.min(from.x, to.x)
  const high = Math.max(from.x, to.x)
  return points
    .map((point) => ({ point, x: toX(plot, point.time) }))
    .filter(({ x }) => x >= low && x <= high)
    .map(({ point, x }) => ({
      point,
      value:
        to.x === from.x
          ? to.value
          : from.value +
            ((to.value - from.value) * (x - from.x)) / (to.x - from.x),
    }))
}

// Points from one dot share its velocity: ratchet hits, or a pattern that
// comes round again inside a long step.
export const dotKey = ({ voice, dot }: Pick<VelocityPoint, "voice" | "dot">) =>
  `${voice}:${dot}`
