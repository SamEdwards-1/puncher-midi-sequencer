import { VoiceIndex } from "@midiseq/core"
import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import PlusIcon from "mdi-react/PlusIcon"
import {
  CSSProperties,
  FC,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useLocalization } from "../../localize/useLocalization"
import { cn } from "../ui/cn"
import { fitTabs } from "./fitTabs"

export interface LaneTab {
  key: string
  label: string
  // a velocity tab wears its voice's colour
  voice?: VoiceIndex
  off?: boolean
}

const TAB = "h-7 flex-none whitespace-nowrap border-b-[0.15rem] px-2 text-small"
// the row's gap, and the overflow and add buttons' widths
const GAP = 4
const MORE = 40
const ADD = 24

const voiceColor = (voice: VoiceIndex): CSSProperties =>
  ({ "--midiseq-voice": `var(--midiseq-voice-${voice})` }) as CSSProperties

/**
 * The lane tabs on one row. As many as fit are shown, the open one always
 * among them; the rest wait in a menu at the row's end, before the +.
 */
export const LaneTabs: FC<{
  label: string
  tabs: LaneTab[]
  open: number
  onSelect: (index: number) => void
  onAdd: () => void
  addLabel: string
}> = ({ label, tabs, open, onSelect, onAdd, addLabel }) => {
  const localized = useLocalization()
  const row = useRef<HTMLDivElement>(null)
  const measurer = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ widths: [] as number[], available: 0 })
  const [menuOpen, setMenuOpen] = useState(false)

  const labels = tabs.map((tab) => tab.label).join("\n")
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the labels change
  useLayoutEffect(() => {
    const measure = () => {
      const widths = [...(measurer.current?.children ?? [])].map(
        (child) => (child as HTMLElement).offsetWidth,
      )
      const available = (row.current?.clientWidth ?? 0) - ADD - GAP
      setFit((last) =>
        last.available === available && last.widths.join() === widths.join()
          ? last
          : { widths, available },
      )
    }
    measure()
    const element = row.current
    if (element === null || typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [labels])

  const shown =
    fit.widths.length === tabs.length
      ? fitTabs(fit.widths, fit.available, open, { gap: GAP, more: MORE })
      : tabs.map((_, index) => index)
  const hidden = tabs
    .map((_, index) => index)
    .filter((index) => !shown.includes(index))

  // the menu closes on a click anywhere else, or Escape
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  const tabClass = (tab: LaneTab, selected: boolean) =>
    cn(
      TAB,
      selected
        ? tab.voice !== undefined
          ? "border-voice text-fg"
          : "border-envelope text-fg"
        : "border-transparent text-fg-secondary hover:text-fg",
      tab.off && "opacity-55",
    )

  return (
    <div
      ref={row}
      className="relative flex items-end gap-1 border-b border-divider"
    >
      <div
        role="tablist"
        aria-label={label}
        className="flex min-w-0 items-end gap-1 overflow-hidden"
      >
        {shown.map((index) => {
          const tab = tabs[index]
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={index === open}
              className={tabClass(tab, index === open)}
              style={
                tab.voice !== undefined ? voiceColor(tab.voice) : undefined
              }
              onClick={() => onSelect(index)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {hidden.length > 0 && (
        <div ref={menu} className="relative mb-1 flex-none">
          <button
            type="button"
            aria-label={localized["sequencer-step-more-lanes"]}
            title={localized["sequencer-step-more-lanes"]}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              "flex h-6 items-center justify-center gap-[0.1rem] rounded-sm text-small text-fg-secondary hover:bg-highlight hover:text-fg",
              menuOpen && "bg-highlight text-fg",
            )}
            style={{ width: MORE }}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {hidden.length}
            <ChevronDownIcon size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label={localized["sequencer-step-more-lanes"]}
              className="absolute top-[calc(100%+0.25rem)] right-0 z-20 flex max-h-64 min-w-[8rem] flex-col overflow-y-auto rounded-lg border border-popup-border bg-background-secondary py-1 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
            >
              {hidden.map((index) => {
                const tab = tabs[index]
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-2 px-3 py-[0.35rem] text-left text-small text-fg hover:bg-highlight",
                      tab.off && "opacity-55",
                    )}
                    style={
                      tab.voice !== undefined
                        ? voiceColor(tab.voice)
                        : undefined
                    }
                    onClick={() => {
                      setMenuOpen(false)
                      onSelect(index)
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 flex-none rounded-full",
                        tab.voice !== undefined ? "bg-voice" : "bg-envelope",
                      )}
                    />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        aria-label={addLabel}
        title={addLabel}
        className="mb-1 flex h-6 flex-none items-center justify-center rounded-sm text-fg-secondary hover:bg-highlight hover:text-fg"
        style={{ width: ADD }}
        onClick={onAdd}
      >
        <PlusIcon size={14} />
      </button>

      {/* every tab at its own width, out of sight, to know how many fit */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 h-0 w-0 overflow-hidden"
      >
        <div ref={measurer} className="flex w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              tabIndex={-1}
              className={tabClass(tab, false)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
