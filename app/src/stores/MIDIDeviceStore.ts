import { VOICE_COUNT, VoiceIndex } from "@midiseq/core"
import { computed, makeObservable, observable, reaction } from "mobx"
import { OutputAssignment } from "../services/OutputRouter"

export type OutputSlot = "all" | VoiceIndex

// Ports are remembered by name, which survives replugging and restarts,
// unlike Web MIDI port ids.
export interface OutputNames {
  all: string | null
  voices: (string | null)[]
}

export type RequestMIDIAccess = () => Promise<MIDIAccess>

const STORAGE_KEY = "midiseq.midiOutputs"

const defaultRequestAccess = (): RequestMIDIAccess | null =>
  typeof navigator !== "undefined" &&
  typeof navigator.requestMIDIAccess === "function"
    ? () => navigator.requestMIDIAccess({ sysex: false })
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
  outputNames: OutputNames

  private readonly requestAccess: RequestMIDIAccess | null

  constructor(
    requestAccess: RequestMIDIAccess | null = defaultRequestAccess(),
    storage: Storage | null = defaultStorage(),
  ) {
    this.requestAccess = requestAccess
    this.outputNames = loadOutputNames(storage)

    makeObservable(this, {
      outputs: observable.ref,
      inputs: observable.ref,
      isLoading: observable,
      requestError: observable,
      outputNames: observable.ref,
      // keepAlive caches the value between reads outside a reaction, so React
      // gets the same array back until the ports actually change
      connectedOutputNames: computed({ keepAlive: true }),
      assignment: computed({ keepAlive: true }),
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
  }

  get isSupported(): boolean {
    return this.requestAccess !== null
  }

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
    } catch (error) {
      this.requestError =
        error instanceof Error ? error : new Error(String(error))
    } finally {
      this.isLoading = false
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

  get connectedOutputNames(): string[] {
    return [
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
      name === null
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
