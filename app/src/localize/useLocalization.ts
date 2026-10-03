import { useMemo } from "react"
import { createLocalization } from "use-l10n"
import localization, { LANGUAGE_ALIASES, Language } from "./localization"
import { Format, formatIn } from "./messages"

// with no language chosen in Settings, the browser's (or ?lang=ja's)
export const {
  LocalizationContext,
  useLocalization,
  useCurrentLanguage,
  Localized,
} = createLocalization(localization, "en", LANGUAGE_ALIASES)

export type { Format, Language }
export type { LocalizationKey } from "./messages"

/** The current language's strings, filled; see format.ts. */
export const useFormat = (): Format => {
  const language = useCurrentLanguage()
  return useMemo(() => formatIn(language), [language])
}
