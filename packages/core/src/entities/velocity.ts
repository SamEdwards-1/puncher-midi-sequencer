import { Accent, PatternStepJSON } from "./types"

export const MIN_VELOCITY = 1
export const MAX_VELOCITY = 127

// How far an accent moves a note's velocity. A setting of the machine, not
// the patch, as accent amount is in OODA.
export const DEFAULT_ACCENT_AMOUNT = 20
export const MIN_ACCENT_AMOUNT = 1
export const MAX_ACCENT_AMOUNT = 64

// A velocity drawn this close to an accent's, or to the voice's own, counts
// as it: a mouse rarely lands on the exact value.
export const ACCENT_SNAP = 2

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
 * What a velocity drawn for a dot means. On, or within a couple of, the
 * voice's velocity with the accent amount added or taken away, it is that
 * accent; near the voice's own, a plain dot. Anywhere else it is the dot's
 * own velocity, kept as an offset from the voice's so the two move together.
 */
export const velocityToDot = (
  voiceVelocity: number,
  accentAmount: number,
  velocity: number,
): DotVelocity => {
  const drawn = clampVelocity(velocity)
  let nearest: Accent | null = null
  let closest = ACCENT_SNAP
  for (const accent of ACCENTS) {
    const away = Math.abs(drawn - levelOf(voiceVelocity, accentAmount, accent))
    if (away <= ACCENT_SNAP && (nearest === null || away < closest)) {
      nearest = accent
      closest = away
    }
  }
  return nearest === null
    ? { accent: "none", velocityOffset: drawn - voiceVelocity }
    : { accent: nearest, velocityOffset: 0 }
}

/**
 * The accent a dot looks like it has, which is what its size shows. An
 * accent it was given shows as itself; a velocity of its own shows as an
 * accent only where it lands on, or within a couple of, one — as it can
 * once the voice's velocity or the accent amount has moved under it.
 */
export const shownAccent = (
  voiceVelocity: number,
  accentAmount: number,
  dot: DotVelocity,
): Accent => {
  if (dot.accent !== "none" || dot.velocityOffset === 0) {
    return dot.accent
  }
  const played = playedVelocity(voiceVelocity, accentAmount, dot)
  const accent = (["+", "-"] as const).find(
    (candidate) =>
      Math.abs(played - levelOf(voiceVelocity, accentAmount, candidate)) <=
      ACCENT_SNAP,
  )
  return accent ?? "none"
}
