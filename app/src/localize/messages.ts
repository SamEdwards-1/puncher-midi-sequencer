import type en from "./en"
import { format, Values } from "./format"
import localization, { LANGUAGES, Language } from "./localization"

export type LocalizationKey = keyof typeof en

/** A string with its blanks filled: "Fills steps 1–8 of 16". */
export type Format = (key: LocalizationKey, values?: Values) => string

export const formatIn =
  (language: Language): Format =>
  (key, values) =>
    format(language, localization[language][key], values)

/**
 * In the language the page is in — set on <html> as the language changes —
 * for what's said outside React: an alert, a confirm, an error from a store.
 */
export const formatInPage: Format = (key, values) => {
  const language = document.documentElement.lang as Language
  return formatIn(LANGUAGES.includes(language) ? language : "en")(key, values)
}

/**
 * An error the app says in each language: its message is the English, as
 * analytics and the console record it, and errorMessage says it in another.
 */
export class LocalizedError extends Error {
  constructor(
    readonly key: LocalizationKey,
    readonly values: Values = {},
  ) {
    super(formatIn("en")(key, values))
  }
}

/** What went wrong, said by `say`: a browser's own errors as they come. */
export const errorMessage = (error: unknown, say: Format = formatInPage) =>
  error instanceof LocalizedError
    ? say(error.key, error.values)
    : error instanceof Error
      ? error.message
      : String(error)
