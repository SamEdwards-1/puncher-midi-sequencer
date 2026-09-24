import { z } from "zod"
import { VoiceSchema } from "../entities/schema"
import { PatchJSON, VOICE_COUNT, VoiceJSON } from "../entities/types"
import { describeIssue } from "./file"

export const PATTERNS_FORMAT = "midiseq-patterns"
export const PATTERNS_VERSION = 1
// Chrome's file pickers take an extension only if it is at most 16
// characters of letters, digits, "+" and "." — no hyphen.
export const PATTERNS_EXTENSION = ".midiseqpat.json"

// A voice whole: its dots and every setting that shapes how it plays them —
// pace, length, rule, offset, velocity, channel, instrument. The sequencer
// and its steps stay with the patch, so a set of voices can be tried against
// another sequence. Files from before the settings came along hold only the
// dots and their length; those still open, and change only that.
export const VoicePatternSchema = VoiceSchema.partial().required({
  patternLength: true,
  pattern: true,
})

export type VoicePattern = Partial<VoiceJSON> &
  Pick<VoiceJSON, "patternLength" | "pattern">

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
  voices: patch.voices,
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

/** Puts every voice in place, with whatever the file holds of it. */
export const setPatterns = (
  patch: PatchJSON,
  voices: VoicePattern[],
): PatchJSON => ({
  ...patch,
  voices: patch.voices.map((voice, index) => ({ ...voice, ...voices[index] })),
})
