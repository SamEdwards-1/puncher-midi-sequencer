import { configure } from "mobx"
import { createRoot } from "react-dom/client"
import { App } from "./components/App/App"
import RootStore from "./stores/RootStore"

configure({
  enforceActions: "never",
})

const rootStore = new RootStore()
rootStore.init()

// a handle for poking at the app from the console while developing
if (import.meta.env.DEV) {
  ;(window as unknown as { midiseq: RootStore }).midiseq = rootStore
}

const container = document.querySelector("#root")
if (container === null) {
  throw new Error("#root element not found")
}
createRoot(container).render(<App rootStore={rootStore} />)
