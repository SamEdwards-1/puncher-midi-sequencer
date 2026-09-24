import { z } from "zod"
import { PatternStepSchema } from "../entities/schema"
import {
  MAX_PATTERN_LENGTH,
  PatchJSON,
  VOICE_COUNT,
  VoiceJSON,
} from "../entities/types"
import { describeIssue } from "./file"

export const PATTERNS_FORMAT = "midiseq-patterns"
export const PATTERNS_VERSION = 1
// Chrome's file pickers take an extension only if it is at most 16
// characters of letters, digits, "+" and "." — no hyphen.
export const PATTERNS_EXTENSION = ".midiseqpat.json"

// A voice's rhythm: its dots, their options, and how many of them play. Its
// pace, rule and the rest stay with the patch, so patterns can be tried
// against a different patch.
export const VoicePatternSchema = z.object({
  patternLength: z.number().int().min(1).max(MAX_PATTERN_LENGTH),
  pattern: z.array(PatternStepSchema).length(MAX_PATTERN_LENGTH),
})

export type VoicePattern = Pick<VoiceJSON, "patternLength" | "pattern">

export const PatternsFileSchema = z.object({
  format: z.literal(PATTERNS_FORMAT),
  version: z.number().int().min(1),
  app: z.object({ name: z.string(), version: z.string() }).optional(),
  savedAt: z.string().optional(),
  voices: z.array(VoicePatternSchema).length(VOICE_COUNT),
})

export type PatternsFile = z.infer<typeof PatternsFileSchema>

export const createPatternsFile = (
  patch: PatchJSON,
  appVersion = "0.0.1",
): PatternsFile => ({
  format: PATTERNS_FORMAT,
  version: PATTERNS_VERSION,
  app: { name: "midiseq", version: appVersion },
  savedAt: new Date().toISOString(),
  voices: patch.voices.map(({ patternLength, pattern }) => ({
    patternLength,
    pattern,
  })),
})

export const serializePatterns = (file: PatternsFile): string =>
  `${JSON.stringify(file, null, 2)}\n`

export type PatternsParseResult =
  | { ok: true; voices: VoicePattern[] }
  | { ok: false; error: string }

export const parsePatternsFile = (text: string): PatternsParseResult => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't JSON." }
  }

  const parsed = PatternsFileSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: describeIssue(parsed.error) }
  }
  if (parsed.data.version > PATTERNS_VERSION) {
    return {
      ok: false,
      error: "Those patterns were saved by a newer version of midiseq.",
    }
  }
  return { ok: true, voices: parsed.data.voices as VoicePattern[] }
}

/** Puts every voice's pattern in place, leaving the rest of each voice be. */
export const setPatterns = (
  patch: PatchJSON,
  voices: VoicePattern[],
): PatchJSON => ({
  ...patch,
  voices: patch.voices.map((voice, index) => ({
    ...voice,
    patternLength: voices[index].patternLength,
    pattern: voices[index].pattern,
  })),
})
