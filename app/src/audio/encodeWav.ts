import type { WavBitDepth } from "./audioExport"

// A plain WAV file's header: RIFF, a format chunk, and the data chunk's own
// header, before its samples.
const HEADER = 44

// RIFF counts a file's size in 32 bits.
const MAX_RIFF_SIZE = 0xffffffff

// Each sample scaled and rounded as wav-encoder did, so a file is the same
// whether it was written at once or a piece at a time: PCM clipped to full
// scale and rounded, or floating point as it is.
const SAMPLE_WRITERS: Record<
  WavBitDepth,
  (view: DataView, at: number, sample: number) => void
> = {
  16: (view, at, sample) => {
    const clipped = Math.max(-1, Math.min(sample, 1))
    const value = clipped < 0 ? clipped * 32768 : clipped * 32767
    view.setInt16(at, Math.round(value) | 0, true)
  },
  24: (view, at, sample) => {
    const clipped = Math.max(-1, Math.min(sample, 1))
    const value =
      Math.round(
        clipped < 0 ? 0x1000000 + clipped * 8388608 : clipped * 8388607,
      ) | 0
    view.setUint8(at, value & 0xff)
    view.setUint8(at + 1, (value >> 8) & 0xff)
    view.setUint8(at + 2, (value >> 16) & 0xff)
  },
  32: (view, at, sample) => view.setFloat32(at, sample, true),
}

/**
 * A WAV file written a piece at a time: its header first, which says how
 * many samples follow, so it is told that up front; then the samples, a
 * chunk at a time, as they are made. 16- and 24-bit are PCM, 32 floating
 * point.
 */
export class WavWriter {
  private readonly bytesPerSample: number
  private readonly dataSize: number

  constructor(
    private readonly channels: number,
    private readonly sampleRate: number,
    private readonly bitDepth: WavBitDepth,
    frames: number,
  ) {
    this.bytesPerSample = bitDepth / 8
    this.dataSize = frames * channels * this.bytesPerSample
    if (HEADER - 8 + this.dataSize > MAX_RIFF_SIZE) {
      throw new Error(
        "This render is too long for a WAV file, which can hold no more than 4 GB. MP3, a lower bit depth, or mono can hold it.",
      )
    }
  }

  start(): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(HEADER)
    const view = new DataView(bytes.buffer)
    const text = (at: number, value: string) => {
      for (let index = 0; index < value.length; index++) {
        view.setUint8(at + index, value.charCodeAt(index))
      }
    }
    const blockAlign = this.channels * this.bytesPerSample
    text(0, "RIFF")
    view.setUint32(4, HEADER - 8 + this.dataSize, true)
    text(8, "WAVE")
    text(12, "fmt ")
    view.setUint32(16, 16, true)
    // PCM, or IEEE floating point
    view.setUint16(20, this.bitDepth === 32 ? 3 : 1, true)
    view.setUint16(22, this.channels, true)
    view.setUint32(24, this.sampleRate, true)
    view.setUint32(28, this.sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, this.bitDepth, true)
    text(36, "data")
    view.setUint32(40, this.dataSize, true)
    return bytes
  }

  // A chunk of samples, a channel to each array, interleaved as WAV has them.
  encode(chunk: readonly Float32Array[]): Uint8Array<ArrayBuffer> {
    const frames = chunk[0].length
    const bytes = new Uint8Array(frames * this.channels * this.bytesPerSample)
    const view = new DataView(bytes.buffer)
    const write = SAMPLE_WRITERS[this.bitDepth]
    let at = 0
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < this.channels; channel++) {
        write(view, at, chunk[channel][frame])
        at += this.bytesPerSample
      }
    }
    return bytes
  }

  finish(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(0)
  }
}
