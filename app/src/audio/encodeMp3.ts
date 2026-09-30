import { Mp3Encoder } from "@breezystack/lamejs"

// Kept apart from the rest of the render so LAME, the larger part of what a
// WAV render would never use, is fetched only when MP3 is the format.

// LAME takes whole frames of this many samples most readily.
const MP3_FRAME = 1152

// a chunk of frames at a time, so progress can be told as it goes
const CHUNK = MP3_FRAME * 64

// Samples from `from` as 16-bit PCM, written into `into` as far as it goes.
const pcm16 = (samples: Float32Array, from: number, into: Int16Array) => {
  for (let index = 0; index < into.length; index++) {
    const clipped = Math.max(-1, Math.min(1, samples[from + index]))
    into[index] = Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff)
  }
  return into
}

export const encodeMp3 = (
  channels: Float32Array[],
  sampleRate: number,
  bitrate: number,
  onProgress: (done: number) => void = () => {},
): Uint8Array<ArrayBuffer> => {
  const encoder = new Mp3Encoder(channels.length, sampleRate, bitrate)
  const length = channels[0].length
  // converted a chunk at a time, into the same buffers each time, rather
  // than as a second copy of the whole sound
  const buffers = channels.map(() => new Int16Array(CHUNK))
  const parts: Uint8Array[] = []
  for (let from = 0; from < length; from += CHUNK) {
    const to = Math.min(length, from + CHUNK)
    const [left, right] = channels.map((samples, channel) =>
      pcm16(samples, from, buffers[channel].subarray(0, to - from)),
    )
    parts.push(encoder.encodeBuffer(left, right))
    onProgress(to / length)
  }
  parts.push(encoder.flush())
  const bytes = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}
