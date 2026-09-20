// The themes themselves live in styles.css, as the CSS variables every
// utility resolves through. All that is left here is which ones exist.
export const themeNames = ["dark", "light"] as const

export type ThemeType = (typeof themeNames)[number]
