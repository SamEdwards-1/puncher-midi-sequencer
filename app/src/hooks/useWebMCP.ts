import { useEffect } from "react"
import { modelContextOf, registerTools } from "../webmcp/modelContext"
import { createTools } from "../webmcp/tools"
import { useSelectionAccess } from "./useSequencerView"
import { useStores } from "./useStores"

/**
 * Offers the sequencer to agents in the browser as WebMCP tools, for as long
 * as it is shown. A browser without WebMCP has no `document.modelContext`,
 * and nothing is offered.
 */
export function useWebMCP() {
  const rootStore = useStores()
  const selection = useSelectionAccess()

  useEffect(() => {
    const context = modelContextOf(document)
    if (context === null) {
      return
    }
    const registration = new AbortController()
    void registerTools(
      context,
      createTools(rootStore, selection),
      registration.signal,
    )
    return () => registration.abort()
  }, [rootStore, selection])
}
