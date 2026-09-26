import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { parseColour } from "./colour.ts"
import { builtInPalettes, paletteOf } from "./fromVSCode.ts"
import {
  activeTheme,
  DEFAULT_THEME_CHOICE,
  generatedThemes,
  themeChoiceFrom,
} from "./Theme"

// read from disk: Vitest empties CSS, even ?raw
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, path), "utf8")
const sheets = Object.fromEntries(
  readdirSync(resolve(import.meta.dirname, "themes"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => [`./themes/${file}`, read(`./themes/${file}`)]),
)

const { dark } = builtInPalettes(read("./layout.css"))
const colourNames = Object.keys(dark).filter(
  (name) => parseColour(dark[name]) !== null,
)

describe("the themes made from VS Code themes", () => {
  it("are each listed, with a stylesheet", () => {
    expect(Object.keys(sheets).sort()).toEqual(
      generatedThemes.map(({ id }) => `./themes/${id}.css`).sort(),
    )
  })

  // A colour added to the built-in themes and not to these would show the
  // dark one's in them: npm run theme -- --all makes them again.
  it.each(
    generatedThemes.map(({ id }) => id),
  )("%s has every colour the built-in themes have", (id) => {
    const palette = paletteOf(
      sheets[`./themes/${id}.css`],
      `:root[data-theme="${id}"]`,
    )
    expect(Object.keys(palette).sort()).toEqual([...colourNames].sort())
  })
})

describe("the theme chosen", () => {
  it("wears the mode's theme, or the computer's way on System", () => {
    const choice = { mode: "system", dark: "dark", light: "light" } as const
    expect(activeTheme(choice, true)).toBe("dark")
    expect(activeTheme(choice, false)).toBe("light")
    expect(activeTheme({ ...choice, mode: "light" }, true)).toBe("light")
  })

  it("reads back whole, whatever was saved", () => {
    expect(themeChoiceFrom(null)).toEqual(DEFAULT_THEME_CHOICE)
    expect(themeChoiceFrom({ mode: "system" })).toEqual({
      ...DEFAULT_THEME_CHOICE,
      mode: "system",
    })
    // a theme of the other kind, or none at all, gives way to the default
    expect(
      themeChoiceFrom({ mode: "neon", dark: "light", light: "gone" }),
    ).toEqual(DEFAULT_THEME_CHOICE)
  })

  it("takes the one theme saved before there were modes", () => {
    expect(themeChoiceFrom({ themeType: "light" })).toEqual({
      mode: "light",
      dark: "dark",
      light: "light",
    })
  })
})
