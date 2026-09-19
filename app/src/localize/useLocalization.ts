import { createLocalization } from "use-l10n"
import localization from "./localization"

export const {
  LocalizationContext,
  useLocalization,
  useCurrentLanguage,
  Localized,
} = createLocalization(localization, "en", [])

export type Language = keyof typeof localization
export type LocalizationKey = keyof (typeof localization)[Language]
