import { VoiceIndex, VoiceRule } from "../entities/types"
import { Rng } from "./rng"

export interface RuleCursor {
  // index of the note to play next
  index: number
  // for the bouncing rules: true while moving up
  forward: boolean
  // for rise/fall: true when the next move is the long one (up 2 / down 2)
  longStep: boolean
  // previous note position for the walk rule
  lastIndex: number | null
  // previous pitch for rules that avoid an immediate repeat
  lastNote: number | null
  // note positions remaining in the current shuffle cycle
  order: number[]
}

export const initialCursor = (
  rule: VoiceRule,
  noteCount: number,
): RuleCursor => {
  const top = Math.max(0, noteCount - 1)
  const start = { lastIndex: null, lastNote: null, order: [] }
  switch (rule) {
    case "down":
    case "downup":
    case "downup+":
    case "fall":
    case "highest":
      return { ...start, index: top, forward: false, longStep: true }
    default:
      return { ...start, index: 0, forward: true, longStep: true }
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
    case "outsidein": {
      const position = wrap(cursor.index, count)
      const index = position % 2 === 0 ? position / 2 : top - (position - 1) / 2
      return {
        note: notes[index],
        cursor: { ...cursor, index: wrap(position + 1, count) },
      }
    }
    case "insideout": {
      const position = wrap(cursor.index, count)
      const middle = Math.floor(top / 2)
      const index =
        position % 2 === 0 ? middle - position / 2 : middle + (position + 1) / 2
      return {
        note: notes[index],
        cursor: { ...cursor, index: wrap(position + 1, count) },
      }
    }
    case "ends": {
      const index = cursor.index === 0 ? 0 : top
      return {
        note: notes[index],
        cursor: { ...cursor, index: index === 0 ? top : 0 },
      }
    }
    case "shuffle": {
      let order = cursor.order
      if (order.length !== count || cursor.index >= count) {
        order = Array.from({ length: count }, (_, index) => index)
        for (let index = top; index > 0; index--) {
          const other = Math.floor(rng.next() * (index + 1))
          ;[order[index], order[other]] = [order[other], order[index]]
        }
        // A new cycle should not immediately repeat the last note of the old one.
        if (count > 1 && notes[order[0]] === cursor.lastNote) {
          const different = order.findIndex(
            (index) => notes[index] !== cursor.lastNote,
          )
          if (different > 0) {
            ;[order[0], order[different]] = [order[different], order[0]]
          }
        }
      }
      const position = order === cursor.order ? cursor.index : 0
      const index = order[position]
      return {
        note: notes[index],
        cursor: {
          ...cursor,
          index: position + 1,
          lastNote: notes[index],
          order,
        },
      }
    }
    case "walk": {
      const previous = cursor.lastIndex
      const index =
        previous === null || previous >= count
          ? Math.floor(rng.next() * count)
          : previous === 0
            ? 1 % count
            : previous === top
              ? top - 1
              : previous + (rng.next() < 0.5 ? -1 : 1)
      return { note: notes[index], cursor: { ...cursor, lastIndex: index } }
    }
    case "norepeat": {
      const different = notes
        .map((_, index) => index)
        .filter((index) => notes[index] !== cursor.lastNote)
      const choices =
        different.length > 0 ? different : notes.map((_, index) => index)
      const index = choices[Math.floor(rng.next() * choices.length)]
      return {
        note: notes[index],
        cursor: { ...cursor, lastNote: notes[index] },
      }
    }
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
