import { ModOutJSON, PatchJSON, StepIndex } from "../entities/types"
import { gridWidth, hasContent, loopEndIndex, viewIndex } from "./loopRange"

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// Maps a 0..1 reading onto the output's range as a MIDI CC value.
export const scaleModValue = (
  normalized: number,
  modOut: ModOutJSON,
): number => {
  const span = modOut.max - modOut.min
  return clamp(Math.round(modOut.min + clamp(normalized, 0, 1) * span), 0, 127)
}

export interface RecordedExtent {
  x: number
  y: number
}

// Greatest recorded column and row, used as the denominators for Seq X / Y.
export const recordedExtent = (patch: PatchJSON): RecordedExtent => {
  const width = gridWidth(patch.size)
  let x = 0
  let y = 0
  patch.steps.forEach((step, index) => {
    if (!hasContent(step)) {
      return
    }
    x = Math.max(x, index % width)
    y = Math.max(y, Math.floor(index / width))
  })
  return { x, y }
}

export interface SequencerModValues {
  seqX: number
  seqY: number
  phase: number
}

// Position-derived readings, each normalized to 0..1. Seq Y counts down from
// the top row, so the top is low.
export const sequencerModValues = (
  patch: PatchJSON,
  position: StepIndex,
  flip: boolean,
): SequencerModValues => {
  const width = gridWidth(patch.size)
  const step = viewIndex(position, patch.size, flip)
  const extent = recordedExtent(patch)
  const end = loopEndIndex(patch)
  return {
    seqX: extent.x === 0 ? 0 : (step % width) / extent.x,
    seqY: extent.y === 0 ? 0 : Math.floor(step / width) / extent.y,
    phase: end === 0 ? 0 : position / end,
  }
}
