export const GOLDEN_RATIO = 1.618033988749895

// Durations in beats, where one beat is a quarter note in 4/4.
export const PACE_BEATS = {
  "16bar": 64,
  "8bar": 32,
  "4bar": 16,
  "2bar": 8,
  "1bar": 4,
  gWhole: 4 * GOLDEN_RATIO,
  "2ndD": 3,
  g2nd: 2 * GOLDEN_RATIO,
  "2nd": 2,
  g4th: GOLDEN_RATIO,
  "2ndT": 4 / 3,
  "4thD": 1.5,
  "4th": 1,
  g8th: 0.5 * GOLDEN_RATIO,
  "8thD": 0.75,
  "4thT": 2 / 3,
  "8th": 0.5,
  g16th: 0.25 * GOLDEN_RATIO,
  "16thD": 0.375,
  "8thT": 1 / 3,
  "16th": 0.25,
  g32nd: 0.125 * GOLDEN_RATIO,
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
  gWhole: "Golden Whole",
  "2ndD": "Half D",
  g2nd: "Golden Half",
  "2nd": "Half",
  g4th: "Golden 4th",
  "2ndT": "Half T",
  "4thD": "4th D",
  "4th": "4th",
  g8th: "Golden 8th",
  "8thD": "8th D",
  "4thT": "4th T",
  "8th": "8th",
  g16th: "Golden 16th",
  "16thD": "16th D",
  "8thT": "8th T",
  "16th": "16th",
  g32nd: "Golden 32nd",
  "32ndD": "32nd D",
  "16thT": "16th T",
  "32nd": "32nd",
  "32ndT": "32nd T",
}

export const isGoldenPace = (id: PaceId): boolean => id.startsWith("g")

export const paceBeats = (id: PaceId): number => PACE_BEATS[id]

const byDurationDescending = (a: PaceId, b: PaceId) =>
  PACE_BEATS[b] - PACE_BEATS[a]

// Voices get the golden paces; the sequencer does not.
export const VOICE_PACES: PaceId[] = (Object.keys(PACE_BEATS) as PaceId[]).sort(
  byDurationDescending,
)

export const SEQUENCER_PACES: PaceId[] = VOICE_PACES.filter(
  (id) => !isGoldenPace(id),
)
