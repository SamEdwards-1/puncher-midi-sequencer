import { useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { focusAtom } from "jotai-optics"
import { Language } from "../localize/useLocalization"
import { ThemeType } from "../theme/Theme"

export function useSettings() {
  return {
    get language() {
      return useAtomValue(languageAtom)
    },
    get themeType() {
      return useAtomValue(themeTypeAtom)
    },
    setLanguage: useSetAtom(languageAtom),
    setThemeType: useSetAtom(themeTypeAtom),
  }
}

// atoms with storage
const settingStorageAtom = atomWithStorage<{
  language: Language | null
}>("midiseq.settings", {
  language: null,
})
const themeStorageAtom = atomWithStorage<{
  themeType: ThemeType
}>("midiseq.theme", {
  themeType: "dark",
})

// focused atoms
const languageAtom = focusAtom(settingStorageAtom, (optic) =>
  optic.prop("language"),
)
const themeTypeAtom = focusAtom(themeStorageAtom, (optic) =>
  optic.prop("themeType"),
)
