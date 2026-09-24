import {
  createDefaultMIDIFilter,
  MIDIFilterJSON,
  VOICE_COUNT,
  VoiceIndex,
} from "@midiseq/core"
import { computed, makeObservable, observable, reaction } from "mobx"

export type OutputSlot = "all" | VoiceIndex

/**
 * Ports are remembered by name, which survives replugging and restarts,
 * unlike Web MIDI port ids. `all` is every port that takes the whole
 * sequence; a voice can name one port of its own as well.
 */
export interface OutputNames {
  all: string[]
  voices: (string | null)[]
}

export type RequestMIDIAccess = () => Promise<MIDIAccess>
export type QueryMIDIPermission = () => Promise<PermissionStatus>
export type MIDIPermission = "granted" | "denied" | "prompt" | "unknown"

// Chosen like a port, but resolved to the built-in synth rather than one
export const BUILTIN_OUTPUT = "Built-in synth"

const STORAGE_KEY = "midiseq.midiOutputs"
const INPUT_STORAGE_KEY = "midiseq.midiInput"
const FILTER_STORAGE_KEY = "midiseq.midiFilter"
const CLOCK_STORAGE_KEY = "midiseq.midiClock"

const read = (storage: Storage | null, key: string): unknown => {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null")
  } catch {
    return null
  }
}

const write = (storage: Storage | null, key: string, value: unknown) => {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // storage can be full or blocked; the choice just won't persist
  }
}

const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((name) => typeof name === "string") : []

/** Older versions kept one input name and a receive channel beside it. */
const loadInputNames = (storage: Storage | null): string[] => {
  const saved = read(storage, INPUT_STORAGE_KEY)
  if (saved !== null && typeof saved === "object" && "name" in saved) {
    const name = (saved as { name: unknown }).name
    return typeof name === "string" ? [name] : []
  }
  return names(saved)
}

/** Older versions sent the whole sequence to at most one port. */
const loadOutputNames = (storage: Storage | null): OutputNames => {
  const empty: OutputNames = {
    all: [],
    voices: Array.from({ length: VOICE_COUNT }, () => null),
  }
  const saved = read(storage, STORAGE_KEY)
  if (saved === null || typeof saved !== "object") {
    return empty
  }
  const { all, voices } = saved as { all: unknown; voices: unknown }
  return {
    all: typeof all === "string" ? [all] : names(all),
    voices:
      Array.isArray(voices) && voices.length === VOICE_COUNT
        ? (voices as (string | null)[])
        : empty.voices,
  }
}

const loadFilter = (storage: Storage | null): MIDIFilterJSON => {
  const fallback = createDefaultMIDIFilter()
  const saved = read(storage, FILTER_STORAGE_KEY)
  if (saved === null || typeof saved !== "object") {
    return fallback
  }
  const { channels, noteLow, noteHigh, transpose, ccs } =
    saved as Partial<MIDIFilterJSON>
  const numbers = (value: unknown, or: number[]) =>
    Array.isArray(value) && value.every((n) => typeof n === "number")
      ? value
      : or
  const number = (value: unknown, or: number) =>
    typeof value === "number" ? value : or
  return {
    channels: numbers(channels, fallback.channels),
    noteLow: number(noteLow, fallback.noteLow),
    noteHigh: number(noteHigh, fallback.noteHigh),
    transpose: number(transpose, fallback.transpose),
    ccs: numbers(ccs, fallback.ccs),
  }
}

const defaultRequestAccess = (): RequestMIDIAccess | null =>
  typeof navigator !== "undefined" &&
  typeof navigator.requestMIDIAccess === "function"
    ? () => navigator.requestMIDIAccess({ sysex: false })
    : null

const defaultQueryPermission = (): QueryMIDIPermission | null =>
  typeof navigator !== "undefined" && navigator.permissions !== undefined
    ? () =>
        navigator.permissions.query({
          name: "midi",
          sysex: false,
          // "midi" is a valid permission name but missing from the DOM types
        } as unknown as PermissionDescriptor)
    : null

const defaultStorage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * midiseq keeps its own transport either way. It offers its clock unless that
 * is turned off, and can take a tempo — only a tempo — from a clock arriving
 * at one of its inputs.
 */
export interface ClockSettings {
  send: boolean
  followTempo: boolean
}

const loadClock = (storage: Storage | null): ClockSettings => {
  const saved = read(storage, CLOCK_STORAGE_KEY)
  if (saved === null || typeof saved !== "object") {
    return { send: true, followTempo: false }
  }
  const { send, followTempo } = saved as Partial<ClockSettings>
  return { send: send !== false, followTempo: followTempo === true }
}

export const portName = (port: MIDIPort): string => port.name ?? port.id

export class MIDIDeviceStore {
  outputs: MIDIOutput[] = []
  inputs: MIDIInput[] = []
  isLoading = false
  requestError: Error | null = null
  // true once the browser has handed over MIDI access
  hasAccess = false
  permission: MIDIPermission = "unknown"
  outputNames: OutputNames
  inputNames: string[]
  filter: MIDIFilterJSON
  clock: ClockSettings

  private readonly requestAccess: RequestMIDIAccess | null
  private readonly queryPermission: QueryMIDIPermission | null

