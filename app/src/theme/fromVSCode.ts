// Turns a VS Code colour theme into one of ours.
//
// A VS Code theme and ours don't name the same things, and most VS Code
// themes set only some of their colours, so this doesn't look each of ours up
// in a table. It keeps the built-in theme of the same kind, dark or light, as
// the layout: how much darker the ruler is than the background, how far the
// secondary text sits from the primary, which hue each voice and jump takes.
// Then it rebuilds that layout on the VS Code theme's own background, text
// and accent, takes a VS Code colour wherever one plays the same part and
// fits, and tints the rest from the theme's hue. The voices and the envelope
// take the theme's own syntax colours, each the one nearest the hue it has in
// the built-in theme. The jumps and collisions are drawn the same way from
// the brights: the bright colours of every theme kept, listed in brights.ts.
//
// Everything is then checked for legibility: text against what it sits on,
// white counts against the voice colours, and so on. A colour that falls
// short moves in lightness only, just far enough.
//
// It runs under Node as well as Vite, so imports within the theme folder
// name their .ts files.

import { BRIGHTS, type Bright } from "./brights.ts"
import {
  apart,
  contrast,
  difference,
  fromOKLCH,
  hueDistance,
  luminance,
  mix,
  type OKLCH,
  over,
  parseColour,
  type RGBA,
  toHex,
  toOKLCH,
  toward,
  withAlpha,
  withLightness,
} from "./colour.ts"

export type ThemeKind = "dark" | "light"

/** A built-in theme: its --midiseq- variables, named without the prefix. */
export type Palette = Record<string, string>

export type BasePalettes = { dark: Palette; light: Palette }

export type ThemeColour = {
  name: string
  value: string
  // where it came from: a VS Code key, a syntax scope, or "derived"
  source: string
}

export type ConvertedTheme = {
  type: ThemeKind
  colours: ThemeColour[]
  // anything the person running the utility should know
  notes: string[]
}

// ------------------------------------------------------------------ input

/**
 * JSON with comments and trailing commas, as VS Code writes its themes.
 * Strings are left alone, so a URL's // survives.
 */
export const parseJSONC = (text: string): unknown => {
  let clean = ""
  let index = 0
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"') {
      let end = index + 1
      while (end < text.length && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1
      }
      clean += text.slice(index, end + 1)
      index = end + 1
    } else if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        index++
      }
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2)
      index = end === -1 ? text.length : end + 2
    } else if (char === ",") {
      // a comma with nothing after it but a closing bracket goes, comments
      // between the two, as VS Code exports them, or not
      let ahead = index + 1
      for (;;) {
        if (/\s/.test(text[ahead] ?? "")) {
          ahead++
        } else if (text.startsWith("//", ahead)) {
          const end = text.indexOf("\n", ahead)
          ahead = end === -1 ? text.length : end + 1
        } else if (text.startsWith("/*", ahead)) {
          const end = text.indexOf("*/", ahead + 2)
          ahead = end === -1 ? text.length : end + 2
        } else {
          break
        }
      }
      if (text[ahead] !== "}" && text[ahead] !== "]") {
        clean += char
      }
      index++
    } else {
      clean += char
      index++
    }
  }
  return JSON.parse(clean)
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

// VS Code's own kinds, the high-contrast ones folded into the two we have
const kindOf = (type: unknown): ThemeKind | null => {
  switch (type) {
    case "dark":
    case "vs-dark":
    case "hc-black":
      return "dark"
    case "light":
    case "vs":
    case "hc-light":
      return "light"
    default:
      return null
  }
}

// a colour the theme uses for something, and how often
type Swatch = { colour: RGBA; lch: OKLCH; source: string; count: number }

// Every opaque colour in the theme that has some colour to it: the syntax
// colours first, then the workbench's (borders aside), counted, so the ones
// a theme leans on can win a close call.
const swatchesOf = (theme: Record<string, unknown>) => {
  const found = new Map<string, Swatch>()
  const add = (text: unknown, source: string) => {
    const colour = typeof text === "string" ? parseColour(text) : null
    if (colour === null || colour.a < 0.95) {
      return
    }
    const opaque = withAlpha(colour, 1)
    const hex = toHex(opaque)
    const known = found.get(hex)
    if (known) {
      known.count++
    } else {
      found.set(hex, { colour: opaque, lch: toOKLCH(opaque), source, count: 1 })
    }
  }
  const tokens = Array.isArray(theme.tokenColors) ? theme.tokenColors : []
  for (const rule of tokens) {
    const { scope, settings } = record(rule)
    const first = (Array.isArray(scope) ? scope[0] : scope) ?? "the default"
    const name = String(first).split(",")[0].trim()
    // VS Code writes its own token.info-token and the like into every theme
    // it exports; they're its colours, not the theme's
    if (!name.startsWith("token.")) {
      add(record(settings).foreground, `syntax ${name}`)
    }
  }
  for (const [scope, style] of Object.entries(
    record(theme.semanticTokenColors),
  )) {
    add(typeof style === "string" ? style : record(style).foreground, scope)
  }
  for (const [key, value] of Object.entries(record(theme.colors))) {
    // a border is a thin marker, often a bare primary repeated on every
    // modified tab, rather than part of the theme's palette
    if (!/border/i.test(key)) {
      add(value, key)
    }
  }
  return [...found.values()]
}

// -------------------------------------------------------------- the build

