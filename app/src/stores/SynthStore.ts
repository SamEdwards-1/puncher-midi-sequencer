import { makeObservable, observable } from "mobx"
import {
  SoundFontSynth,
  SoundFontSynthOptions,
} from "../services/SoundFontSynth"

export type SynthState = "off" | "loading" | "ready" | "error"

/**
 * The built-in sound. It is made, and given its SoundFont, as soon as it is
 * wanted — at startup, if it was chosen last time — with its audio context
 * waiting, since audio only starts from something the user did. The first
 * click or key press starts it, by which time it has long since loaded.
 */
export class SynthStore {
  state: SynthState = "off"
  error: string | null = null
  synth: SoundFontSynth | null = null
  // the SoundFont it plays, once one has loaded
  fontId: number | null = null

  private context: AudioContext | null = null
  // made once; `synth` shows it to the router once it has a sound
  private sound: SoundFontSynth | null = null
  private request = 0
  private disposed = false

  constructor(
    private readonly createContext: () => AudioContext = () =>
      new AudioContext(),
    private readonly synthOptions: SoundFontSynthOptions = {},
  ) {
    makeObservable(this, {
      state: observable,
      error: observable,
      synth: observable.ref,
      fontId: observable,
    })
  }

  /**
   * Plays the SoundFont `id`, whose bytes `bytes` gives. Asked again before
   * one has finished, only the last is loaded.
   */
  use = async (id: number, bytes: (id: number) => Promise<ArrayBuffer>) => {
    if (this.disposed || (id === this.fontId && this.state === "ready")) {
      return
    }
    const request = ++this.request
    this.state = "loading"
    this.error = null
    try {
      this.context ??= this.createContext()
      this.sound ??= new SoundFontSynth(this.context, this.synthOptions)
      const synth = this.sound
      const data = await bytes(id)
      if (request !== this.request) {
        return
      }
      await synth.loadSoundFont(data)
      if (this.disposed) {
        return
      }
      // it plays this one, whatever has been asked for since
      this.synth = synth
      this.fontId = id
      if (request === this.request) {
        this.state = "ready"
      }
    } catch (error) {
      if (request !== this.request) {
        return
      }
      this.error = error instanceof Error ? error.message : String(error)
      this.state = "error"
    }
  }

  /** Whether the audio is waiting for a gesture to let it start. */
  get waiting(): boolean {
    return this.context?.state === "suspended"
  }

  /**
   * Starts the audio; it only takes, as browsers see it, during a gesture.
   * Out of one, as at startup, it waits, since asking then only draws the
   * browser's warning.
   */
  resume = () => {
    if (globalThis.navigator?.userActivation?.isActive === false) {
      return
    }
    if (this.context !== null && this.context.state !== "running") {
      void this.context.resume().catch(() => undefined)
    }
  }

  /**
   * Closes the audio context it made, which ends the sound and frees the
   * audio thread. A SoundFont still loading is dropped, and asking for one
   * afterwards does nothing.
   */
  dispose = () => {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.request++
    const context = this.context
    this.context = null
    this.sound = null
    if (context !== null && context.state !== "closed") {
      void context.close().catch(() => undefined)
    }
  }

  /**
   * Starts the audio with the user's first click or key press anywhere, as
   * the one that chose the sound may have been in an earlier visit.
   */
  resumeOnGesture = (target: EventTarget) => {
    const events = ["pointerdown", "keydown"]
    for (const event of events) {
      target.addEventListener(event, this.resume, { capture: true })
    }
    return () => {
      for (const event of events) {
        target.removeEventListener(event, this.resume, { capture: true })
      }
    }
  }
}