  constructor(
    requestAccess: RequestMIDIAccess | null = defaultRequestAccess(),
    storage: Storage | null = defaultStorage(),
    queryPermission: QueryMIDIPermission | null = defaultQueryPermission(),
  ) {
    this.requestAccess = requestAccess
    this.queryPermission = queryPermission
    this.outputNames = loadOutputNames(storage)
    this.inputNames = loadInputNames(storage)
    this.filter = loadFilter(storage)
    this.clock = loadClock(storage)

    makeObservable(this, {
      outputs: observable.ref,
      inputs: observable.ref,
      isLoading: observable,
      requestError: observable,
      hasAccess: observable,
      permission: observable,
      outputNames: observable.ref,
      inputNames: observable.ref,
      filter: observable.ref,
      clock: observable.ref,
      // keepAlive caches the value between reads outside a reaction, so React
      // gets the same array back until the ports actually change
      connectedOutputNames: computed({ keepAlive: true }),
      connectedInputNames: computed({ keepAlive: true }),
      assignment: computed({ keepAlive: true }),
      inputPorts: computed({ keepAlive: true }),
    })

    reaction(
      () => this.outputNames,
      (value) => write(storage, STORAGE_KEY, value),
    )
    reaction(
      () => this.inputNames,
      (value) => write(storage, INPUT_STORAGE_KEY, value),
    )
    reaction(
      () => this.filter,
      (value) => write(storage, FILTER_STORAGE_KEY, value),
    )
    reaction(
      () => this.clock,
      (value) => write(storage, CLOCK_STORAGE_KEY, value),
    )
  }

  get isSupported(): boolean {
    return this.requestAccess !== null
  }

  /**
   * Asks for MIDI access as the app starts, which is where the browser shows
   * its permission prompt. A browser that already refused is left alone; the
   * settings dialog's Enable MIDI button asks again from a click.
   */
  connectOnStart = async () => {
    await this.refreshPermission()
    if (this.permission !== "denied") {
      await this.requestMIDIAccess()
    }
  }

  refreshPermission = async () => {
    if (this.queryPermission === null) {
      return
    }
    try {
      const status = await this.queryPermission()
      this.permission = status.state as MIDIPermission
      status.onchange = () => {
        this.permission = status.state as MIDIPermission
      }
    } catch {
      // Firefox and Safari don't answer for "midi"
      this.permission = "unknown"
    }
  }

  // Call this from a click so the browser can show its permission prompt.
  requestMIDIAccess = async () => {
    if (this.requestAccess === null) {
      return
    }
    this.isLoading = true
    this.requestError = null
    try {
      const access = await this.requestAccess()
      this.updatePorts(access)
      access.onstatechange = () => this.updatePorts(access)
      this.hasAccess = true
    } catch (error) {
      this.requestError =
        error instanceof Error ? error : new Error(String(error))
    } finally {
      this.isLoading = false
      await this.refreshPermission()
    }
  }

  // Ticking a port sends the whole sequence to it as well.
  toggleOutput = (name: string, on: boolean) => {
    const all = this.outputNames.all.filter((current) => current !== name)
    this.outputNames = { ...this.outputNames, all: on ? [...all, name] : all }
  }

  setVoiceOutput = (voice: VoiceIndex, name: string | null) => {
    this.outputNames = {
      ...this.outputNames,
      voices: this.outputNames.voices.map((current, index) =>
        index === voice ? name : current,
      ),
    }
  }

  toggleInput = (name: string, on: boolean) => {
    const rest = this.inputNames.filter((current) => current !== name)
    this.inputNames = on ? [...rest, name] : rest
  }

  setFilter = (changes: Partial<MIDIFilterJSON>) => {
    this.filter = { ...this.filter, ...changes }
  }

  setClock = (changes: Partial<ClockSettings>) => {
    this.clock = { ...this.clock, ...changes }
  }

  get connectedInputNames(): string[] {
    return [
      ...new Set(
        this.inputs
          .filter((input) => input.state === "connected")
          .map(portName),
      ),
    ]
  }

  // The chosen inputs that are currently connected.
  get inputPorts(): MIDIInput[] {
    return this.inputs.filter(
      (input) =>
        input.state === "connected" &&
        this.inputNames.includes(portName(input)),
    )
  }

  get connectedOutputNames(): string[] {
    return [
      BUILTIN_OUTPUT,
      ...new Set(
        this.outputs
          .filter((output) => output.state === "connected")
          .map(portName),
      ),
    ]
  }

  /**
   * The chosen ports, resolved. `all` lines up with the chosen names, with a
   * null where the port is missing or is the built-in synth, which the store
   * knows nothing about.
   */
  get assignment(): {
    all: (MIDIOutput | null)[]
    voices: (MIDIOutput | null)[]
  } {
    const resolve = (name: string | null) =>
      name === null || name === BUILTIN_OUTPUT
        ? null
        : (this.outputs.find(
            (output) =>
              output.state === "connected" && portName(output) === name,
          ) ?? null)
    return {
      all: this.outputNames.all.map(resolve),
      voices: this.outputNames.voices.map(resolve),
    }
  }

  private updatePorts(access: MIDIAccess) {
    this.outputs = Array.from(access.outputs.values())
    this.inputs = Array.from(access.inputs.values())
  }
}
