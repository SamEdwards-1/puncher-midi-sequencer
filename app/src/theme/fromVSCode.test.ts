import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  contrast,
  difference,
  hueDistance,
  parseColour,
  type RGBA,
  toOKLCH,
} from "./colour.ts"
import {
  brightsOf,
  builtInPalettes,
  type ConvertedTheme,
  commentedColours,
  drawBrights,
  parseJSONC,
  themeCSS,
  themeFromVSCode,
} from "./fromVSCode.ts"

// read from disk: Vitest empties CSS, even ?raw
const styles = readFileSync(
  resolve(import.meta.dirname, "./layout.css"),
  "utf8",
)
const bases = builtInPalettes(styles)

// every colour the built-in dark theme has, fonts aside
const colourNames = Object.keys(bases.dark).filter(
  (name) => parseColour(bases.dark[name]) !== null,
)

const colourOf = (theme: ConvertedTheme, name: string) => {
  const found = theme.colours.find((colour) => colour.name === name)
  if (!found) {
    throw new Error(`no ${name}`)
  }
  return found
}
const rgb = (theme: ConvertedTheme, name: string) =>
  parseColour(colourOf(theme, name).value) as RGBA

// the parts of a real theme that matter here
const navy = {
  type: "dark",
  colors: {
    "activityBar.background": "#141820",
    "activityBarBadge.background": "#4b76cf",
    "activityBarBadge.foreground": "#ffffff",
    "editor.background": "#212836",
    "editor.foreground": "#97a7c8",
    "editorLineNumber.foreground": "#3d4d67",
    foreground: "#818ca6",
    "gitDecoration.untrackedResourceForeground": "#70ca8e",
    "list.inactiveSelectionBackground": "#303b50",
    "scrollbarSlider.background": "#ffffff11",
    "sideBar.background": "#1c212e",
    "titleBar.activeBackground": "#1c212e",
  },
  tokenColors: [
    { scope: "comment", settings: { foreground: "#506686" } },
    { scope: "keyword", settings: { foreground: "#D59DF6" } },
    { scope: "constant.numeric", settings: { foreground: "#DC9656" } },
    { scope: "string", settings: { foreground: "#82C600" } },
    { scope: ["storage", "storage.type"], settings: { foreground: "#FF5BA2" } },
    { scope: "support.type", settings: { foreground: "#4FF2F8" } },
  ],
}

