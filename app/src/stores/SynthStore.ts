import { makeObservable, observable } from "mobx"
import {
  SoundFontSynth,
  SoundFontSynthOptions,
} from "../services/SoundFontSynth"

export type SynthState = "off" | "loading" | "ready" | "error"

/**
 * The built-in sound. Audio can only start from something the user did, so
 * the context and the SoundFont are created the first time it is chosen as
 * an output.
 */
export class SynthStore {
  state: SynthState = "off"
  error: string | null = null
  synth: SoundFontSynth | null = null

  private context: AudioContext | null = null

  constructor(
    private readonly createContext: () => AudioContext = () =>
      new AudioContext(),
    private readonly synthOptions: SoundFontSynthOptions = {},
  ) {
    makeObservable(this, {
      state: observable,
      error: observable,
      synth: observable.ref,
    })
  }

  // Safe to call whenever the built-in sound might be needed.
  enable = async () => {
    if (this.state === "loading" || this.state === "ready") {
      await this.context?.resume()
      return
    }
    this.state = "loading"
    this.error = null
    try {
      this.context ??= this.createContext()
      await this.context.resume()
      const synth = new SoundFontSynth(this.context, this.synthOptions)
      await synth.load()
      this.synth = synth
      this.state = "ready"
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      this.state = "error"
    }
  }
}