// how far a hue may wander from the built-in one it stands in for
const HUE_WINDOW = 35
// how much colour a swatch needs to count as a hue at all
const CHROMATIC = 0.06
// How far apart two of a set's colours must look to tell apart. The built-in
// themes keep theirs 0.08 or more apart.
const DISTINCT = 0.07
// and how far from the colours a set keeps clear of, which it lies over or
// beside: the envelope over the voices' notes, say
const CLEAR = 0.1
// Voices are drawn as dots side by side, so each should be a colour of its
// own at a glance: this far apart in hue from one another, and from the
// accent and recording's red
const VOICE_SPREAD = 40
const VOICE_CLEAR = 30
// as much colour as a voice may have, short of the gamut's garish edge
const VIVID = 0.2

const signOf = (value: number) =>
  Math.abs(value) < 0.005 ? 0 : Math.sign(value)

const describeMove = (before: RGBA, after: RGBA, source: string) => {
  const moved = toOKLCH(after).l - toOKLCH(before).l
  if (Math.abs(moved) < 0.005) {
    return source
  }
  return `${source}, ${moved > 0 ? "lightened" : "darkened"}`
}

// ---------------------------------------------------------- the brights

// A bright colour has this much colour at the least, and a lightness in this
// range: light enough to glow on a dark background, short of washed out.
const BRIGHT_CHROMA = 0.13
const BRIGHT_LIGHTNESS = [0.62, 0.92]
// and no two in the list look closer than this
const BRIGHT_APART = 0.05
// Keys for what lies over the editor for a moment, a drop target or a
// search's matches, often a bare primary: loud, not the theme's palette.
const PASSING = /drop|highlight|selection|hover|find|match|range|bracket/i

/**
 * The bright colours of every VS Code theme we keep, for the marks that have
 * to stand out wherever they are: the jumps and the collisions. The most
 * colourful of any close alike is the one kept, and the list runs round the
 * hues.
 */
export const brightsOf = (themes: { id: string; json: unknown }[]) => {
  const bright = themes
    .flatMap(({ id, json }) =>
      swatchesOf(record(json)).map((swatch) => ({
        ...swatch,
        source: `${id} ${swatch.source}`,
      })),
    )
    .filter(
      ({ lch, source }) =>
        !PASSING.test(source) &&
        lch.c >= BRIGHT_CHROMA &&
        lch.l >= BRIGHT_LIGHTNESS[0] &&
        lch.l <= BRIGHT_LIGHTNESS[1],
    )
    .sort((one, other) => other.lch.c - one.lch.c)
  const kept: typeof bright = []
  for (const swatch of bright) {
    if (
      kept.every(
        (other) => difference(other.colour, swatch.colour) >= BRIGHT_APART,
      )
    ) {
      kept.push(swatch)
    }
  }
  return kept
    .sort((one, other) => one.lch.h - other.lch.h)
    .map(({ colour, source }): Bright => ({ colour: toHex(colour), source }))
}

/** The list as brights.ts, which the utility writes. */
export const brightsTS = (brights: Bright[]) =>
  [
    "// The bright colours of every VS Code theme in themes/, round the hues:",
    "// what the jumps and collisions of every theme are drawn from. Written by",
    "// `npm run theme -- --all`; don't edit it by hand.",
    "",
    "export type Bright = { colour: string; source: string }",
    "",
    "export const BRIGHTS: Bright[] = [",
    ...brights.map(
      ({ colour, source }) =>
        `  { colour: "${colour}", source: ${JSON.stringify(source)} },`,
    ),
    "]",
    "",
  ].join("\n")

export type Drawn = {
  name: string
  original: RGBA
  colour: RGBA
  source: string
}

/**
 * Each of the names gets a colour from the brights, the one nearest the hue
 * it has in the layout, the closest pairs settled first, and then made
 * legible against what it sits on. None is taken that looks too like one
 * already taken or one the set keeps clear of. A name with no hue in the
 * layout, or none near enough, takes the hue furthest from those taken, and
 * failing that one clear only of the set's own. Should nothing be left, a
 * name keeps its layout colour, made legible.
 */
export const drawBrights = (
  names: string[],
  layout: (name: string) => RGBA,
  against: [RGBA, number][],
  avoid: RGBA[] = [],
  brights: readonly Bright[] = BRIGHTS,
): Drawn[] => {
  const legible = (colour: RGBA) =>
    against.reduce(
      (colour, [other, minimum]) => apart(colour, other, minimum),
      colour,
    )
  const pool = brights.flatMap(({ colour, source }) => {
    const parsed = parseColour(colour)
    return parsed === null ? [] : [{ colour: parsed, source }]
  })
  const chosen = new Map<string, Drawn>()
  const taken: RGBA[] = []
  const take = (name: string, bright: (typeof pool)[number], clear = true) => {
    const colour = legible(bright.colour)
    if (
      chosen.has(name) ||
      taken.some((other) => difference(other, colour) < DISTINCT) ||
      (clear && avoid.some((other) => difference(other, colour) < CLEAR))
    ) {
      return
    }
    chosen.set(name, {
      name,
      original: bright.colour,
      colour,
      source: `bright, from ${bright.source}`,
    })
    taken.push(colour)
  }

  const hued = names.filter((name) => toOKLCH(layout(name)).c >= 0.03)
  const pairs = hued.flatMap((name) => {
    const want = toOKLCH(layout(name))
    return pool.map((bright) => {
      const lch = toOKLCH(bright.colour)
      // the more colourful of two as near in hue
      return { name, bright, distance: hueDistance(want.h, lch.h) - 20 * lch.c }
    })
  })
  pairs.sort((one, other) => one.distance - other.distance)
  for (const { name, bright } of pairs) {
    take(name, bright)
  }

  // The rest, one at a time, take the hue furthest from any taken; any
  // still without, the same way, only told apart from the set itself.
  const furthest = (bright: (typeof pool)[number]) =>
    Math.min(
      360,
      ...taken.map((other) =>
        hueDistance(toOKLCH(other).h, toOKLCH(bright.colour).h),
      ),
    )
  for (const clear of [true, false]) {
    for (const name of names.filter((name) => !chosen.has(name))) {
      for (const bright of [...pool].sort(
        (one, other) => furthest(other) - furthest(one),
      )) {
        take(name, bright, clear)
      }
    }
  }

  return names.map(
    (name) =>
      chosen.get(name) ?? {
        name,
        original: layout(name),
        colour: legible(layout(name)),
        source: "built-in",
      },
  )
}

