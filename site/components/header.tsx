"use client"

import {
  ArrowRight,
  ArrowUpRight,
  Github,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { track } from "../lib/analytics"
import { appUrl, githubUrl } from "../lib/config"
import { Navigation } from "./navigation"

type SearchDoc = {
  slug: string
  title: string
  description: string
  group: string
  sections: { id: string; title: string; body: string }[]
}

export function Header({ index }: { index: SearchDoc[] }) {
  const pathname = usePathname()
  const previousPath = useRef(pathname)
  const searchDialog = useRef<HTMLDialogElement>(null)
  const menuDialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // The last search counted. A search is counted as the dialog closes, once
  // the reader is done typing, and not again when reopened unchanged.
  const counted = useRef("")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState("light")

  useEffect(() => {
    // Persistent chrome can make Next's automatic scroll detection keep the old
    // position. New guides start at their heading; hash links retain their target.
    if (previousPath.current !== pathname && !window.location.hash) {
      window.scrollTo({ top: 0, behavior: "instant" })
    }
    previousPath.current = pathname
  }, [pathname])

  useEffect(() => {
    setMode(document.documentElement.dataset.mode || "light")
    const open = () => {
      searchDialog.current?.showModal()
      input.current?.focus()
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (searchDialog.current?.open) searchDialog.current.close()
        else open()
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("puncher-search", open)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("puncher-search", open)
    }
  }, [])

  const changeMode = (value: string) => {
    document.documentElement.dataset.mode = value
    setMode(value)
    track("theme_change", { setting: "mode", value })
    try {
      localStorage.setItem("puncher-docs-mode", value)
    } catch {
      /* Theme still works if storage is unavailable. */
    }
  }
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const results = index
    .flatMap((doc) => {
      if (!terms.length)
        return [{ ...doc, href: `/docs/${doc.slug}`, excerpt: doc.description }]
      if (
        terms.every((term) =>
          `${doc.title} ${doc.description}`.toLowerCase().includes(term),
        )
      ) {
        return [{ ...doc, href: `/docs/${doc.slug}`, excerpt: doc.description }]
      }
      const section = doc.sections.find((section) =>
        terms.every((term) =>
          `${section.title} ${section.body}`.toLowerCase().includes(term),
        ),
      )
      return section
        ? [
            {
              ...doc,
              href: `/docs/${doc.slug}#${section.id}`,
              excerpt: section.title,
            },
          ]
        : []
    })
    .slice(0, terms.length ? 12 : 5)

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <Link
              href="/"
              aria-label="PUNCHER support home"
              className="brand-logo"
            />
            <span className="brand-divider" />
            <Link href="/docs/introduction" className="brand-label">
              Field guide
            </Link>
          </div>
          <button
            type="button"
            className="header-search"
            aria-label="Search documentation"
            onClick={() => {
              searchDialog.current?.showModal()
              input.current?.focus()
            }}
          >
            <Search size={16} />
            <span>Search documentation</span>
            <kbd>Ctrl K</kbd>
          </button>
          <nav aria-label="Main" className="main-nav">
            <Link href="/" className="support-link">
              Support
            </Link>
            <a
              href={appUrl}
              className="launch-link"
              onClick={() => track("launch_app", { link_location: "header" })}
            >
              Launch app <ArrowUpRight size={15} />
            </a>
            <a
              href={githubUrl}
              aria-label="PUNCHER on GitHub"
              className="icon-button"
            >
              <Github size={19} />
            </a>
            <span className="header-separator" />
            <button
              type="button"
              className="icon-button"
              onClick={() => changeMode(mode === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
            >
              {mode === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              type="button"
              className="icon-button mobile-menu-button"
              aria-label="Open documentation menu"
              onClick={() => menuDialog.current?.showModal()}
            >
              <Menu size={21} />
            </button>
          </nav>
        </div>
      </header>
      <dialog
        ref={searchDialog}
        className="search-dialog"
        aria-label="Search documentation"
        onClick={(event) => {
          if (event.target === event.currentTarget)
            searchDialog.current?.close()
        }}
        onClose={() => {
          const term = query.trim()
          if (term === "" || term === counted.current) return
          counted.current = term
          track("search", {
            search_term: term.slice(0, 100),
            result_count: results.length,
          })
        }}
      >
        <div className="search-inner">
          <div className="search-input-row">
            <Search size={21} />
            <input
              ref={input}
              aria-label="Search documentation"
              placeholder="Search steps, voices, MIDI…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Close search"
              onClick={() => searchDialog.current?.close()}
            >
              <X size={19} />
            </button>
          </div>
          <div className="search-results">
            <p className="eyebrow" aria-live="polite">
              {terms.length
                ? `${results.length} matching guides`
                : "Popular guides"}
            </p>
            {results.map((result) => (
              <Link
                key={result.slug}
                href={result.href}
                onClick={() => searchDialog.current?.close()}
                className="search-result"
              >
                <div>
                  <small>{result.group}</small>
                  <strong>{result.title}</strong>
                  <p>{result.excerpt}</p>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
            {!results.length && (
              <p className="empty-search">
                No guides match “{query}”. Try “MIDI”, “velocity”, or “export”.
              </p>
            )}
          </div>
          <div className="search-footer">
            <span>
              <kbd>Tab</kbd> move through results
            </span>
            <span>
              <kbd>Esc</kbd> close
            </span>
          </div>
        </div>
      </dialog>
      <dialog
        ref={menuDialog}
        className="menu-dialog"
        aria-label="Documentation menu"
      >
        <div className="flex items-center justify-between border-b border-line p-5">
          <strong>Documentation</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Close menu"
            onClick={() => menuDialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <Navigation
          items={index}
          onNavigate={() => menuDialog.current?.close()}
        />
      </dialog>
    </>
  )
}

export function SearchTrigger() {
  return (
    <button
      type="button"
      className="hero-search"
      onClick={() => window.dispatchEvent(new Event("puncher-search"))}
    >
      <Search size={18} />
      <span>Find something specific…</span>
      <kbd>Ctrl K</kbd>
    </button>
  )
}
