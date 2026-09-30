// Version 3 of a patch file, and 2 of a patterns file, renamed Shift to
// Transpose, and a voice's Offset to its own Transpose. A file from before
// is read under the new names before it is checked — and only such a file,
// so the old names are free for settings of their own.

type Names = ReadonlyMap<string, string>

const SEQUENCER: Names = new Map([
  ["shiftAmt", "transposeAmt"],
  ["shiftFit", "transposeFit"],
])
const VOICE: Names = new Map([
  ["offset", "transposeAmt"],
  ["offsetFit", "transposeFit"],
])
const ACTION: Names = new Map([["shift", "transpose"]])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// `value` with each key `names` has under its new name
const withKeys = (value: unknown, names: Names): unknown =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, each]) => [
          names.get(key) ?? key,
          each,
        ]),
      )
    : value

// a modulation's target, the setting it names as it is named now
const withTarget = (target: unknown): unknown => {
  if (!isObject(target) || typeof target.setting !== "string") {
    return target
  }
  const names =
    target.kind === "voice"
      ? VOICE
      : target.kind === "sequencer"
        ? SEQUENCER
        : target.kind === "action"
          ? ACTION
          : undefined
  const setting = names?.get(target.setting)
  return setting === undefined ? target : { ...target, setting }
}

/** A voice from a file before the renaming, under today's names. */
export const renamedVoice = (voice: unknown): unknown => withKeys(voice, VOICE)

/** A patch from a file before the renaming, under today's names. */
export const renamedPatch = (patch: unknown): unknown => {
  const renamed = withKeys(patch, SEQUENCER)
  if (!isObject(renamed)) {
    return renamed
  }
  const { voices, modulations } = renamed
  return {
    ...renamed,
    ...(Array.isArray(voices) && { voices: voices.map(renamedVoice) }),
    ...(Array.isArray(modulations) && {
      modulations: modulations.map((modulation) =>
        isObject(modulation)
          ? { ...modulation, target: withTarget(modulation.target) }
          : modulation,
      ),
    }),
  }
}

/** Whether `json` is a file saved before `version`, as far as it says. */
export const savedBefore = (
  json: unknown,
  version: number,
): json is Record<string, unknown> =>
  isObject(json) && typeof json.version === "number" && json.version < version
