import { StepNote, VoiceIndex } from "@midiseq/core"
import { Plot, toX } from "./envelopeGeometry"

/**
 * A note's velocity as a point on the voice's velocity line: where the note
 * starts, how hard it plays, and the dot that played it. The line can't be
 * given points of its own; it has one at every note, and moving one sets
 * its dot's velocity.
 */
export interface VelocityPoint {
  voice: VoiceIndex
  dot: number
  time: number
  value: number
}

export const velocityPoints = (
  notes: StepNote[],
  voice: VoiceIndex,
): VelocityPoint[] =>
  notes
    .filter((note) => note.voice === voice)
    .map(({ dot, start, velocity }) => ({
      voice,
      dot,
      time: start,
      value: velocity,
    }))
    .sort((a, b) => a.time - b.time)

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

// The points at either end of a stretch of line, counted as hitSegment
// counts them: -1 is the flat run into the first, the last index the run
// out of the last.
export const segmentEnds = (
  points: VelocityPoint[],
  index: number,
): VelocityPoint[] =>
  index < 0
    ? points.slice(0, 1)
    : index >= points.length - 1
      ? points.slice(-1)
      : [points[index], points[index + 1]]

// Points from one dot share its velocity: ratchet hits, or a pattern that
// comes round again inside a long step.
export const dotKey = ({ voice, dot }: Pick<VelocityPoint, "voice" | "dot">) =>
  `${voice}:${dot}`
