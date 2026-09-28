import { PatchJSON, StepIndex, VoiceIndex } from "@midiseq/core"
import type RootStore from "../stores/RootStore"
import { InputError, readFields } from "./input"
import { ModelContextTool, ToolAnnotations } from "./modelContext"

/**
 * The view state the tools act on, as a person's clicks would: the step in
 * the step editor, and the voice in the Voices panel, which is also the one
 * Sync plays. Read as a tool runs rather than held, so it is always current.
 */
export interface ToolView {
  selectedStep(): StepIndex
  selectStep(step: StepIndex): void
  selectedVoice(): VoiceIndex
  selectVoice(voice: VoiceIndex): void
  // whether clicking a step sounds it: Audition step, above the grid
  auditions(): boolean
}

/** What a tool works with: the app's stores, its selection, and edits. */
export interface ToolContext {
  stores: RootStore
  view: ToolView
  // replaces the patch as one entry in the undo history
  edit: (next: PatchJSON) => void
}

export type Schema = { [key: string]: unknown }

export interface ObjectSchema extends Schema {
  type: "object"
  properties: Record<string, Schema>
}

// Plain JSON Schema, one type to a field, which every agent can read.
export const object = (
  properties: Record<string, Schema>,
  required: string[] = [],
  description?: string,
): ObjectSchema => ({
  type: "object",
  ...(description !== undefined && { description }),
  properties,
  ...(required.length > 0 && { required }),
  additionalProperties: false,
})

export const integer = (
  description: string,
  minimum: number,
  maximum: number,
) => ({ type: "integer", minimum, maximum, description })

export const number = (
  description: string,
  minimum: number,
  maximum: number,
) => ({ type: "number", minimum, maximum, description })

export const boolean = (description: string) => ({
  type: "boolean",
  description,
})

export const text = (description: string) => ({ type: "string", description })

export const oneOf = (values: readonly string[], description: string) => ({
  type: "string",
  enum: [...values],
  description,
})

export const list = (items: Schema, description: string) => ({
  type: "array",
  items,
  minItems: 1,
  description,
})

export const NO_INPUT = object({})

// the fields an object schema takes, which is all its input may hold
export const fieldsOf = (schema: ObjectSchema) => Object.keys(schema.properties)

// Null is taken as left out, as agents that fill in every field send it.
export const present = (value: unknown) => value !== undefined && value !== null

// whether input gives anything but the field saying which thing it changes
export const changesAny = (
  fields: Record<string, unknown>,
  schema: ObjectSchema,
  key: string,
) => fieldsOf(schema).some((field) => field !== key && present(fields[field]))

// "step 3", "steps 3 and 5", "dots 2, 4 and 9", from indexes counted from 0
export const named = (noun: string, indexes: readonly number[]) => {
  const numbers = indexes.map((index) => index + 1)
  const last = numbers[numbers.length - 1]
  return numbers.length === 1
    ? `${noun} ${last}`
    : `${noun}s ${numbers.slice(0, -1).join(", ")} and ${last}`
}

// The browser hands input over as an object; take text, too.
const parsed = (input: unknown): unknown => {
  if (input === undefined || input === null) {
    return {}
  }
  if (typeof input !== "string") {
    return input
  }
  try {
    return JSON.parse(input)
  } catch {
    throw new InputError("The input isn't JSON")
  }
}

export interface ToolSpec {
  name: string
  title: string
  description: string
  input: ObjectSchema
  annotations?: ToolAnnotations
  run: (input: Record<string, unknown>) => unknown
}

/**
 * A tool as WebMCP takes it. The browser tells an agent only that a tool
 * failed, never why, so input that can't be used comes back as an `error`
 * saying what to put right, with nothing changed.
 */
export const tool = ({ input, run, ...spec }: ToolSpec): ModelContextTool => ({
  ...spec,
  inputSchema: input,
  execute: async (raw) => {
    try {
      return run(readFields(parsed(raw), "The input", fieldsOf(input)))
    } catch (error) {
      if (error instanceof InputError) {
        return { error: error.message }
      }
      console.error(`The ${spec.name} tool failed`, error)
      return {
        error: `${spec.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})

export const PACE_HINT =
  "D is dotted and T triplet: 8thT is an eighth-note triplet, 1bar a whole bar"

export const FIT_HINT =
  "What becomes of a note moved out of the scale: up or down to the nearest note in it, left out (exclude), or let be (ignore)"
