import en from "./en"
import fr from "./fr"
import ja from "./ja"
import sk from "./sk"
import zhHans from "./zh-Hans"

// every language the app speaks, by its BCP 47 tag, in the order the
// language picker lists them
const localization = {
  en,
  fr,
  sk,
  ja,
  "zh-Hans": zhHans,
}

export default localization

export type Language = keyof typeof localization

export const LANGUAGES = Object.keys(localization) as Language[]

// each language by its own name, as someone looking for it would know it
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  sk: "Slovenčina",
  ja: "日本語",
  "zh-Hans": "简体中文",
}

// The browser's tags for each: "fr-CA" is French, "ja-JP" Japanese. Any
// Chinese but the Traditional (Hant, or Taiwan's, Hong Kong's or Macau's)
// is the Simplified; the Traditional falls back to English.
export const LANGUAGE_ALIASES: [RegExp, Language][] = [
  [/^en\b/i, "en"],
  [/^fr\b/i, "fr"],
  [/^sk\b/i, "sk"],
  [/^ja\b/i, "ja"],
  [/^zh\b(?!-(hant|tw|hk|mo)\b)/i, "zh-Hans"],
]
