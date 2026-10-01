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
  now?: () => number
}

// Leave the worklet time to receive a scheduled MIDI message before its
// audio block is rendered.
const WORKLET_LEAD_MS = 25

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

/**
 * The built-in sound: a SoundFont synth on an AudioWorklet, voiced per MIDI
 * channel the way Signal voices its tracks. It takes the same bytes a MIDI
 * port does, so the router can send to it like any other output.
 *
 * It can be made, and given its SoundFont, while the audio context is still
 * waiting for a click to start, so it is ready the moment one comes.
 */
export class SoundFontSynth implements MIDISink {
  private synth: SynthLike | null = null
  private created: Promise<SynthLike> | null = null
  private loaded = false

  constructor(
    private readonly context: AudioContext,
    private readonly options: SoundFontSynthOptions = {},
  ) {}

  get isLoaded(): boolean {
    return this.loaded
  }

  /** Swaps in a SoundFont, the first one or another. */
  async loadSoundFont(data: ArrayBuffer) {
    this.created ??= (this.options.createSynth ?? defaultCreateSynth)(
      this.context,
    ).then(
      (synth) => {
        synth.connect(this.context.destination)
        return synth
      },
      (error) => {
        // tried afresh next time, rather than failing for good
        this.created = null
        throw error
      },
    )
    const synth = await this.created
    // a copy, as the bytes may be handed over to the worklet's thread
    await synth.soundBankManager.addSoundBank(data.slice(0), "main")
    await synth.isReady
    this.synth = synth
    this.loaded = true
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

  minimumLeadMs(now: number): number {
    const output = this.outputTimestamp()
    if (output !== null) {
      const earliestOutput =
        output.performanceTime +
        (this.context.currentTime - output.contextTime) * 1000
      return Math.max(0, earliestOutput - now) + WORKLET_LEAD_MS
    }
    return this.estimatedLatency() * 1000 + WORKLET_LEAD_MS
  }

  private outputTimestamp(): {
    contextTime: number
    performanceTime: number
  } | null {
    const stamp = this.context.getOutputTimestamp?.()
    return stamp !== undefined &&
      typeof stamp.contextTime === "number" &&
      stamp.contextTime > 0 &&
      typeof stamp.performanceTime === "number" &&
      Number.isFinite(stamp.performanceTime)
      ? {
          contextTime: stamp.contextTime,
          performanceTime: stamp.performanceTime,
        }
      : null
  }

  private estimatedLatency(): number {
    return (this.context.baseLatency ?? 0) + (this.context.outputLatency ?? 0)
  }

  // The router uses performance.now() timestamps. Correlate that clock with
  // the sample reaching the output device, including its buffered latency.
  private timeOf(timestamp?: number): number {
    const now = this.options.now?.() ?? performance.now()
    const at = timestamp ?? now
    const output = this.outputTimestamp()
    return Math.max(
      this.context.currentTime,
      output === null
        ? this.context.currentTime + (at - now) / 1000 - this.estimatedLatency()
        : output.contextTime + (at - output.performanceTime) / 1000,
    )
  }
}
