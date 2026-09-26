import generated from "./themes/themes.json"

// The themes themselves are CSS variables selected by data-theme on the
// root: the built-in two in styles.css (Deep Harbor and Overcast, the
// defaults), and each one made from a VS Code theme (npm run theme) in a
// stylesheet of its own under themes/, all of which load here.
import.meta.glob("./themes/*.css", { eager: true })

export type ThemeKind = "dark" | "light"

// the default of each kind, named in the localization
export const builtInThemes = [
  { id: "dark", type: "dark" },
  { id: "light", type: "light" },
] as const

// named by whoever made them, the same in every language
export const generatedThemes: readonly {
  id: string
  name: string
  type: ThemeKind
}[] = generated as { id: string; name: string; type: ThemeKind }[]

export const themesOfKind = (kind: ThemeKind) =>
  [...builtInThemes, ...generatedThemes].filter(({ type }) => type === kind)

// Light and Dark keep to one theme each; System follows the computer's
// setting from one to the other.
export const THEME_MODES = ["light", "dark", "system"] as const

export type ThemeMode = (typeof THEME_MODES)[number]

/** Which way to go, and the theme to wear either way. */
export type ThemeChoice = { mode: ThemeMode; dark: string; light: string }

export const DEFAULT_THEME_CHOICE: ThemeChoice = {
  mode: "dark",
  dark: "dark",
  light: "light",
}

const isOfKind = (id: unknown, kind: ThemeKind): id is string =>
  themesOfKind(kind).some((theme) => theme.id === id)

/**
 * The choice as saved, made whole: a theme that has gone, or is of the other
 * kind, gives way to the default of its kind. From before there were modes,
 * a single theme was saved; its kind becomes the mode.
 */
export const themeChoiceFrom = (saved: unknown): ThemeChoice => {
  const { mode, dark, light, themeType } =
    typeof saved === "object" && saved !== null
      ? (saved as Record<string, unknown>)
      : {}
  const choice = { ...DEFAULT_THEME_CHOICE }
  for (const kind of ["dark", "light"] as const) {
    if (isOfKind(themeType, kind)) {
      choice.mode = kind
      choice[kind] = themeType
    }
  }
  if (THEME_MODES.some((known) => known === mode)) {
    choice.mode = mode as ThemeMode
  }
  if (isOfKind(dark, "dark")) {
    choice.dark = dark
  }
  if (isOfKind(light, "light")) {
    choice.light = light
  }
  return choice
}

/** The theme to wear, the system's setting given. */
export const activeTheme = (choice: ThemeChoice, systemIsDark: boolean) => {
  const kind =
    choice.mode === "system" ? (systemIsDark ? "dark" : "light") : choice.mode
  return choice[kind]
}
