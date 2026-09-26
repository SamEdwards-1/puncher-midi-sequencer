import { ReactNode, useEffect } from "react"
import { useMediaQuery } from "../hooks/useMediaQuery"
import { useSettings } from "../hooks/useSettings"
import { activeTheme } from "./Theme"

/**
 * A theme is a set of CSS variables selected by an attribute on the root
 * element, so changing it is an attribute swap rather than a re-render of
 * anything that draws.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { themeChoice } = useSettings()
  // where the browser can't say, as in tests, dark
  const systemIsDark = useMediaQuery("(prefers-color-scheme: dark)", true)
  const theme = activeTheme(themeChoice, systemIsDark)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return <>{children}</>
}
