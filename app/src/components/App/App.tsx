import React from "react"
import { StoreContext } from "../../hooks/useStores"
import RootStore from "../../stores/RootStore"
import { ThemeProvider } from "../../theme/ThemeProvider"
import { RootView } from "../RootView/RootView"
import { LocalizationProvider } from "./LocalizationProvider"

export function App({ rootStore }: { rootStore: RootStore }) {
  return (
    <React.StrictMode>
      <StoreContext.Provider value={rootStore}>
        <ThemeProvider>
          <LocalizationProvider>
            <RootView />
          </LocalizationProvider>
        </ThemeProvider>
      </StoreContext.Provider>
    </React.StrictMode>
  )
}
