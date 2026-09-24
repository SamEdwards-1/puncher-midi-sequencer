// Durations in beats, where one beat is a quarter note in 4/4.
export const PACE_BEATS = {
  "16bar": 64,
  "8bar": 32,
  "4bar": 16,
  "2bar": 8,
  "1bar": 4,
  "2ndD": 3,
  "2nd": 2,
  "2ndT": 4 / 3,
  "4thD": 1.5,
  "4th": 1,
  "8thD": 0.75,
  "4thT": 2 / 3,
  "8th": 0.5,
  "16thD": 0.375,
  "8thT": 1 / 3,
  "16th": 0.25,
  "32ndD": 0.1875,
  "16thT": 1 / 6,
  "32nd": 0.125,
  "32ndT": 1 / 12,
} as const

export type PaceId = keyof typeof PACE_BEATS

export const PACE_LABELS: Record<PaceId, string> = {
  "16bar": "16 Bars",
  "8bar": "8 Bars",
  "4bar": "4 Bars",
  "2bar": "2 Bars",
  "1bar": "1 Bar",
  "2ndD": "Half D",
  "2nd": "Half",
  "2ndT": "Half T",
  "4thD": "4th D",
  "4th": "4th",
  "8thD": "8th D",
  "4thT": "4th T",
  "8th": "8th",
  "16thD": "16th D",
  "8thT": "8th T",
  "16th": "16th",
  "32ndD": "32nd D",
  "16thT": "16th T",
  "32nd": "32nd",
  "32ndT": "32nd T",
}

export const paceBeats = (id: PaceId): number => PACE_BEATS[id]

// The longest a step can be, and so the latest an envelope point can matter.
export const MAX_PACE_BEATS = Math.max(...Object.values(PACE_BEATS))

// Every pace is a whole number of these, from the 32nd triplet (4) to the
// dotted 32nd (9) and the straight 32nd (6).
export const PACE_GRID = 48

/**
 * Puts a beat reached by adding paces back on the grid they all share.
 * Adding triplets up otherwise drifts: six of them come to
 * 1.9999999999999998, and a voice would tick just before the sequencer step
 * it belongs to.
 */
export const onPaceGrid = (beat: number): number =>
  Math.round(beat * PACE_GRID) / PACE_GRID

const byDurationDescending = (a: PaceId, b: PaceId) =>
  PACE_BEATS[b] - PACE_BEATS[a]

// Slowest first, which is how both pace fields read.
export const PACES: PaceId[] = (Object.keys(PACE_BEATS) as PaceId[]).sort(
  byDurationDescending,
)

// absorbs float error in pace ratios, so 1 / (1/3) counts as 3 dots, not 4
const DOT_EPSILON = 1e-9

/**
 * How many of a voice's dots it plays while the sequencer sits on one step:
 * a dot starts every voice pace, from the step's start until the next step.
 * The pattern wraps at its length, so no more than that many are distinct.
 */
export const dotsPerStep = (
  sequencerPace: PaceId,
  voicePace: PaceId,
  patternLength: number,
): number =>
  Math.min(
    Math.ceil(PACE_BEATS[sequencerPace] / PACE_BEATS[voicePace] - DOT_EPSILON),
    patternLength,
  )

/**
 * Paces once included golden-ratio durations — a note times 1.618 — which no
 * longer exist. A patch that names one is read as the pace closest to it in
 * length, so an old file still plays at about the speed it did.
 */
export const nearestPace = (beats: number): PaceId =>
  PACES.reduce((nearest, id) =>
    Math.abs(PACE_BEATS[id] - beats) < Math.abs(PACE_BEATS[nearest] - beats)
      ? id
      : nearest,
  )

const GOLDEN_RATIO = 1.618033988749895

const GOLDEN_BEATS: Record<string, number> = {
  gWhole: 4 * GOLDEN_RATIO,
  g2nd: 2 * GOLDEN_RATIO,
  g4th: GOLDEN_RATIO,
  g8th: 0.5 * GOLDEN_RATIO,
  g16th: 0.25 * GOLDEN_RATIO,
  g32nd: 0.125 * GOLDEN_RATIO,
}

/** What a pace id from an older file means now. */
export const migratePace = (id: string): string =>
  id in GOLDEN_BEATS ? nearestPace(GOLDEN_BEATS[id]) : id
