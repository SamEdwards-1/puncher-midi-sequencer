// Colour arithmetic for the theme utility: reading the notations the
// stylesheet and VS Code themes use, moving between sRGB and OKLCH, where
// lightness and hue can be changed separately and evenly, and WCAG contrast,
// which says whether text stays legible.
//
// It runs under Node as well as Vite, so imports within the theme folder
// name their .ts files.

// channels and alpha, 0–1
export type RGBA = { r: number; g: number; b: number; a: number }

// lightness 0–1, chroma about 0–0.37, hue in degrees
export type OKLCH = { l: number; c: number; h: number }

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value))

const hexPattern = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const parseHex = (text: string): RGBA | null => {
  const match = hexPattern.exec(text)
  if (!match) {
    return null
  }
  let digits = match[1]
  if (digits.length <= 4) {
    digits = [...digits].map((digit) => digit + digit).join("")
  }
  const channel = (index: number) =>
    Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16) / 255
  return {
    r: channel(0),
    g: channel(1),
    b: channel(2),
    a: digits.length === 8 ? channel(3) : 1,
  }
}

const hslToRGB = (h: number, s: number, l: number, a: number): RGBA => {
  const k = (n: number) => (n + h / 30) % 12
  const reach = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - reach * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: f(0), g: f(8), b: f(4), a }
}

// rgb(), rgba(), hsl() and hsla(), with commas or without
const functionPattern = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i

const parseFunction = (text: string): RGBA | null => {
  const match = functionPattern.exec(text)
  if (!match) {
    return null
  }
  const parts = match[2].split(/[\s,/]+/).filter((part) => part !== "")
  if (parts.length < 3) {
    return null
  }
  const number = (part: string) => Number.parseFloat(part)
  const alpha =
    parts[3] === undefined
      ? 1
      : parts[3].endsWith("%")
        ? number(parts[3]) / 100
        : number(parts[3])
  const values = parts.slice(0, 3).map(number)
  if ([...values, alpha].some((value) => !Number.isFinite(value))) {
    return null
  }
  if (match[1].toLowerCase().startsWith("rgb")) {
    const [r, g, b] = values
    return { r: r / 255, g: g / 255, b: b / 255, a: alpha }
  }
  const [h, s, l] = values
  return hslToRGB(((h % 360) + 360) % 360, s / 100, l / 100, alpha)
}

/** A colour as CSS or a VS Code theme writes it, or null if it isn't one. */
export const parseColour = (text: string): RGBA | null => {
  const trimmed = text.trim()
  return parseHex(trimmed) ?? parseFunction(trimmed)
}

const hexByte = (value: number) =>
  Math.round(clamp(value) * 255)
    .toString(16)
    .padStart(2, "0")

/** #rrggbb, or #rrggbbaa when it lets anything through. */
export const toHex = ({ r, g, b, a }: RGBA) =>
  `#${hexByte(r)}${hexByte(g)}${hexByte(b)}${a < 1 ? hexByte(a) : ""}`

/** A translucent colour laid over another, as it is seen. */
export const over = (top: RGBA, bottom: RGBA): RGBA => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
})

export const withAlpha = (colour: RGBA, a: number): RGBA => ({ ...colour, a })

const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4

const fromLinear = (value: number) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055

