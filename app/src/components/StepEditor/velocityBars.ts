import { StepNote, VoiceIndex } from "@midiseq/core"
import { Plot, toX } from "./envelopeGeometry"

// Signal's bar width, from each note's start
export const BAR_WIDTH = 5
// a thin bar is easier to catch with a little room either side
const BAR_REACH = 2

/** A note's velocity as a bar: where it starts, and the dot that played it. */
export interface Bar {
  voice: VoiceIndex
  dot: number
  velocity: number
  x: number
}

export const barsFor = (
  notes: StepNote[],
  voices: VoiceIndex[],
  plot: Plot,
): Bar[] =>
  notes
    .filter((note) => voices.includes(note.voice))
    .map(({ voice, dot, velocity, start }) => ({
      voice,
      dot,
      velocity,
      x: toX(plot, start),
    }))

// The bars under x. As in Signal, a bar's whole column counts, not just the
// bar, so a quiet note is as easy to grab as a loud one.
export const barsAt = (bars: Bar[], x: number): Bar[] =>
  bars.filter(
    (bar) => x >= bar.x - BAR_REACH && x <= bar.x + BAR_WIDTH + BAR_REACH,
  )

/**
 * The bars a painting stroke passes on its way from one point to the next,
 * each with the value the stroke has where it crosses: a straight line
 * between the two, as Signal paints across notes.
 */
export const barsAlong = (
  bars: Bar[],
  from: { x: number; value: number },
  to: { x: number; value: number },
): { bar: Bar; value: number }[] => {
  const low = Math.min(from.x, to.x)
  const high = Math.max(from.x, to.x)
  return bars
    .map((bar) => ({ bar, middle: bar.x + BAR_WIDTH / 2 }))
    .filter(({ middle }) => middle >= low && middle <= high)
    .map(({ bar, middle }) => ({
      bar,
      value:
        to.x === from.x
          ? to.value
          : from.value +
            ((to.value - from.value) * (middle - from.x)) / (to.x - from.x),
    }))
}

// Bars from one dot share its velocity: ratchet hits, or a pattern that
// comes round again inside a long step.
export const dotKey = ({ voice, dot }: Pick<Bar, "voice" | "dot">) =>
  `${voice}:${dot}`
