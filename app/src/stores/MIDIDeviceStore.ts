import { VOICE_COUNT, VoiceIndex } from "@midiseq/core"
import { computed, makeObservable, observable, reaction } from "mobx"
import type { ReceiveChannel } from "../services/MIDIRecorder"
import { OutputAssignment } from "../services/OutputRouter"

export type OutputSlot = "all" | VoiceIndex

// Ports are remembered by name, which survives replugging and restarts,
// unlike Web MIDI port ids.
export interface OutputNames {
  all: string | null
  voices: (string | null)[]
}

export type RequestMIDIAccess = () => Promise<MIDIAccess>
export type QueryMIDIPermission = () => Promise<PermissionStatus>
export type MIDIPermission = "granted" | "denied" | "prompt" | "unknown"

// Chosen like a port, but resolved to the built-in synth rather than one
export const BUILTIN_OUTPUT = "Built-in synth"

const STORAGE_KEY = "midiseq.midiOutputs"
const INPUT_STORAGE_KEY = "midiseq.midiInput"

interface SavedInput {
  name: string | null
  channel: ReceiveChannel
}

const loadInput = (storage: Storage | null): SavedInput => {
  try {
    const saved = JSON.parse(storage?.getItem(INPUT_STORAGE_KEY) ?? "null")
    if (
      saved !== null &&
      (typeof saved.name === "string" || saved.name === null) &&
      (saved.channel === "omni" || typeof saved.channel === "number")
    ) {
      return saved as SavedInput
    }
  } catch {
    // fall through to the defaults
  }
  return { name: null, channel: "omni" }
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

const emptyOutputNames = (): OutputNames => ({
  all: null,
  voices: Array.from({ length: VOICE_COUNT }, () => null),
})

const loadOutputNames = (storage: Storage | null): OutputNames => {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null")
    if (
      saved !== null &&
      (typeof saved.all === "string" || saved.all === null) &&
      Array.isArray(saved.voices) &&
      saved.voices.length === VOICE_COUNT
    ) {
      return saved as OutputNames
    }
  } catch {
    // fall through to the defaults
  }
  return emptyOutputNames()
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
  inputName: string | null
  receiveChannel: ReceiveChannel

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
    const savedInput = loadInput(storage)
    this.inputName = savedInput.name
    this.receiveChannel = savedInput.channel

    makeObservable(this, {
      outputs: observable.ref,
      inputs: observable.ref,
      isLoading: observable,
      requestError: observable,
      hasAccess: observable,
      permission: observable,
      outputNames: observable.ref,
      inputName: observable,
      receiveChannel: observable,
      // keepAlive caches the value between reads outside a reaction, so React
      // gets the same array back until the ports actually change
      connectedOutputNames: computed({ keepAlive: true }),
      connectedInputNames: computed({ keepAlive: true }),
      assignment: computed({ keepAlive: true }),
      inputPort: computed({ keepAlive: true }),
    })

    reaction(
      () => this.outputNames,
      (names) => {
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify(names))
        } catch {
          // storage can be full or blocked; the choice just won't persist
        }
      },
    )

    reaction(
      () => ({ name: this.inputName, channel: this.receiveChannel }),
      (input) => {
        try {
          storage?.setItem(INPUT_STORAGE_KEY, JSON.stringify(input))
        } catch {
          // as above
        }
      },
    )
  }

  get isSupported(): boolean {
    return this.requestAccess !== null
  }

  /**
   * Asks for MIDI access as the app starts, which is where the browser shows
   * its permission prompt. A browser that already refused is left alone; the
   * menu's Enable MIDI button asks again from a click.
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

  setOutputName = (slot: OutputSlot, name: string | null) => {
    this.outputNames =
      slot === "all"
        ? { ...this.outputNames, all: name }
        : {
            ...this.outputNames,
            voices: this.outputNames.voices.map((current, index) =>
              index === slot ? name : current,
            ),
          }
  }

  setInputName = (name: string | null) => {
    this.inputName = name
  }

  setReceiveChannel = (channel: ReceiveChannel) => {
    this.receiveChannel = channel
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

  // The chosen input, when it is connected.
  get inputPort(): MIDIInput | null {
    if (this.inputName === null) {
      return null
    }
    return (
      this.inputs.find(
        (input) =>
          input.state === "connected" && portName(input) === this.inputName,
      ) ?? null
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

  // The chosen ports that are currently connected.
  get assignment(): OutputAssignment {
    const resolve = (name: string | null) =>
      name === null || name === BUILTIN_OUTPUT
        ? null
        : (this.outputs.find(
            (output) =>
              output.state === "connected" && portName(output) === name,
          ) ?? null)
    return {
      all: resolve(this.outputNames.all),
      voices: this.outputNames.voices.map(resolve),
    }
  }

  private updatePorts(access: MIDIAccess) {
    this.outputs = Array.from(access.outputs.values())
    this.inputs = Array.from(access.inputs.values())
  }
}
