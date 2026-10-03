import { FC, PropsWithChildren, useEffect } from "react"
import { useSettings } from "../../hooks/useSettings"
import {
  LocalizationContext,
  useCurrentLanguage,
} from "../../localize/useLocalization"

// The page says which language it's in, so that screen readers speak it
// and the browser picks Japanese or Chinese glyphs for the shared
// characters.
const DocumentLanguage: FC = () => {
  const language = useCurrentLanguage()
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  return null
}

export const LocalizationProvider: FC<PropsWithChildren> = ({ children }) => {
  const { language } = useSettings()
  return (
    <LocalizationContext.Provider value={{ language }}>
      <DocumentLanguage />
      {children}
    </LocalizationContext.Provider>
  )
}
