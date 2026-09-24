import { useEffect, useState } from "react"

// Where the browser can't say (as in tests), it answers `fallback`.
const matches = (query: string, fallback: boolean) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : fallback

/** Whether a media query matches, kept up to date as the window changes. */
export function useMediaQuery(query: string, fallback = true): boolean {
  const [matched, setMatched] = useState(() => matches(query, fallback))
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }
    const list = window.matchMedia(query)
    const update = () => setMatched(list.matches)
    update()
    list.addEventListener("change", update)
    return () => list.removeEventListener("change", update)
  }, [query])
  return matched
}
