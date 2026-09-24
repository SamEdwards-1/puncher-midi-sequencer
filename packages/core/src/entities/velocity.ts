import { Accent, PatternStepJSON } from "./types"

export const MIN_VELOCITY = 1
export const MAX_VELOCITY = 127

// How far an accent moves a note's velocity. A setting of the machine, not
// the patch, as accent amount is in OODA.
export const DEFAULT_ACCENT_AMOUNT = 20
export const MIN_ACCENT_AMOUNT = 1
export const MAX_ACCENT_AMOUNT = 64

// A velocity drawn this close to a level snaps onto it: a quarter of the
// accent amount, so the pull grows with the gap between levels, and never
// less than 2, as a mouse rarely lands on the exact value.
export const accentSnap = (accentAmount: number) =>
  Math.max(2, Math.round(accentAmount / 4))

type DotVelocity = Pick<PatternStepJSON, "accent" | "velocityOffset">

// A note-on velocity of 0 is a note-off, so a note never goes below 1.
const clampVelocity = (velocity: number) =>
  Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, Math.round(velocity)))

const accentDelta = (accent: Accent, accentAmount: number) =>
  accent === "+" ? accentAmount : accent === "-" ? -accentAmount : 0

// Plain first, so where accents lie close together a tie stays plain.
const ACCENTS: Accent[] = ["none", "+", "-"]

const levelOf = (voiceVelocity: number, accentAmount: number, accent: Accent) =>
  clampVelocity(voiceVelocity + accentDelta(accent, accentAmount))

// The level nearest a velocity — the voice's own, or either accent — and how
// far off it is.
const nearestLevel = (
  voiceVelocity: number,
  accentAmount: number,
  velocity: number,
): { accent: Accent; away: number } => {
  let nearest: { accent: Accent; away: number } = {
    accent: "none",
    away: Number.POSITIVE_INFINITY,
  }
  for (const accent of ACCENTS) {
    const away = Math.abs(
      velocity - levelOf(voiceVelocity, accentAmount, accent),
    )
    if (away < nearest.away) {
      nearest = { accent, away }
    }
  }
  return nearest
}

/**
 * The velocity a dot plays at: its voice's, moved by the dot's own offset,
 * then by its accent.
 */
export const playedVelocity = (
  voiceVelocity: number,
  accentAmount: number,
  dot: DotVelocity,
): number =>
  clampVelocity(
    voiceVelocity + dot.velocityOffset + accentDelta(dot.accent, accentAmount),
  )

/**
 * What a velocity drawn for a dot means. Near the voice's velocity with the
 * accent amount added or taken away, it snaps onto that accent; near the
 * voice's own, onto a plain dot. Anywhere else it is the dot's own velocity,
 * kept as an offset from the voice's so the two move together.
 */
export const velocityToDot = (
  voiceVelocity: number,
  accentAmount: number,
  velocity: number,
): DotVelocity => {
  const drawn = clampVelocity(velocity)
  const { accent, away } = nearestLevel(voiceVelocity, accentAmount, drawn)
  return away <= accentSnap(accentAmount)
    ? { accent, velocityOffset: 0 }
    : { accent: "none", velocityOffset: drawn - voiceVelocity }
}

/**
 * The accent a dot looks like it has, which is what its size shows. An
 * accent it was given shows as itself; a velocity of its own shows as the
 * level it is nearest — louder than halfway to the accent above reads as
 * that accent, softer than halfway to the one below as that — so small
 * changes either side of the voice's velocity leave the dot as it is.
 */
export const shownAccent = (
  voiceVelocity: number,
  accentAmount: number,
  dot: DotVelocity,
): Accent => {
  if (dot.accent !== "none" || dot.velocityOffset === 0) {
    return dot.accent
  }
  return nearestLevel(
    voiceVelocity,
    accentAmount,
    playedVelocity(voiceVelocity, accentAmount, dot),
  ).accent
}

/**
 * A velocity typed for a dot, which is meant exactly: it is an accent only
 * where it lands on one, and otherwise the dot's own, without the snap a
 * drawn velocity gets.
 */
export const typedVelocityToDot = (
  voiceVelocity: number,
  accentAmount: number,
  velocity: number,
): DotVelocity => {
  const typed = clampVelocity(velocity)
  const { accent, away } = nearestLevel(voiceVelocity, accentAmount, typed)
  return away === 0
    ? { accent, velocityOffset: 0 }
    : { accent: "none", velocityOffset: typed - voiceVelocity }
}
