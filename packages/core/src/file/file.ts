import { z } from "zod"
import { toBeatTimes } from "../entities/envelope"
import { paceBeats } from "../entities/paces"
import { PatchSchema } from "../entities/schema"
import { PatchJSON } from "../entities/types"

export const FILE_FORMAT = "midiseq"
export const FILE_VERSION = 2
export const FILE_EXTENSION = ".midiseq.json"

export const MidiseqFileSchema = z.object({
  // checked on open, so another JSON file is refused rather than misread
  format: z.literal(FILE_FORMAT),
  version: z.number().int().min(1),
  app: z.object({ name: z.string(), version: z.string() }).optional(),
  savedAt: z.string().optional(),
  patch: PatchSchema,
  ui: z
    .object({
      selectedVoice: z.number().int().min(0).max(3),
      selectedStep: z.number().int().min(0).max(63),
    })
    .partial()
    .optional(),
})

export type MidiseqFile = z.infer<typeof MidiseqFileSchema>

export interface FileView {
  selectedVoice?: number
  selectedStep?: number
}

export const createFile = (
  patch: PatchJSON,
  ui: FileView = {},
  appVersion = "0.0.1",
): MidiseqFile =>
  ({
    format: FILE_FORMAT,
    version: FILE_VERSION,
    app: { name: "midiseq", version: appVersion },
    savedAt: new Date().toISOString(),
    patch,
    ui,
  }) as MidiseqFile

// Pretty-printed, so saved files diff well in version control.
export const serializeFile = (file: MidiseqFile): string =>
  `${JSON.stringify(file, null, 2)}\n`

export type ParseResult =
  | { ok: true; file: MidiseqFile; patch: PatchJSON }
  | { ok: false; error: string }

// The first thing wrong with a file, and where, e.g. "patch.tempo: Too big".
export const describeIssue = (error: z.ZodError): string => {
  const issue = error.issues[0]
  const where = issue.path.join(".")
  return where === "" ? issue.message : `${where}: ${issue.message}`
}

/**
 * Brings a file up to the current version, one step at a time.
 *
 * 1 → 2: envelope point times were fractions of the step, and are now beats
 * from its start. Scaled by the pace the file was saved with, every envelope
 * sounds exactly as it did.
 */
const migrate = (file: MidiseqFile): MidiseqFile => {
  if (file.version >= FILE_VERSION) {
    return file
  }
  const patch = file.patch as unknown as PatchJSON
  const stepBeats = paceBeats(patch.pace)
  return {
    ...file,
    version: FILE_VERSION,
    patch: {
      ...patch,
      steps: patch.steps.map((step) => ({
        ...step,
        envelopes: step.envelopes.map((envelope) => ({
          ...envelope,
          points: toBeatTimes(envelope.points, stepBeats),
        })),
      })),
    } as unknown as MidiseqFile["patch"],
  }
}

export const parseFile = (text: string): ParseResult => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't JSON." }
  }

  const parsed = MidiseqFileSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: describeIssue(parsed.error) }
  }
  if (parsed.data.version > FILE_VERSION) {
    return {
      ok: false,
      error: "That file was saved by a newer version of midiseq.",
    }
  }

  const file = migrate(parsed.data)
  return { ok: true, file, patch: file.patch as unknown as PatchJSON }
}
