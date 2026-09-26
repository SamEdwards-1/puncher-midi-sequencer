import { atom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { focusAtom } from "jotai-optics"
import { Language } from "../localize/useLocalization"
import {
  DEFAULT_THEME_CHOICE,
  ThemeChoice,
  themeChoiceFrom,
} from "../theme/Theme"

export function useSettings() {
  return {
    get language() {
      return useAtomValue(languageAtom)
    },
    get themeChoice() {
      return useAtomValue(themeChoiceAtom)
    },
    setLanguage: useSetAtom(languageAtom),
    setThemeChoice: useSetAtom(themeChoiceAtom),
  }
}

// atoms with storage
const settingStorageAtom = atomWithStorage<{
  language: Language | null
}>("midiseq.settings", {
  language: null,
})
// as saved, which may be from an older version, or name a theme since gone
const themeStorageAtom = atomWithStorage<unknown>(
  "midiseq.theme",
  DEFAULT_THEME_CHOICE,
)

// focused atoms
const languageAtom = focusAtom(settingStorageAtom, (optic) =>
  optic.prop("language"),
)
// the theme choice made whole; a change to part of it saves all of it
const themeChoiceAtom = atom(
  (get) => themeChoiceFrom(get(themeStorageAtom)),
  (get, set, change: Partial<ThemeChoice>) =>
    set(themeStorageAtom, {
      ...themeChoiceFrom(get(themeStorageAtom)),
      ...change,
    }),
)