// ------------------------------------------------------------ the theme

export const themeFromVSCode = (
  input: unknown,
  bases: BasePalettes,
  options: {
    type?: ThemeKind
    // colours on commented-out lines, as VS Code exports the ones a theme
    // leaves to it: a last resort for the voices
    commented?: Record<string, string>
    // 0–1: how far to push the grid's steps and the backgrounds past the
    // built-in layout, deeper apart and more coloured
    drama?: number
    // the accent, where the theme's own choice doesn't suit: one of its
    // keys, or a colour
    accent?: string
    // what the drama draws the grid toward, the same way; the accent if
    // not given
    tint?: string
    // the four voices, the same way, where the theme's names mislead
    voices?: string[]
    // the background, one of the theme's keys or a colour, in place of its
    // editor.background
    background?: string
    // any of our colours, by name, as one of the theme's keys or a colour:
    // the last word, taken as it is
    set?: Record<string, string>
    // what the jumps and collisions are drawn from, if not the list kept
    brights?: readonly Bright[]
  } = {},
): ConvertedTheme => {
  const theme = record(input)
  const colors = record(theme.colors)
  const notes: string[] = []
  if (typeof theme.include === "string") {
    notes.push(
      `It includes ${theme.include}, which isn't read: only the colours in this file are used.`,
    )
  }

  const given = (key: string) => {
    const text = colors[key]
    return typeof text === "string" ? parseColour(text) : null
  }

  const backgroundKey = options.background ?? "editor.background"
  const editorBackground =
    given(backgroundKey) ??
    (options.background === undefined ? null : parseColour(options.background))
  if (options.background !== undefined && editorBackground === null) {
    throw new Error(
      `The background ${options.background} is neither a key nor a colour.`,
    )
  }
  const type =
    options.type ??
    kindOf(theme.type) ??
    (editorBackground && toOKLCH(editorBackground).l > 0.6 ? "light" : "dark")

  // the built-in theme of that kind: the light one only says what differs
  const base: Palette = {
    ...bases.dark,
    ...(type === "light" ? bases.light : {}),
  }
  const builtIn = (name: string) => {
    const colour = base[name] === undefined ? null : parseColour(base[name])
    if (colour === null) {
      throw new Error(`The built-in theme has no colour called ${name}.`)
    }
    return colour
  }

  const made = new Map<string, { colour: RGBA; source: string }>()
  const set = (name: string, colour: RGBA, source: string) => {
    made.set(name, { colour, source })
    return colour
  }
  const get = (name: string) => {
    const done = made.get(name)
    if (!done) {
      throw new Error(`${name} is used before it is made.`)
    }
    return done.colour
  }

  // A VS Code colour as it would be seen: a translucent one over what it
  // sits on.
  const seen = (key: string, under: RGBA) => {
    const colour = given(key)
    return colour === null ? null : over(colour, under)
  }

  // Ours, placed from another as the built-in theme places it from that
  // one: as much lighter or darker, and tinted with its hue unless it has a
  // hue of its own.
  const placed = (name: string, anchor: string) => {
    const was = toOKLCH(builtIn(anchor))
    const now = toOKLCH(get(anchor))
    const mine = toOKLCH(builtIn(name))
    // a grey anchor has no hue to lend, so the tint takes the accent's
    const ownHue = mine.c - was.c > 0.02
    return fromOKLCH(
      {
        l: now.l + mine.l - was.l,
        c: Math.max(0, now.c + mine.c - was.c),
        h: ownHue ? mine.h : now.c < 0.01 ? toOKLCH(accent).h : now.h,
      },
      builtIn(name).a,
    )
  }

  // Placed as above, unless the theme has a colour of its own for the part
  // that lands near enough: the same side of the anchor, and close in
  // lightness.
  const surface = (name: string, anchor: string, keys: string[]) => {
    const target = placed(name, anchor)
    const from = toOKLCH(get(anchor)).l
    const shift = toOKLCH(target).l - from
    const tolerance = Math.max(0.025, Math.abs(shift) * 0.6)
    for (const key of keys) {
      const colour = seen(key, get(anchor))
      if (colour === null) {
        continue
      }
      const l = toOKLCH(colour).l
      if (
        signOf(l - from) === signOf(shift) &&
        Math.abs(l - toOKLCH(target).l) <= tolerance
      ) {
        return set(name, colour, key)
      }
    }
    return set(name, target, "derived")
  }

  // the theme's colours for some keys, as seen on the background
  const onBackground = (keys: string[]) =>
    keys.flatMap((key) => {
      const colour = seen(key, get("background"))
      return colour === null ? [] : [{ colour, source: key }]
    })

  // Text from the first of the candidates that is clearly dimmer than
  // `brighter` (when given: at most `share` of its contrast), preferring one
  // legible as it is, and otherwise moved just far enough to be. With none,
  // `fallback`.
  const text = (
    name: string,
    offered: { colour: RGBA; source: string }[],
    minimum: number,
    brighter: { colour: RGBA; share: number } | null,
    fallback: () => { colour: RGBA; source: string },
  ) => {
    const background = get("background")
    // text sits on the side of the background ours does: darker on a light
    // theme, even where the background is mid-toned and a pale grey would
    // also read
    const darkText = luminance(builtIn("fg")) < luminance(builtIn("background"))
    const candidates = offered.filter(
      ({ colour }) =>
        luminance(colour) < luminance(background) === darkText &&
        (brighter === null ||
          contrast(colour, background) <=
            contrast(brighter.colour, background) * brighter.share),
    )
    const legible = candidates.find(
      ({ colour }) => contrast(colour, background) >= minimum,
    )
    const chosen = legible ?? candidates[0] ?? fallback()
    const colour = apart(chosen.colour, background, minimum)
    return set(name, colour, describeMove(chosen.colour, colour, chosen.source))
  }

  // ---- the surfaces
  let background = set(
    "background",
    editorBackground === null
      ? builtIn("background")
      : over(editorBackground, builtIn("background")),
    editorBackground === null
      ? "built-in"
      : options.background === undefined
        ? "editor.background"
        : parseColour(options.background) === null
          ? `${options.background}, chosen`
          : "chosen",
  )
  if (editorBackground === null) {
    notes.push("It has no editor.background, so the built-in one is kept.")
  }

  // ---- the accent
  // The colour a control lights when it's on: the theme's own marker for
  // what's active, where it has one, then its main button and badge.
  const recordHue = toOKLCH(builtIn("record")).h
  const accentKeys = [
    "activityBar.activeBorder",
    "tab.activeBorderTop",
    "inputOption.activeBorder",
    "tab.activeBorder",
    "button.background",
    "activityBarBadge.background",
    "progressBar.background",
    "focusBorder",
    "list.highlightForeground",
    "textLink.foreground",
    "badge.background",
    "list.activeSelectionBackground",
  ]
  // what VS Code shows for a key the theme leaves to it
  const commented = options.commented ?? {}
  const hinted = (key: string) =>
    commented[key] === undefined ? null : parseColour(commented[key])

  // The first of the keys, looked up one way, that makes an accent: opaque
  // (a translucent one is a tint of the background), coloured, and seen.
  // Red is recording's, unless the theme's own buttons and badges are red
  // (or pink): then red is its accent, and recording keeps clear of it.
  const accentFrom = (lookup: (key: string) => RGBA | null) => {
    const shown = (key: string) => {
      const colour = lookup(key)
      return colour === null || colour.a < 0.95
        ? null
        : over(colour, background)
    }
    const usable = (key: string) => {
      const colour = shown(key)
      return (
        colour !== null &&
        toOKLCH(colour).c >= 0.04 &&
        contrast(colour, background) >= 1.5
      )
    }
    const isRed = (key: string) => {
      const { c, h } = toOKLCH(shown(key) as RGBA)
      return c >= 0.08 && hueDistance(h, recordHue) <= 25
    }
    const redTheme = [
      "button.background",
      "activityBarBadge.background",
      "badge.background",
    ].some((key) => usable(key) && isRed(key))
    const key = accentKeys.find(
      (key) => usable(key) && (redTheme || !isRed(key)),
    )
    return key === undefined ? null : { key, colour: shown(key) as RGBA }
  }
  // the one asked for, else the theme's own, else what VS Code shows it with
  // a colour asked for by one of the theme's keys, or given outright
  const askedFor = (what: string, asked: string | undefined) => {
    if (asked === undefined) {
      return null
    }
    const colour = given(asked) ?? hinted(asked) ?? parseColour(asked)
    if (colour === null) {
      throw new Error(`The ${what} ${asked} is neither a key nor a colour.`)
    }
    return {
      key: parseColour(asked) === null ? `${asked}, chosen` : "chosen",
      colour: over(colour, background),
    }
  }
  const asked = askedFor("accent", options.accent)
  const found =
    asked ??
    accentFrom(given) ??
    (() => {
      const hint = accentFrom(hinted)
      return hint && { ...hint, key: `${hint.key} (commented out)` }
    })()
  const accentKey = found?.key
  const accent =
    found === null
      ? set("theme", builtIn("theme"), "built-in")
      : set("theme", found.colour, found.key)

  // ---- drama
  const drama = Math.min(1, Math.max(0, options.drama ?? 0))
  const tintColour = askedFor("tint", options.tint)?.colour ?? accent
  const tintHue = toOKLCH(tintColour).h
  // A colour pushed further from `anchor` in lightness (by `lift`), given
  // more colour of its own (`chroma`), and drawn toward the tint, the
  // accent unless told otherwise (`tint`), all as far as the drama goes. A
  // grey takes the tint's hue.
  const intensify = (
    colour: RGBA,
    anchor: RGBA,
    { lift = 0, chroma = 0, tint = 0 },
  ) => {
    const own = toOKLCH(colour)
    const from = toOKLCH(anchor).l
    const l = Math.min(
      1,
      Math.max(0, from + (own.l - from) * (1 + lift * drama)),
    )
    const coloured = fromOKLCH(
      {
        l,
        c: own.c + chroma * drama,
        h: own.c < 0.01 ? tintHue : own.h,
      },
      colour.a,
    )
    return withLightness(mix(coloured, tintColour, tint * drama), l)
  }
  if (drama > 0) {
    const source = made.get("background")?.source ?? "derived"
    background = set(
      "background",
      intensify(background, background, { chroma: 0.02 }),
      `${source}, deepened`,
    )
  }

  surface("background-dark", "background", [
    "titleBar.activeBackground",
    "activityBar.background",
    "sideBar.background",
    "statusBar.background",
  ])
  surface("background-secondary", "background", [
    "button.secondaryBackground",
    "list.inactiveSelectionBackground",
    "dropdown.background",
    "input.background",
    "menu.background",
  ])
  surface("editor-background", "background", [
    "sideBar.background",
    "panel.background",
    "terminal.background",
    "editorGroupHeader.tabsBackground",
  ])
  surface("ruler-background", "editor-background", [
    "activityBar.background",
    "sideBarSectionHeader.background",
    "editorWidget.background",
    "input.background",
  ])
  surface("popup-border", "background", [
    "editorWidget.border",
    "widget.border",
    "menu.border",
    "dropdown.border",
    "input.border",
    "editorGroup.border",
    "panel.border",
  ])

  // A divider has to show: one either side of the background will do, so
  // long as it is far enough from it.
  const dividerKey = [
    "editorGroup.border",
    "panel.border",
    "sideBar.border",
    "contrastBorder",
    "tab.border",
  ].find((key) => {
    const colour = seen(key, background)
    return (
      colour !== null &&
      Math.abs(toOKLCH(colour).l - toOKLCH(background).l) >= 0.05
    )
  })
  if (dividerKey === undefined) {
    set("divider", placed("divider", "background"), "derived")
  } else {
    set("divider", seen(dividerKey, background) as RGBA, dividerKey)
  }

  for (const name of [
    "roll-white",
    "roll-black",
    "roll-band",
    "piano-octave",
    "piano-white",
    "piano-black",
    "piano-edge",
    "editor-grid",
    "editor-grid-secondary",
  ]) {
    set(name, placed(name, "editor-background"), "derived")
  }
  for (const name of ["step", "step-skip"]) {
    set(name, placed(name, "background"), "derived")
  }

  // ---- the text
  const fg = text(
    "fg",
    onBackground(["editor.foreground", "foreground"]),
    4.5,
    null,
    () => ({ colour: placed("fg", "background"), source: "derived" }),
  )
  const secondary = text(
    "fg-secondary",
    onBackground([
      "foreground",
      "descriptionForeground",
      "tab.inactiveForeground",
    ]),
    3.5,
    { colour: fg, share: 0.9 },
    () => ({
      colour: toward(
        fg,
        background,
        Math.max(3.5, contrast(fg, background) * 0.6),
      ),
      source: "derived",
    }),
  )
  // the comment colour is the theme's own idea of quiet, readable text,
  // over the background as it's seen, when it's translucent
  const comment = (Array.isArray(theme.tokenColors) ? theme.tokenColors : [])
    .map(record)
    .filter(({ scope }) => scope === "comment")
    .flatMap(({ settings }) => {
      const text = record(settings).foreground
      const colour = typeof text === "string" ? parseColour(text) : null
      return colour === null
        ? []
        : [{ colour: over(colour, background), source: "syntax comment" }]
    })
    .slice(0, 1)
  text(
    "fg-tertiary",
    [
      ...onBackground([
        "editorLineNumber.foreground",
        "input.placeholderForeground",
      ]),
      ...comment,
    ],
    2.3,
    // placeholders and the like can be nearly as bright as secondary text
    { colour: secondary, share: 0.8 },
    () => ({
      colour: toward(secondary, background, 2.4),
      source: "derived",
    }),
  )
  {
    const was = contrast(builtIn("piano-label"), builtIn("piano-white"))
    const label = placed("piano-label", "editor-background")
    const legible = apart(label, get("piano-white"), Math.min(was, 4.5))
    set("piano-label", legible, describeMove(label, legible, "derived"))
  }

  // ---- what sits on the accent
  {
    // the theme's own, else what VS Code shows it with, else white or black
    const onKeys = [
      "button.foreground",
      "activityBarBadge.foreground",
      "badge.foreground",
      "list.activeSelectionForeground",
    ]
    const onFrom = (lookup: (key: string) => RGBA | null, suffix: string) => {
      for (const key of onKeys) {
        const found = lookup(key)
        const colour = found === null ? null : over(found, accent)
        if (colour !== null && contrast(colour, accent) >= 3) {
          return { colour, source: key + suffix }
        }
      }
      return null
    }
    const on = onFrom(given, "") ?? onFrom(hinted, " (commented out)")
    if (on === null) {
      const white = { r: 1, g: 1, b: 1, a: 1 }
      const black = { r: 0, g: 0, b: 0, a: 1 }
      set(
        "on-surface",
        contrast(white, accent) >= contrast(black, accent) ? white : black,
        "derived",
      )
    } else {
      set("on-surface", on.colour, on.source)
    }
  }
  const onSurface = get("on-surface")
  {
    // a rest is the accent, muted as far as the built-in one is
    const rest = toOKLCH(builtIn("step-rest"))
    set(
      "step-rest",
      fromOKLCH({ ...rest, h: toOKLCH(accent).h }),
      accentKey === undefined ? "derived" : `derived from ${accentKey}`,
    )
  }

  // ---- overlays: hover, scrollbars and shadow
  {
    const hover = builtIn("highlight")
    if (hover.a < 1) {
      set("highlight", withAlpha(secondary, hover.a), "derived")
    } else {
      set("highlight", placed("highlight", "background"), "derived")
    }
  }
  const translucent = (name: string, key: string) => {
    const colour = given(key)
    const minimum = builtIn(name)
    if (colour === null) {
      set(name, minimum, "built-in")
    } else {
      const a = Math.max(colour.a, minimum.a)
      set(
        name,
        withAlpha(colour, a),
        a > colour.a ? `${key}, more opaque` : key,
      )
    }
  }
  translucent("scrollbar", "scrollbarSlider.background")
  translucent("scrollbar-hover", "scrollbarSlider.hoverBackground")
  {
    const shadow = given("widget.shadow")
    const minimum = builtIn("shadow").a
    if (shadow === null) {
      set("shadow", builtIn("shadow"), "built-in")
    } else if (toOKLCH(shadow).l > Math.min(0.5, toOKLCH(background).l - 0.2)) {
      // a shadow no darker than what it falls on reads as a glow
      set("shadow", builtIn("shadow"), "built-in, widget.shadow being light")
    } else {
      // VS Code's shadows are small and dark; ours spread far, so lighter
      set(
        "shadow",
        withAlpha(shadow, Math.min(0.35, Math.max(minimum, shadow.a))),
        "widget.shadow",
      )
    }
  }

  // ---- the coloured sets, from the theme's own colours
  // (not the ones that are nearly its background: selections and the like)
  const swatches = swatchesOf(theme).filter(
    ({ colour, lch }) =>
      lch.c >= CHROMATIC && contrast(colour, background) >= 1.8,
  )

  // The colour, made legible against whatever it has to stand apart from.
  const fitter = (against: [RGBA, number][]) => (colour: RGBA) =>
    against.reduce(
      (colour, [other, minimum]) => apart(colour, other, minimum),
      colour,
    )

  type Pick = { name: string; original: RGBA; colour: RGBA; source: string }

  // Each of the names gets the swatch nearest its built-in hue, the closest
  // pairs settled first, and none so like one already taken, or one the set
  // has to keep clear of, that the two can't be told apart once each is
  // made legible by `adjust`. A name with no swatch near enough keeps its
  // built-in colour.
  const matched = (
    names: string[],
    {
      avoid = [] as RGBA[],
      already = [] as RGBA[],
      window = HUE_WINDOW,
      adjust = (colour: RGBA) => colour,
    } = {},
  ): Pick[] => {
    const pairs = names.flatMap((name) => {
      const want = toOKLCH(builtIn(name))
      if (want.c < 0.03) {
        return []
      }
      return swatches.flatMap((swatch) => {
        const off = hueDistance(want.h, swatch.lch.h)
        return off > window
          ? []
          : [
              {
                name,
                swatch,
                distance:
                  off +
                  120 * Math.abs(want.c - swatch.lch.c) -
                  2 * Math.log2(swatch.count),
              },
            ]
      })
    })
    pairs.sort((one, other) => one.distance - other.distance)
    const chosen = new Map<string, Pick>()
    const taken: RGBA[] = [...already]
    for (const { name, swatch } of pairs) {
      if (chosen.has(name)) {
        continue
      }
      const colour = adjust(swatch.colour)
      const alike =
        taken.some((other) => difference(other, colour) < DISTINCT) ||
        avoid.some((other) => difference(other, colour) < CLEAR)
      if (!alike) {
        chosen.set(name, {
          name,
          original: swatch.colour,
          colour,
          source: swatch.source,
        })
        taken.push(colour)
      }
    }
    return names.map((name) => {
      const pick = chosen.get(name)
      if (pick) {
        return pick
      }
      const colour = builtIn(name)
      const original =
        toOKLCH(colour).c < 0.03 ? placed(name, "background") : colour
      return {
        name,
        original,
        colour: adjust(original),
        source: toOKLCH(colour).c < 0.03 ? "derived" : "built-in",
      }
    })
  }

  const setPicks = (picks: Pick[]) => {
    for (const { name, original, colour, source } of picks) {
      set(name, colour, describeMove(original, colour, source))
    }
  }

  const numbered = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}-${index}`)

  // the status colours: the theme's own for errors, changes and additions
  // where it has them, else from its swatches like the sets
  const status = (
    name: string,
    keys: string[],
    against: [RGBA, number][],
    avoid: RGBA[] = [],
  ) => {
    const want = toOKLCH(builtIn(name)).h
    const key = keys.find((key) => {
      const colour = seen(key, background)
      return (
        colour !== null &&
        toOKLCH(colour).c >= CHROMATIC &&
        hueDistance(toOKLCH(colour).h, want) <= HUE_WINDOW &&
        avoid.every((other) => difference(other, colour) >= CLEAR)
      )
    })
    const { original: colour, source } =
      key === undefined
        ? matched([name], { avoid })[0]
        : { original: seen(key, background) as RGBA, source: key }
    const fitted = against.reduce(
      (colour, [other, minimum]) => apart(colour, other, minimum),
      colour,
    )
    set(name, fitted, describeMove(colour, fitted, source))
  }
  // recording lights a button, under on-surface text
  status(
    "record",
    ["errorForeground", "editorError.foreground", "terminal.ansiRed"],
    [
      [onSurface, 3],
      [background, 2.5],
    ],
    [accent],
  )
  status(
    "red",
    [
      "gitDecoration.deletedResourceForeground",
      "terminal.ansiRed",
      "editorError.foreground",
    ],
    [[background, 3]],
  )
  status(
    "green",
    [
      "gitDecoration.untrackedResourceForeground",
      "gitDecoration.addedResourceForeground",
      "terminal.ansiGreen",
      "editorGutter.addedBackground",
    ],
    [[background, 3]],
  )
  status(
    "yellow",
    [
      "gitDecoration.modifiedResourceForeground",
      "editorWarning.foreground",
      "terminal.ansiYellow",
    ],
    [[background, 3]],
  )

  // A CC's envelope is the accent: what's being edited, lit as a control
  // that's on is.
  {
    const editor = get("editor-background")
    const line = apart(accent, editor, 4)
    set(
      "envelope",
      line,
      describeMove(accent, line, accentKey ?? "built-in accent"),
    )
  }
  const envelope = get("envelope")

  // The voices take the theme's own named colours where it has them, its
  // charts' and then its terminal's, blue, orange, green and purple as ours
  // are; then its nearest syntax colours; then any of its colours at all.
  // Each stands off the background and carries counts in the on-surface
  // colour, and none may pass for the envelope drawn over their notes.
  {
    const names = numbered("voice", 4)
    const adjust = fitter([
      [background, 1.8],
      [onSurface, 3],
    ])
    const named = [
      ["charts.blue", "terminal.ansiBlue", "terminal.ansiBrightBlue"],
      ["charts.orange", "terminal.ansiYellow", "terminal.ansiBrightYellow"],
      ["charts.green", "terminal.ansiGreen", "terminal.ansiBrightGreen"],
      ["charts.purple", "terminal.ansiMagenta", "terminal.ansiBrightMagenta"],
    ]
    const chosen = new Map<string, Pick>()
    const taken: RGBA[] = []
    // the envelope lies over the voices, a voice like the accent would look
    // lit, and a red one would read as recording
    const clear = [envelope, accent, get("record")]
    const takeNamed = (
      lookup: (key: string) => RGBA | null,
      label: (key: string) => string,
    ) =>
      names.forEach((name, index) => {
        if (chosen.has(name)) {
          return
        }
        for (const key of named[index]) {
          const found = lookup(key)
          if (found === null || found.a < 0.95) {
            continue
          }
          const original = withAlpha(found, 1)
          const colour = adjust(original)
          if (
            toOKLCH(original).c >= CHROMATIC &&
            clear.every((other) => difference(colour, other) >= CLEAR) &&
            !taken.some((other) => difference(other, colour) < DISTINCT)
          ) {
            chosen.set(name, { name, original, colour, source: label(key) })
            taken.push(colour)
            return
          }
        }
      })
    const takeMatched = (window: number) => {
      const rest = names.filter((name) => !chosen.has(name))
      const picks = matched(rest, {
        avoid: clear,
        already: taken,
        window,
        adjust,
      })
      for (const pick of picks) {
        if (pick.source !== "built-in" || window === 180) {
          chosen.set(pick.name, pick)
          taken.push(pick.colour)
        }
      }
    }
    ;(options.voices ?? []).slice(0, names.length).forEach((asked, index) => {
      const found = askedFor("voice", asked) as { key: string; colour: RGBA }
      const colour = adjust(found.colour)
      chosen.set(names[index], {
        name: names[index],
        original: found.colour,
        colour,
        source: found.key,
      })
      taken.push(colour)
    })
    takeNamed(given, (key) => key)
    takeMatched(HUE_WINDOW)
    takeNamed(hinted, (key) => `${key} (commented out)`)
    takeMatched(180)
    // Then each is made to pop: its hue kept where it stands apart from the
    // others, the accent and recording, else moved to the nearest that
    // does, and given as much colour as that hue holds, then made legible
    // again.
    const marked = [accent, get("record")]
      .map(toOKLCH)
      .filter(({ c }) => c >= CHROMATIC)
      .map(({ h }) => h)
    const hues: number[] = []
    const spread = (hue: number) =>
      Math.min(
        ...hues.map((other) => hueDistance(other, hue) / VOICE_SPREAD),
        ...marked.map((other) => hueDistance(other, hue) / VOICE_CLEAR),
        Number.POSITIVE_INFINITY,
      )
    const vivid = names.map((name) => {
      const pick = chosen.get(name) as Pick
      const own = toOKLCH(pick.colour)
      const start = own.c >= 0.03 ? own.h : toOKLCH(builtIn(name)).h
      // the nearest hue that's clear of the rest, or else the clearest
      const tries = Array.from(
        { length: 72 },
        (_, step) =>
          (start + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 5 + 360) %
          360,
      )
      const hue =
        tries.find((hue) => spread(hue) >= 1) ??
        tries.reduce((best, hue) => (spread(hue) > spread(best) ? hue : best))
      hues.push(hue)
      // bright enough to glow on a dark background, deep enough to hold
      // colour on a light one
      const [low, high] = type === "dark" ? [0.65, 0.8] : [0.45, 0.62]
      const raw = fromOKLCH({
        l: Math.min(high, Math.max(low, own.l)),
        c: VIVID,
        h: hue,
      })
      const moved = hueDistance(hue, own.h) > 10 && own.c >= 0.03
      return {
        name,
        original: raw,
        colour: adjust(raw),
        source: `${pick.source}, made vivid${moved ? " in another hue" : ""}`,
      }
    })
    setPicks(vivid)
  }
  const voices = numbered("voice", 4).map(get)

  // Jumps keep clear of the accent and recording's red; collision marks lie
  // over voices, so keep clear of theirs.
  // Both are drawn from the brights of every theme, not this one's own, so
  // they stand out the same way whichever theme is on.
  setPicks(
    drawBrights(
      numbered("jump", 8),
      builtIn,
      [[background, 3]],
      [accent, get("record")],
      options.brights,
    ),
  )
  setPicks(
    drawBrights(
      numbered("collision", 6),
      builtIn,
      [[background, 4]],
      voices,
      options.brights,
    ),
  )

  // The grid's steps and the layers behind them, pushed apart and coloured
  // as far as the drama goes. Steps with notes (background-secondary) and
  // empty ones (step) lean toward the tint, and their numbers stay
  // legible.
  if (drama > 0) {
    const pushes: [
      string,
      { lift?: number; chroma?: number; tint?: number },
    ][] = [
      ["background-dark", { lift: 0.6, chroma: 0.015 }],
      ["editor-background", { lift: 0.6, chroma: 0.015 }],
      ["ruler-background", { lift: 0.6, chroma: 0.015 }],
      ["background-secondary", { lift: 0.8, chroma: 0.03, tint: 0.25 }],
      ["step", { lift: 0.8, chroma: 0.02, tint: 0.12 }],
      ["step-skip", { lift: 0.8, chroma: 0.01 }],
      ["step-rest", { lift: 0.5, chroma: 0.04 }],
    ]
    const calm = new Map(pushes.map(([name]) => [name, get(name)]))
    for (const [name, push] of pushes) {
      const { colour, source } = made.get(name) as {
        colour: RGBA
        source: string
      }
      set(name, intensify(colour, background, push), `${source}, dramatised`)
    }
    // As legible as asked, or as the calm colour was where that's less:
    // pushed lighter under light text, say, a step comes back only as far
    // as it started, not past it toward the background.
    const legibleUnder = (name: string, text: string, minimum: number) => {
      const { colour, source } = made.get(name) as {
        colour: RGBA
        source: string
      }
      const was = contrast(calm.get(name) as RGBA, get(text))
      const fitted = apart(colour, get(text), Math.min(minimum, was))
      set(name, fitted, describeMove(colour, fitted, source))
    }
    legibleUnder("background-secondary", "fg", 4.5)
    legibleUnder("step", "fg-secondary", 3)
  }

  // what it's told, taken as it is
  for (const [name, value] of Object.entries(options.set ?? {})) {
    if (!(name in bases.dark)) {
      throw new Error(`There's no colour called ${name} to set.`)
    }
    const { colour, key } = askedFor(name, value) as {
      colour: RGBA
      key: string
    }
    set(name, colour, key.replace(/chosen$/, "set"))
  }

  // the ruler's numbers are secondary text, on the ruler's own background
  if (options.set?.["ruler-label"] === undefined) {
    const secondary = get("fg-secondary")
    const legible = apart(secondary, get("ruler-background"), 4.5)
    set(
      "ruler-label",
      legible,
      describeMove(secondary, legible, "fg-secondary"),
    )
  }

  // the logo keeps its colour, only kept legible on the bar
  {
    const logo = builtIn("logo")
    const legible = apart(logo, get("background-dark"), 3)
    set("logo", legible, describeMove(logo, legible, "built-in"))
  }

  // Anything the built-in theme has that isn't made above, say a colour
  // added since, still gets one: a hue of its own kept, a grey placed from
  // the background.
  const colours: ThemeColour[] = []
  for (const name of Object.keys(bases.dark)) {
    const colour = parseColour(base[name])
    if (colour === null) {
      continue // a font, say
    }
    if (!made.has(name)) {
      if (toOKLCH(colour).c >= 0.03) {
        set(name, colour, "built-in")
      } else {
        set(name, placed(name, "background"), "derived")
      }
      notes.push(
        `Nothing here makes ${name}, so it was ${made.get(name)?.source}.`,
      )
    }
    const done = made.get(name) as { colour: RGBA; source: string }
    colours.push({ name, value: toHex(done.colour), source: done.source })
  }

  return { type, colours, notes }
}