describe("a VS Code theme made into one of ours", () => {
  it("reads VS Code's JSON, comments and trailing commas and all", () => {
    const text = `{
      // a line comment
      "$schema": "vscode://schemas/color-theme", /* and a block */
      "colors": { "editor.background": "#101010", },
      "tokenColors": [{ "scope": "a,}", "settings": {} },],
    }`
    expect(parseJSONC(text)).toEqual({
      $schema: "vscode://schemas/color-theme",
      colors: { "editor.background": "#101010" },
      tokenColors: [{ scope: "a,}", settings: {} }],
    })
  })

  it("has every colour the built-in theme has", () => {
    const theme = themeFromVSCode(navy, bases)
    expect(theme.colours.map(({ name }) => name)).toEqual(colourNames)
    for (const { value } of theme.colours) {
      expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
    }
  })

  it("takes the theme's background, text and accent as they are", () => {
    const theme = themeFromVSCode(navy, bases)
    expect(theme.type).toBe("dark")
    expect(colourOf(theme, "background")).toEqual({
      name: "background",
      value: "#212836",
      source: "editor.background",
    })
    expect(colourOf(theme, "fg").value).toBe("#97a7c8")
    expect(colourOf(theme, "fg-secondary").value).toBe("#818ca6")
    expect(colourOf(theme, "theme").value).toBe("#4b76cf")
    expect(colourOf(theme, "on-surface").value).toBe("#ffffff")
    // the comment colour, where the line numbers are too faint to read
    expect(colourOf(theme, "fg-tertiary")).toMatchObject({
      value: "#506686",
      source: "syntax comment",
    })
  })

  it("takes a surface only where it sits as ours does", () => {
    const theme = themeFromVSCode(navy, bases)
    // the title bar is a shade darker, as our top bar is
    expect(colourOf(theme, "background-dark")).toMatchObject({
      value: "#1c212e",
      source: "titleBar.activeBackground",
    })
    // and the activity bar darker still, as our ruler is
    expect(colourOf(theme, "ruler-background").value).toBe("#141820")
    // the rest are tinted with the theme's navy
    const roll = toOKLCH(rgb(theme, "roll-white"))
    const navyHue = toOKLCH(rgb(theme, "background")).h
    expect(hueDistance(roll.h, navyHue)).toBeLessThan(10)
    expect(colourOf(theme, "roll-white").source).toBe("derived")
  })

  it("gives the voices the theme's own colours and the jumps brights, none twice", () => {
    const theme = themeFromVSCode(navy, bases)
    const voices = [0, 1, 2, 3].map((index) =>
      colourOf(theme, `voice-${index}`),
    )
    // the orange voice from the numbers; the blue one not the accent, which
    // is the envelope's
    expect(voices[1].source).toMatch(/^syntax constant.numeric/)
    expect(voices[0].source).not.toBe("activityBarBadge.background")
    expect(new Set(voices.map(({ value }) => value)).size).toBe(4)
    const jumps = Array.from({ length: 8 }, (_, index) =>
      colourOf(theme, `jump-${index}`),
    )
    for (const { source } of jumps) {
      expect(source).toMatch(/^bright, from /)
    }
    expect(new Set(jumps.map(({ value }) => value)).size).toBe(8)
  })

  it("darkens a voice until its white counts read", () => {
    const theme = themeFromVSCode(navy, bases)
    for (const index of [0, 1, 2, 3]) {
      expect(
        contrast(rgb(theme, `voice-${index}`), rgb(theme, "on-surface")),
      ).toBeGreaterThanOrEqual(3)
    }
    // the orange came from the numbers, made vivid
    expect(colourOf(theme, "voice-1").source).toMatch(
      /^syntax constant.numeric, made vivid/,
    )
  })

  it("lightens text too faint to read, as little as it takes", () => {
    const faint = {
      ...navy,
      colors: { ...navy.colors, "editor.foreground": "#4a5060" },
    }
    const theme = themeFromVSCode(faint, bases)
    const fg = rgb(theme, "fg")
    expect(contrast(fg, rgb(theme, "background"))).toBeCloseTo(4.5, 1)
    expect(colourOf(theme, "fg").source).toBe("editor.foreground, lightened")
  })

  it("makes scrollbars no fainter than ours", () => {
    const theme = themeFromVSCode(navy, bases)
    expect(colourOf(theme, "scrollbar")).toMatchObject({
      value: "#ffffff38",
      source: "scrollbarSlider.background, more opaque",
    })
  })

  it("builds a light theme on the light layout", () => {
    const paper = {
      // no type: the background says which
      colors: {
        "editor.background": "#fdf6e3",
        "editor.foreground": "#586e75",
        "button.background": "#268bd2",
      },
      tokenColors: [
        { scope: "keyword", settings: { foreground: "#859900" } },
        { scope: "string", settings: { foreground: "#2aa198" } },
      ],
    }
    const theme = themeFromVSCode(paper, bases)
    expect(theme.type).toBe("light")
    const background = rgb(theme, "background")
    expect(colourOf(theme, "background").value).toBe("#fdf6e3")
    // the ruler below the light background, as the light theme has it
    expect(toOKLCH(rgb(theme, "ruler-background")).l).toBeLessThan(
      toOKLCH(background).l,
    )
    // the accent carries white text, so it's a button with the white kept
    expect(colourOf(theme, "theme").value).toBe("#268bd2")
    // text stays legible on the cream
    expect(contrast(rgb(theme, "fg"), background)).toBeGreaterThanOrEqual(4.5)
    expect(
      contrast(rgb(theme, "fg-tertiary"), background),
    ).toBeGreaterThanOrEqual(2.3)
  })

  it("can be told which kind a theme is", () => {
    const theme = themeFromVSCode(navy, bases, { type: "light" })
    expect(theme.type).toBe("light")
  })

  it("keeps ours where a theme says next to nothing", () => {
    const theme = themeFromVSCode({ type: "dark" }, bases)
    expect(colourOf(theme, "background")).toMatchObject({
      value: "#25262d",
      source: "built-in",
    })
    expect(theme.notes).toEqual([
      "It has no editor.background, so the built-in one is kept.",
    ])
    expect(theme.colours).toHaveLength(colourNames.length)
  })

  // a theme whose colours come in near pairs: two greens, two pinks, and a
  // red for errors
  const pairs = {
    type: "dark",
    colors: {
      "editor.background": "#272431",
      "editor.foreground": "#f8f8f2",
      "button.background": "#7154a0",
      "editorError.foreground": "#d71b5d",
      descriptionForeground: "#ffefffaa",
      "input.placeholderForeground": "#a6a6a6",
      "editorLineNumber.foreground": "#9a80bb77",
      "editorGutter.addedBackground": "#56be92",
    },
    tokenColors: [
      { scope: "comment", settings: { foreground: "#9A80BB78" } },
      { scope: "keyword", settings: { foreground: "#F23074" } },
      { scope: "entity.name.class", settings: { foreground: "#54C898" } },
      { scope: "string", settings: { foreground: "#BEA2E0" } },
    ],
  }
  const set = (theme: ConvertedTheme, prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) =>
      rgb(theme, `${prefix}-${index}`),
    )

  it("keeps a set's colours far enough apart to tell", () => {
    const theme = themeFromVSCode(pairs, bases)
    for (const [prefix, count] of [
      ["jump", 8],
      ["collision", 6],
    ] as const) {
      const colours = set(theme, prefix, count)
      colours.forEach((one, index) => {
        for (const other of colours.slice(index + 1)) {
          expect(difference(one, other)).toBeGreaterThan(0.05)
          // they're dots, so told apart by hue: no amber beside an orange
          expect(
            hueDistance(toOKLCH(one).h, toOKLCH(other).h),
          ).toBeGreaterThanOrEqual(30)
        }
      })
    }
    // one green of a near pair among the brights, not both
    const greens = themeFromVSCode(pairs, bases, {
      brights: [
        { colour: "#56be92", source: "one" },
        { colour: "#54c898", source: "other" },
        ...["#ffce03", "#4fbfff", "#ff6262", "#d0a1ff", "#fd6209"].map(
          (colour) => ({ colour, source: colour }),
        ),
      ],
    })
    const jumps = greens.colours
      .filter(({ name }) => name.startsWith("jump-"))
      .map(({ value }) => value)
    expect(
      jumps.filter((value) => ["#56be92", "#54c898"].includes(value)),
    ).toHaveLength(1)
  })

  it("keeps the jumps clear of recording's red and the accent", () => {
    const theme = themeFromVSCode(pairs, bases)
    expect(colourOf(theme, "record").value).toBe("#d71b5d")
    for (const jump of set(theme, "jump", 8)) {
      expect(difference(jump, rgb(theme, "record"))).toBeGreaterThan(0.07)
      expect(difference(jump, rgb(theme, "theme"))).toBeGreaterThan(0.07)
    }
  })

  it("keeps the collision marks and envelope clear of the voices", () => {
    const theme = themeFromVSCode(pairs, bases)
    for (const voice of set(theme, "voice", 4)) {
      for (const mark of set(theme, "collision", 6)) {
        expect(difference(mark, voice)).toBeGreaterThan(0.05)
      }
      expect(difference(rgb(theme, "envelope"), voice)).toBeGreaterThan(0.05)
    }
  })

  it("dims the quietest text well below the secondary", () => {
    const theme = themeFromVSCode(pairs, bases)
    const background = rgb(theme, "background")
    // not the placeholder grey, meant for a white input and nearly as bright
    // as the secondary text, but the line numbers, brought up to legible
    expect(colourOf(theme, "fg-tertiary").source).toBe(
      "editorLineNumber.foreground, lightened",
    )
    expect(contrast(rgb(theme, "fg-tertiary"), background)).toBeLessThan(
      contrast(rgb(theme, "fg-secondary"), background) * 0.8,
    )
  })

  it("sees a translucent comment colour over the background", () => {
    const quiet = {
      ...pairs,
      colors: { ...pairs.colors, "editorLineNumber.foreground": undefined },
      tokenColors: [
        { scope: "comment", settings: { foreground: "#c9b8e8aa" } },
      ],
    }
    const theme = themeFromVSCode(quiet, bases)
    expect(colourOf(theme, "fg-tertiary").source).toMatch(/^syntax comment/)
    expect(colourOf(theme, "fg-tertiary").value).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("leaves out the syntax colours VS Code adds to every theme", () => {
    const stock = {
      ...navy,
      tokenColors: [
        ...navy.tokenColors,
        { scope: "token.info-token", settings: { foreground: "#6796E6" } },
      ],
    }
    const theme = themeFromVSCode(stock, bases)
    expect(
      theme.colours.some(({ source }) => source.includes("token.info-token")),
    ).toBe(false)
  })

  it("won't take a translucent button as the accent", () => {
    const tinted = {
      type: "light",
      colors: {
        "editor.background": "#fbf1c7",
        "editor.foreground": "#3c3836",
        "button.background": "#45858880",
        "activityBarBadge.background": "#458588",
      },
    }
    const theme = themeFromVSCode(tinted, bases)
    expect(colourOf(theme, "theme")).toMatchObject({
      value: "#458588",
      source: "activityBarBadge.background",
    })
  })

  it("keeps the built-in tint on a grey background, not a made-up hue", () => {
    const white = {
      type: "light",
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#3b3b3b",
      },
    }
    const theme = themeFromVSCode(white, bases)
    const surface = toOKLCH(rgb(theme, "ruler-background"))
    const builtIn = toOKLCH(
      parseColour(bases.light["ruler-background"]) as RGBA,
    )
    expect(hueDistance(surface.h, builtIn.h)).toBeLessThan(10)
  })

  it("drops a comma before commented-out lines, as VS Code exports", () => {
    const text = `{
      "colors": {
        "editor.background": "#101010",
        //"button.background": "#007acc",
        /* and a block */
      },
    }`
    expect(parseJSONC(text)).toEqual({
      colors: { "editor.background": "#101010" },
    })
    expect(commentedColours(text)).toEqual({ "button.background": "#007acc" })
  })

  it("lights controls with the theme's own mark for what's active", () => {
    const theme = themeFromVSCode(
      {
        ...navy,
        colors: {
          ...navy.colors,
          "activityBar.activeBorder": "#40d4e7",
          "button.background": "#009999",
        },
      },
      bases,
    )
    expect(colourOf(theme, "theme")).toMatchObject({
      value: "#40d4e7",
      source: "activityBar.activeBorder",
    })
    // and the envelope is lit the same
    expect(colourOf(theme, "envelope").source).toMatch(
      /^activityBar.activeBorder/,
    )
    for (const index of [0, 1, 2, 3]) {
      expect(
        difference(rgb(theme, `voice-${index}`), rgb(theme, "envelope")),
      ).toBeGreaterThan(0.09)
    }
  })

  it("leaves red to recording, unless the theme's buttons are red", () => {
    // a red tab marker beside a blue badge: the badge
    const marked = themeFromVSCode(
      { ...navy, colors: { ...navy.colors, "tab.activeBorder": "#f44747" } },
      bases,
    )
    expect(colourOf(marked, "theme").value).toBe("#4b76cf")
    // red buttons and badges: red, and recording keeps clear of it
    const red = themeFromVSCode(
      {
        type: "dark",
        colors: {
          "editor.background": "#390000",
          "editor.foreground": "#f8f8f8",
          "inputOption.activeBorder": "#cc0000",
          "button.background": "#883333",
          "badge.background": "#cc3333",
        },
        tokenColors: [
          { scope: "keyword", settings: { foreground: "#F12727" } },
          { scope: "storage", settings: { foreground: "#FF6262" } },
        ],
      },
      bases,
    )
    expect(colourOf(red, "theme").value).toBe("#cc0000")
    expect(difference(rgb(red, "record"), rgb(red, "theme"))).toBeGreaterThan(
      0.09,
    )
  })

  it("names voices from the theme's charts and terminal colours", () => {
    const theme = themeFromVSCode(
      {
        ...navy,
        colors: {
          ...navy.colors,
          // a violet accent, so a blue voice isn't taken for the envelope
          "activityBar.activeBorder": "#998ef1",
          "terminal.ansiBlue": "#49ace9",
          "terminal.ansiYellow": "#e4b781",
          "terminal.ansiGreen": "#49e9a6",
          "terminal.ansiMagenta": "#d65fe0",
        },
      },
      bases,
    )
    expect(
      [0, 1, 2, 3].map(
        (index) => colourOf(theme, `voice-${index}`).source.split(",")[0],
      ),
    ).toEqual([
      "terminal.ansiBlue",
      "terminal.ansiYellow",
      "terminal.ansiGreen",
      "terminal.ansiMagenta",
    ])
  })

  it("falls back on what VS Code shows for keys a theme leaves to it", () => {
    const sparse = {
      type: "light",
      colors: {
        "editor.background": "#f0f0f0",
        "editor.foreground": "#333333",
      },
    }
    const commented = {
      "activityBar.activeBorder": "#007acc",
      "button.foreground": "#ffffff",
      "charts.purple": "#652d90",
    }
    const theme = themeFromVSCode(sparse, bases, { commented })
    expect(colourOf(theme, "theme")).toMatchObject({
      value: "#007acc",
      source: "activityBar.activeBorder (commented out)",
    })
    expect(colourOf(theme, "on-surface").value).toBe("#ffffff")
    expect(colourOf(theme, "voice-3").source).toMatch(
      /^charts.purple \(commented out\)/,
    )
  })

  it("takes the accent it's told to, by key or colour", () => {
    const byKey = themeFromVSCode(navy, bases, {
      accent: "gitDecoration.untrackedResourceForeground",
    })
    expect(colourOf(byKey, "theme")).toMatchObject({
      value: "#70ca8e",
      source: "gitDecoration.untrackedResourceForeground, chosen",
    })
    const byColour = themeFromVSCode(navy, bases, { accent: "#c792ea" })
    expect(colourOf(byColour, "theme")).toMatchObject({
      value: "#c792ea",
      source: "chosen",
    })
    expect(() => themeFromVSCode(navy, bases, { accent: "nonsense" })).toThrow(
      /neither a key nor a colour/,
    )
  })

  it("keeps the voices clear of recording's red", () => {
    // the only colour for the purple voice's slot is recording's own red
    const theme = themeFromVSCode(
      {
        type: "dark",
        colors: {
          "editor.background": "#303446",
          "editor.foreground": "#c6d0f5",
          "button.background": "#ca9ee6",
          errorForeground: "#e78284",
          "charts.blue": "#8caaee",
          "charts.orange": "#ef9f76",
          "charts.green": "#a6d189",
          "terminal.ansiMagenta": "#f4b8e4",
        },
        tokenColors: [
          { scope: "constant.language", settings: { foreground: "#e78284" } },
        ],
      },
      bases,
    )
    // the theme's own, that is: a voice with nothing near its hue keeps
    // the built-in colour, as it would anywhere
    for (const index of [0, 1, 2, 3]) {
      const voice = colourOf(theme, `voice-${index}`)
      expect(voice.value).not.toBe(colourOf(theme, "record").value)
      if (voice.source !== "built-in") {
        expect(
          difference(rgb(theme, `voice-${index}`), rgb(theme, "record")),
        ).toBeGreaterThanOrEqual(0.1)
      }
    }
    expect(
      [0, 1, 2, 3].map((index) => colourOf(theme, `voice-${index}`).source),
    ).not.toContain("syntax constant.language")
  })

  it("can be told the background, the voices and what drama draws toward", () => {
    const theme = themeFromVSCode(navy, bases, {
      background: "activityBar.background",
      voices: ["#59a4f9", "gitDecoration.untrackedResourceForeground"],
      tint: "#ff5ba2",
      drama: 1,
    })
    expect(colourOf(theme, "background").source).toMatch(
      /^activityBar.background, chosen/,
    )
    expect(colourOf(theme, "voice-0").source).toMatch(/^chosen/)
    expect(colourOf(theme, "voice-1").source).toMatch(
      /^gitDecoration.untrackedResourceForeground, chosen/,
    )
    // the grid leans pink, not toward the blue accent
    const pink = toOKLCH(parseColour("#ff5ba2") as RGBA).h
    const blue = toOKLCH(rgb(theme, "theme")).h
    const step = toOKLCH(rgb(theme, "background-secondary")).h
    expect(hueDistance(step, pink)).toBeLessThan(hueDistance(step, blue))
  })

  it("takes any colour it's set outright, and keeps the ruler legible", () => {
    const theme = themeFromVSCode(navy, bases, {
      set: { divider: "#1f6f64", "ruler-label": "sideBar.background" },
    })
    expect(colourOf(theme, "divider")).toMatchObject({
      value: "#1f6f64",
      source: "set",
    })
    expect(colourOf(theme, "ruler-label").source).toBe(
      "sideBar.background, set",
    )
    expect(() =>
      themeFromVSCode(navy, bases, { set: { borders: "#000000" } }),
    ).toThrow(/no colour called borders/)

    // what's derived from a colour set follows it
    const quiet = themeFromVSCode(navy, bases, {
      set: { "fg-secondary": "#ff5ba2" },
    })
    expect(colourOf(quiet, "ruler-label").source).toMatch(/^fg-secondary/)
    expect(toOKLCH(rgb(quiet, "ruler-label")).h).toBeCloseTo(
      toOKLCH(parseColour("#ff5ba2") as RGBA).h,
      0,
    )

    const plain = themeFromVSCode(navy, bases)
    expect(
      contrast(rgb(plain, "ruler-label"), rgb(plain, "ruler-background")),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps quiet text on the text's side of a mid-toned background", () => {
    const theme = themeFromVSCode(
      {
        type: "light",
        colors: {
          "editor.background": "#6ab0a3",
          "editor.foreground": "#444444",
          "editorLineNumber.foreground": "#cccccc",
        },
      },
      bases,
    )
    for (const name of ["fg", "fg-secondary", "fg-tertiary"]) {
      expect(toOKLCH(rgb(theme, name)).l).toBeLessThan(
        toOKLCH(rgb(theme, "background")).l,
      )
    }
  })

  it("pushes the grid's steps apart and colours them, as far as asked", () => {
    const calm = themeFromVSCode(navy, bases)
    const dramatic = themeFromVSCode(navy, bases, { drama: 1 })
    const chroma = (theme: ConvertedTheme, name: string) =>
      toOKLCH(rgb(theme, name)).c
    const apartFrom = (theme: ConvertedTheme, name: string) =>
      difference(rgb(theme, name), rgb(theme, "background"))

    expect(colourOf(dramatic, "background").source).toMatch(/deepened$/)
    expect(chroma(dramatic, "background")).toBeGreaterThan(
      chroma(calm, "background"),
    )
    for (const name of ["background-secondary", "step"]) {
      expect(colourOf(dramatic, name).source).toMatch(/dramatised/)
      expect(chroma(dramatic, name)).toBeGreaterThan(chroma(calm, name))
      expect(apartFrom(dramatic, name)).toBeGreaterThan(apartFrom(calm, name))
    }
    // and what's written on them reads as well as it did, or as asked
    const reads = (theme: ConvertedTheme, name: string, text: string) =>
      contrast(rgb(theme, name), rgb(theme, text))
    expect(
      reads(dramatic, "background-secondary", "fg"),
    ).toBeGreaterThanOrEqual(
      Math.min(4.5, reads(calm, "background-secondary", "fg")),
    )
    expect(reads(dramatic, "step", "fg-secondary")).toBeGreaterThanOrEqual(
      Math.min(3, reads(calm, "step", "fg-secondary")) - 0.01,
    )
  })

  it("writes the theme as a stylesheet under its own name", () => {
    const css = themeCSS("navy", "Navy", themeFromVSCode(navy, bases))
    expect(css).toContain(':root[data-theme="navy"] {')
    expect(css).toMatch(
      /--midiseq-background: #212836; +\/\* editor\.background \*\//,
    )
    expect(css.match(/--midiseq-/g)).toHaveLength(colourNames.length)
  })
})

describe("the brights", () => {
  const theme = (colors: Record<string, string>) => ({ type: "dark", colors })

  it("keeps a theme's bright colours, not its dim ones or passing overlays", () => {
    const brights = brightsOf([
      {
        id: "one",
        json: theme({
          "terminal.ansiYellow": "#ffce03",
          "terminal.ansiBlue": "#4fbfff",
          "editor.background": "#1c212e",
          "editor.foreground": "#97a7c8",
          "terminal.ansiBlack": "#3d4d67",
          "editor.findMatchBackground": "#00ff00",
        }),
      },
    ])
    expect(brights.map(({ colour }) => colour)).toEqual(["#ffce03", "#4fbfff"])
    expect(brights[0].source).toBe("one terminal.ansiYellow")
  })

  it("keeps one of any two alike, the more colourful, round the hues", () => {
    const brights = brightsOf([
      { id: "one", json: theme({ "terminal.ansiRed": "#f06b73" }) },
      {
        id: "other",
        json: theme({
          "terminal.ansiRed": "#ff6262",
          "terminal.ansiGreen": "#7cd827",
        }),
      },
    ])
    expect(brights.map(({ colour }) => colour)).toEqual(["#ff6262", "#7cd827"])
  })

  it("draws each name the nearest hue, legible, and none alike", () => {
    const background = parseColour("#ffffff") as RGBA
    const layout = (name: string) =>
      parseColour(name === "a" ? "#e5c07b" : "#3bb3e2") as RGBA
    const drawn = drawBrights(
      ["a", "b"],
      layout,
      [[background, 3]],
      [],
      [
        { colour: "#4fbfff", source: "blue" },
        { colour: "#ffce03", source: "yellow" },
      ],
    )
    expect(drawn.map(({ source }) => source)).toEqual([
      "bright, from yellow",
      "bright, from blue",
    ])
    for (const { colour } of drawn) {
      expect(contrast(colour, background)).toBeGreaterThanOrEqual(3)
    }
  })

  it("gives a name with no hue the one furthest from those taken", () => {
    const layout = (name: string) =>
      parseColour(name === "a" ? "#e5c07b" : "#ecf2fd") as RGBA
    const drawn = drawBrights(
      ["a", "b"],
      layout,
      [],
      [],
      [
        { colour: "#ffce03", source: "yellow" },
        { colour: "#ff9f1c", source: "orange" },
        { colour: "#4fbfff", source: "blue" },
      ],
    )
    expect(drawn[1].source).toBe("bright, from blue")
  })
})
