import { Mp3Encoder } from "@breezystack/lamejs"

// Kept apart from the rest of the render so LAME, the larger part of what a
// WAV render would never use, is fetched only when MP3 is the format.

// Samples as 16-bit PCM, written into `into`, which is as long as they are.
const pcm16 = (samples: Float32Array, into: Int16Array) => {
  for (let index = 0; index < into.length; index++) {
    const clipped = Math.max(-1, Math.min(1, samples[index]))
    into[index] = Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff)
  }
  return into
}

// What LAME hands back, as bytes: each piece is a buffer of its own.
const bytesOf = (part: ArrayBufferView) =>
  new Uint8Array(part.buffer as ArrayBuffer, part.byteOffset, part.byteLength)

/**
 * An MP3 file written a piece at a time: each chunk of samples encoded as it
 * comes, LAME keeping back whatever doesn't yet fill a frame for the next,
 * then the last of it on `finish`. How the sound is cut into chunks doesn't
 * change the file.
 */
export class Mp3Writer {
  private readonly encoder: Mp3Encoder
  // the chunk as 16-bit PCM, in the same memory each time
  private pcm: Int16Array[] = []

  constructor(
    private readonly channels: number,
    sampleRate: number,
    bitrate: number,
  ) {
    this.encoder = new Mp3Encoder(channels, sampleRate, bitrate)
  }

  start(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(0)
  }

  // A chunk of samples, a channel to each array.
  encode(chunk: readonly Float32Array[]): Uint8Array<ArrayBuffer> {
    const length = chunk[0].length
    if (this.pcm.length === 0 || this.pcm[0].length < length) {
      this.pcm = chunk.map(() => new Int16Array(length))
    }
    const [left, right] = chunk
      .slice(0, this.channels)
      .map((samples, channel) =>
        pcm16(samples, this.pcm[channel].subarray(0, length)),
      )
    return bytesOf(this.encoder.encodeBuffer(left, right))
  }

  finish(): Uint8Array<ArrayBuffer> {
    return bytesOf(this.encoder.flush())
  }
}