export const toOKLCH = ({ r, g, b }: RGBA): OKLCH => {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

// the colour exactly, whether or not sRGB can show it
const rawFromOKLCH = ({ l, c, h }: OKLCH) => {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const lc = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const mc = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const sc = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
}

const inGamut = (channels: number[]) =>
  channels.every((value) => value >= -1e-4 && value <= 1 + 1e-4)

/**
 * An OKLCH colour in sRGB. One too vivid to show keeps its lightness and
 * hue and gives up chroma until it fits.
 */
export const fromOKLCH = (colour: OKLCH, a = 1): RGBA => {
  const l = clamp(colour.l)
  let channels = rawFromOKLCH({ ...colour, l })
  if (!inGamut(channels)) {
    let low = 0
    let high = colour.c
    for (let step = 0; step < 24; step++) {
      const c = (low + high) / 2
      if (inGamut(rawFromOKLCH({ ...colour, l, c }))) {
        low = c
      } else {
        high = c
      }
    }
    channels = rawFromOKLCH({ ...colour, l, c: low })
  }
  const [r, g, b] = channels.map((value) => clamp(fromLinear(clamp(value))))
  return { r, g, b, a }
}

/** WCAG relative luminance, of the colour as it is (alpha aside). */
export const luminance = ({ r, g, b }: RGBA) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

/** WCAG contrast ratio, from 1 (none) to 21 (black on white). */
export const contrast = (one: RGBA, other: RGBA) => {
  const [light, dark] = [luminance(one), luminance(other)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** How far apart two colours look: the distance between them in OKLab. */
export const difference = (one: RGBA, other: RGBA) => {
  const lab = (colour: RGBA) => {
    const { l, c, h } = toOKLCH(colour)
    const radians = (h * Math.PI) / 180
    return [l, c * Math.cos(radians), c * Math.sin(radians)]
  }
  const [l1, a1, b1] = lab(one)
  const [l2, a2, b2] = lab(other)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Degrees between two hues, the short way round. */
export const hueDistance = (one: number, other: number) => {
  const apart = Math.abs(one - other) % 360
  return apart > 180 ? 360 - apart : apart
}

/** A colour with its OKLCH lightness moved to `l`, hue and chroma kept. */
export const withLightness = (colour: RGBA, l: number): RGBA =>
  fromOKLCH({ ...toOKLCH(colour), l }, colour.a)

// how far a colour's lightness has to move, one way, to reach a contrast
// with another; null if it can't get there
const lightnessFor = (
  colour: RGBA,
  against: RGBA,
  minimum: number,
  up: boolean,
) => {
  const start = toOKLCH(colour).l
  const end = up ? 1 : 0
  if (contrast(withLightness(colour, end), against) < minimum) {
    return null
  }
  let near = start
  let far = end
  for (let step = 0; step < 30; step++) {
    const middle = (near + far) / 2
    if (contrast(withLightness(colour, middle), against) >= minimum) {
      far = middle
    } else {
      near = middle
    }
  }
  return far
}

/**
 * The colour, lightened or darkened as little as it takes to stand at least
 * `minimum` apart from another: whichever way is the shorter move, or as far
 * as it can go if neither gets there.
 */
export const apart = (colour: RGBA, against: RGBA, minimum: number): RGBA => {
  if (contrast(colour, against) >= minimum) {
    return colour
  }
  const start = toOKLCH(colour).l
  // a hair past the minimum, so rounding to hex doesn't undo it
  const aim = minimum + 0.02
  const moves = [true, false]
    .map((up) => lightnessFor(colour, against, aim, up))
    .filter((l): l is number => l !== null)
    .sort((x, y) => Math.abs(x - start) - Math.abs(y - start))
  if (moves.length > 0) {
    return withLightness(colour, moves[0])
  }
  const lighter = withLightness(colour, 1)
  const darker = withLightness(colour, 0)
  return contrast(lighter, against) >= contrast(darker, against)
    ? lighter
    : darker
}

/** A colour part of the way to another, mixed in OKLab. */
export const mix = (from: RGBA, to: RGBA, amount: number): RGBA => {
  const lab = (colour: RGBA) => {
    const { l, c, h } = toOKLCH(colour)
    const radians = (h * Math.PI) / 180
    return [l, c * Math.cos(radians), c * Math.sin(radians)]
  }
  const [l1, a1, b1] = lab(from)
  const [l2, a2, b2] = lab(to)
  const A = a1 + (a2 - a1) * amount
  const B = b1 + (b2 - b1) * amount
  return fromOKLCH(
    {
      l: l1 + (l2 - l1) * amount,
      c: Math.hypot(A, B),
      h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
    },
    from.a + (to.a - from.a) * amount,
  )
}

/**
 * The colour moved toward another until the two are only `target` apart in
 * contrast: text dimmed toward its background, say. Where they are no
 * further apart than that already, the colour comes back as it is.
 */
export const toward = (colour: RGBA, to: RGBA, target: number): RGBA => {
  if (contrast(colour, to) <= target) {
    return colour
  }
  let near = 0
  let far = 1
  for (let step = 0; step < 30; step++) {
    const middle = (near + far) / 2
    if (contrast(mix(colour, to, middle), to) >= target) {
      near = middle
    } else {
      far = middle
    }
  }
  return mix(colour, to, near)
}
