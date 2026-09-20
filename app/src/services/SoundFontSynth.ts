import { MIDISink } from "./MIDISink"

/** The part of spessasynth's synthesizer we use. */
export interface SynthLike {
  connect(node: AudioNode): unknown
  noteOn(
    channel: number,
    note: number,
    velocity: number,
    options?: { time: number },
  ): void
  noteOff(channel: number, note: number, options?: { time: number }): void
  controllerChange(
    channel: number,
    controller: number,
    value: number,
    options?: { time: number },
  ): void
  programChange(
    channel: number,
    program: number,
    options?: { time: number },
  ): void
  isReady: Promise<unknown>
  soundBankManager: {
    addSoundBank(data: ArrayBuffer, id: string): unknown
  }
}

export interface SoundFontSynthOptions {
  createSynth?: (context: AudioContext) => Promise<SynthLike>
  fetchSoundFont?: () => Promise<ArrayBuffer>
  now?: () => number
}

// The GM set Signal uses, so the built-in sound needs nothing bundled.
export const DEFAULT_SOUNDFONT_URL =
  "https://cdn.jsdelivr.net/gh/ryohey/signal@6959f35/public/A320U.sf2"

const defaultCreateSynth = async (
  context: AudioContext,
): Promise<SynthLike> => {
  const { WorkletSynthesizer } = await import("spessasynth_lib")
  await context.audioWorklet.addModule(
    new URL(
      "spessasynth_lib/dist/spessasynth_processor.min.js",
      import.meta.url,
    ),
  )
  const synth = new WorkletSynthesizer(context)
  return synth as unknown as SynthLike
}

const defaultFetchSoundFont = async (): Promise<ArrayBuffer> => {
  const response = await fetch(DEFAULT_SOUNDFONT_URL)
  if (!response.ok) {
    throw new Error(`Couldn't fetch the SoundFont (${response.status})`)
  }
  return response.arrayBuffer()
}

/**
 * The built-in sound: a SoundFont synth on an AudioWorklet, voiced per MIDI
 * channel the way Signal voices its tracks. It takes the same bytes a MIDI
 * port does, so the router can send to it like any other output.
 */
export class SoundFontSynth implements MIDISink {
  private synth: SynthLike | null = null

  constructor(
    private readonly context: AudioContext,
    private readonly options: SoundFontSynthOptions = {},
  ) {}

  get isLoaded(): boolean {
    return this.synth !== null
  }

  async load() {
    if (this.synth !== null) {
      return
    }
    const create = this.options.createSynth ?? defaultCreateSynth
    const fetchFont = this.options.fetchSoundFont ?? defaultFetchSoundFont

    const synth = await create(this.context)
    synth.connect(this.context.destination)
    await synth.soundBankManager.addSoundBank(await fetchFont(), "main")
    await synth.isReady
    this.synth = synth
  }

  // Channels arrive 1-based, as the rest of the app uses them.
  send(data: number[], timestamp?: number) {
    const synth = this.synth
    if (synth === null || data.length < 2) {
      return
    }
    const status = data[0] & 0xf0
    const channel = data[0] & 0x0f
    const options = { time: this.timeOf(timestamp) }
    const [, first, second] = data

    switch (status) {
      case 0x90:
        if (second > 0) {
          synth.noteOn(channel, first, second, options)
        } else {
          synth.noteOff(channel, first, options)
        }
        break
      case 0x80:
        synth.noteOff(channel, first, options)
        break
      case 0xb0:
        synth.controllerChange(channel, first, second ?? 0, options)
        break
      case 0xc0:
        synth.programChange(channel, first, options)
        break
    }
  }

  setProgram(channel: number, program: number) {
    this.synth?.programChange(channel - 1, program)
  }

  // The router schedules against performance.now(); Web Audio counts seconds
  // from the context's own clock.
  private timeOf(timestamp?: number): number {
    const now = this.options.now?.() ?? performance.now()
    const ahead = timestamp === undefined ? 0 : (timestamp - now) / 1000
    return this.context.currentTime + Math.max(0, ahead)
  }
}
