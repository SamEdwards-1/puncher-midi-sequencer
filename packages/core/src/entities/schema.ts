import { z } from "zod"
import { migratePace, PACE_BEATS } from "./paces"
import { MAX_NOTES_PER_STEP, MAX_PATTERN_LENGTH, NOTES_PER_STEP } from "./types"

const midiValue = z.number().int().min(0).max(127)
const channel = z.number().int().min(1).max(16)

export const PaceIdSchema = z.preprocess(
  (value) => (typeof value === "string" ? migratePace(value) : value),
  z.enum(Object.keys(PACE_BEATS) as [string, ...string[]]),
)

export const ProbabilitySchema = z.union([
  z.literal(10),
  z.literal(25),
  z.literal(33),
  z.literal(50),
  z.literal(67),
  z.literal(75),
  z.literal(90),
  z.literal(100),
])

export const JumpRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }),
  z.object({ kind: z.literal("times"), n: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal("every"), n: z.number().int().min(2).max(8) }),
  z.object({ kind: z.literal("chance"), pct: ProbabilitySchema }),
  z.object({ kind: z.literal("last") }),
  z.object({ kind: z.literal("notLast") }),
])

export const JumpSchema = z.object({
  rule: JumpRuleSchema,
  dest: z.number().int().min(0).max(63).nullable(),
  normal: z.number().int().min(0).max(63).nullable(),
})

export const OutputTargetSchema = z.union([
  z.literal("all"),
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
])

export const EnvelopePointSchema = z.object({
  time: z.number().min(0).max(1),
  value: midiValue,
})

export const EnvelopeSchema = z.object({
  id: z.number().int(),
  cc: midiValue,
  // a file written when a CC could follow a voice's channel lands on 1
  channel: z.preprocess((value) => (value === "voice" ? 1 : value), channel),
  // Stable, so two points at one time keep the order that makes their jump.
  points: z
    .array(EnvelopePointSchema)
    .transform((points) => [...points].sort((a, b) => a.time - b.time)),
})

/**
 * Steps once held CC events: a number, a value and a channel, sent on
 * landing. Each becomes an envelope with a single point at the step's start,
 * which sends exactly that.
 */
const envelopesFromCCs = (step: unknown): unknown => {
  if (
    typeof step !== "object" ||
    step === null ||
    !("ccs" in step) ||
    "envelopes" in step
  ) {
    return step
  }
  const { ccs, ...rest } = step as { ccs: unknown }
  return {
    ...rest,
    envelopes: Array.isArray(ccs)
      ? ccs.map((cc) =>
          typeof cc === "object" && cc !== null
            ? {
                id: cc.id,
                cc: cc.cc,
                channel: cc.channel,
                points: [{ time: 0, value: cc.value }],
              }
            : cc,
        )
      : ccs,
  }
}

export const StepSchema = z.preprocess(
  envelopesFromCCs,
  z.object({
    notes: z.array(midiValue).max(MAX_NOTES_PER_STEP),
    envelopes: z.array(EnvelopeSchema),
    state: z.enum(["normal", "rest", "skip"]),
    jump: JumpSchema,
  }),
)

export const PatternStepSchema = z.object({
  on: z.boolean(),
  articulation: z.enum(["none", "hold", "tie"]),
  accent: z.enum(["none", "+", "-"]),
  ratchet: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  probability: ProbabilitySchema,
  condition: z.enum([
    "always",
    "2:2",
    "3:3",
    "4:4",
    "1x",
    "2x",
    "3x",
    "last",
    "notLast",
  ]),
})

export const VoiceSchema = z.object({
  enabled: z.boolean(),
  pace: PaceIdSchema,
  length: z.number().min(0.1).max(1),
  rule: z.enum([
    "nth",
    "lowest",
    "highest",
    "random",
    "up",
    "down",
    "updown",
    "downup",
    "updown+",
    "downup+",
    "rise",
    "fall",
  ]),
  offset: z.number().int().min(-24).max(24),
  patternLength: z.number().int().min(1).max(MAX_PATTERN_LENGTH),
  pattern: z.array(PatternStepSchema).length(MAX_PATTERN_LENGTH),
  velocity: z.number().int().min(1).max(127),
  channel,
  // older files predate the built-in sound
  program: midiValue.default(0),
})

export const ModOutSchema = z.object({
  source: z.enum([
    "seqX",
    "seqY",
    "phase",
    "actionOr",
    "voice1Random",
    "voice2Random",
    "voice3Random",
    "voice4Random",
  ]),
  enabled: z.boolean(),
  cc: midiValue,
  min: midiValue,
  max: midiValue,
  smoothing: z.number().min(0).max(1),
})

export const PatchSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  size: z.enum(["small", "large"]),
  loop: z.object({
    mode: z.enum(["recorded", "all", "custom"]),
    end: z.number().int().min(0).max(63),
  }),
  // a file from when this was fixed at four, or could ask for sixteen, is
  // read as whatever it meant within today's range
  maxNotesPerStep: z.preprocess(
    (value) =>
      typeof value === "number"
        ? Math.min(NOTES_PER_STEP, Math.max(1, Math.round(value)))
        : value,
    z.number().int().min(1).max(NOTES_PER_STEP).default(NOTES_PER_STEP),
  ),
  syncVoices: z.boolean(),
  pace: PaceIdSchema,
  direction: z.enum(["fwd", "bwd", "fwdbwd", "bwdfwd", "random", "random+"]),
  shiftAmt: z.number().int().min(-24).max(24),
  tempo: z.number().min(20).max(400),
  steps: z.array(StepSchema).length(64),
  voices: z.array(VoiceSchema).length(4),
  modOuts: z.array(ModOutSchema).length(8),
})
