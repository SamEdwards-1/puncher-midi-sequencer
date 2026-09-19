import React from "react"
import { StoreContext } from "../../hooks/useStores"
import RootStore from "../../stores/RootStore"
import { ThemeProvider } from "../../theme/ThemeProvider"
import { RootView } from "../RootView/RootView"
import { GlobalCSS } from "../Theme/GlobalCSS"
import { LocalizationProvider } from "./LocalizationProvider"

export function App({ rootStore }: { rootStore: RootStore }) {
  return (
    <React.StrictMode>
      <StoreContext.Provider value={rootStore}>
        <ThemeProvider>
          <LocalizationProvider>
            <GlobalCSS />
            <RootView />
          </LocalizationProvider>
        </ThemeProvider>
      </StoreContext.Provider>
    </React.StrictMode>
  )
}
