import { VoiceIndex, VoiceRule } from "../entities/types"
import { Rng } from "./rng"

export interface RuleCursor {
  // index of the note to play next
  index: number
  // for the bouncing rules: true while moving up
  forward: boolean
  // for rise/fall: true when the next move is the long one (up 2 / down 2)
  longStep: boolean
}

export const initialCursor = (
  rule: VoiceRule,
  noteCount: number,
): RuleCursor => {
  const top = Math.max(0, noteCount - 1)
  switch (rule) {
    case "down":
    case "downup":
    case "downup+":
    case "fall":
    case "highest":
      return { index: top, forward: false, longStep: true }
    default:
      return { index: 0, forward: true, longStep: true }
  }
}

const wrap = (index: number, count: number) => ((index % count) + count) % count

// Returns the note to play and the cursor to use next time. `notes` must be
// sorted ascending.
export const pickNote = (
  rule: VoiceRule,
  notes: readonly number[],
  cursor: RuleCursor,
  voiceIndex: VoiceIndex,
  rng: Rng,
): { note: number | null; cursor: RuleCursor } => {
  const count = notes.length
  if (count === 0) {
    return { note: null, cursor }
  }
  const top = count - 1

  switch (rule) {
    case "nth":
      return { note: notes[Math.min(voiceIndex, top)], cursor }
    case "lowest":
      return { note: notes[0], cursor }
    case "highest":
      return { note: notes[top], cursor }
    case "random":
      return { note: notes[Math.floor(rng.next() * count)], cursor }
    case "up": {
      const index = wrap(cursor.index, count)
      return {
        note: notes[index],
        cursor: { ...cursor, index: wrap(index + 1, count) },
      }
    }
    case "down": {
      const index = wrap(cursor.index, count)
      return {
        note: notes[index],
        cursor: { ...cursor, index: wrap(index - 1, count) },
      }
    }
    case "updown":
    case "downup": {
      const index = wrap(cursor.index, count)
      if (count === 1) {
        return { note: notes[0], cursor }
      }
      // turn around before repeating the end note
      let forward = cursor.forward
      if (forward && index === top) {
        forward = false
      } else if (!forward && index === 0) {
        forward = true
      }
      const next = forward ? index + 1 : index - 1
      return {
        note: notes[index],
        cursor: { ...cursor, index: next, forward },
      }
    }
    case "updown+":
    case "downup+": {
      const index = wrap(cursor.index, count)
      if (count === 1) {
        return { note: notes[0], cursor }
      }
      // turn around after repeating the end note
      const forward = cursor.forward
      let nextIndex: number
      let nextForward = forward
      if (forward) {
        if (index === top) {
          nextIndex = top
          nextForward = false
        } else {
          nextIndex = index + 1
        }
      } else {
        if (index === 0) {
          nextIndex = 0
          nextForward = true
        } else {
          nextIndex = index - 1
        }
      }
      return {
        note: notes[index],
        cursor: { ...cursor, index: nextIndex, forward: nextForward },
      }
    }
    // up 2, down 1
    case "rise": {
      const index = wrap(cursor.index, count)
      const delta = cursor.longStep ? 2 : -1
      return {
        note: notes[index],
        cursor: {
          ...cursor,
          index: wrap(index + delta, count),
          longStep: !cursor.longStep,
        },
      }
    }
    // down 2, up 1
    case "fall": {
      const index = wrap(cursor.index, count)
      const delta = cursor.longStep ? -2 : 1
      return {
        note: notes[index],
        cursor: {
          ...cursor,
          index: wrap(index + delta, count),
          longStep: !cursor.longStep,
        },
      }
    }
  }
}
