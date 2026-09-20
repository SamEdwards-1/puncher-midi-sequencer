import { ReactNode, useEffect } from "react"
import { useSettings } from "../hooks/useSettings"

/**
 * A theme is a set of CSS variables selected by an attribute on the root
 * element, so changing it is an attribute swap rather than a re-render of
 * anything that draws.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { themeType } = useSettings()

  useEffect(() => {
    document.documentElement.dataset.theme = themeType
  }, [themeType])

  return <>{children}</>
}