// --------------------------------------------------------------- output

/**
 * The colours on a theme's commented-out lines, as VS Code writes out the
 * ones a theme leaves to it: `//"key": "#rrggbb",`.
 */
export const commentedColours = (text: string): Record<string, string> => {
  const found: Record<string, string> = {}
  const line = /^\s*\/\/\s*"([^"]+)"\s*:\s*"(#[0-9a-fA-F]{3,8})"/gm
  for (const match of text.matchAll(line)) {
    found[match[1]] = match[2]
  }
  return found
}

/** A theme's stylesheet: its variables under its data-theme. */
export const themeCSS = (
  id: string,
  name: string,
  converted: ConvertedTheme,
) => {
  const width = Math.max(
    ...converted.colours.map(
      ({ name, value }) => `  --midiseq-${name}: ${value};`.length,
    ),
  )
  const lines = converted.colours.map(
    ({ name, value, source }) =>
      `  --midiseq-${name}: ${value};`.padEnd(width + 1) + `/* ${source} */`,
  )
  return `/* ${name}, a ${converted.type} theme made from a VS Code theme by
   \`npm run theme\`. Beside each colour is where it came from: a VS Code
   colour, a syntax colour, or "derived" from the theme's background, text
   and accent as the built-in ${converted.type} theme places it. Rerunning the
   utility replaces this file, so a lasting change belongs in the utility or
   the VS Code theme it reads. */
:root[data-theme="${id}"] {
${lines.join("\n")}
}
`
}

/** The --midiseq- variables of a stylesheet block, by the block's selector. */
export const paletteOf = (css: string, selector: string): Palette => {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const start = plain.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`The stylesheet has no ${selector} block.`)
  }
  const block = plain.slice(start, plain.indexOf("}", start))
  const palette: Palette = {}
  for (const match of block.matchAll(/--midiseq-([\w-]+)\s*:\s*([^;]+);/g)) {
    palette[match[1]] = match[2].trim()
  }
  return palette
}

/** The built-in dark and light themes, read from the stylesheet. */
export const builtInPalettes = (css: string): BasePalettes => ({
  dark: paletteOf(css, ":root"),
  light: paletteOf(css, ':root[data-theme="light"]'),
})
