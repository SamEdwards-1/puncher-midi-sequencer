import { FC } from "react"
import { useMediaQuery } from "../../hooks/useMediaQuery"
import { SidePane, useSidePane } from "../../hooks/useSequencerView"
import { useLocalization } from "../../localize/useLocalization"
import { SequenceGrid } from "../SequenceGrid/SequenceGrid"
import { SequencerPanel } from "../SequencerPanel/SequencerPanel"
import { TopBar } from "../TopBar/TopBar"
import { cn } from "../ui/cn"
import { VoicePanel } from "../VoicePanel/VoicePanel"

// Narrower than this, the sequencer's settings give up their own column.
const THREE_COLUMNS = "(min-width: 1200px)"

const PANES: SidePane[] = ["sequencer", "voices"]

export const SequencerEditor: FC = () => {
  const wide = useMediaQuery(THREE_COLUMNS)

  return (
    <div className="flex min-h-0 grow flex-col bg-background">
      <TopBar />
      {wide ? (
        <div className="grid min-h-0 grow grid-cols-[minmax(16rem,20rem)_1fr_minmax(18rem,22rem)]">
          <SequencerPanel />
          <SequenceGrid />
          <VoicePanel />
        </div>
      ) : (
        <div className="grid min-h-0 grow grid-cols-[1fr_minmax(18rem,22rem)]">
          <SequenceGrid />
          <SidePanes />
        </div>
      )}
    </div>
  )
}

/**
 * The sequencer's settings and the voices' in one column, a tab each, for a
 * window too narrow to give them a column apiece.
 */
const SidePanes: FC = () => {
  const [pane, setPane] = useSidePane()
  const localized = useLocalization()
  const names: Record<SidePane, string> = {
    sequencer: localized["sequencer-panel"],
    voices: localized["sequencer-voices"],
  }

  return (
    <div className="flex min-h-0 flex-col border-l border-divider">
      <div
        role="tablist"
        aria-label={localized["sequencer-settings-panes"]}
        className="flex flex-none border-b border-divider"
      >
        {PANES.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={pane === name}
            className={cn(
              "h-12 flex-1 border-b-[0.15rem] text-title font-semibold hover:bg-highlight",
              pane === name
                ? "border-theme text-fg"
                : "border-transparent text-fg-secondary",
            )}
            onClick={() => setPane(name)}
          >
            {names[name]}
          </button>
        ))}
      </div>
      {pane === "sequencer" ? (
        <SequencerPanel header={false} className="min-h-0 flex-1" />
      ) : (
        <VoicePanel header={false} className="min-h-0 flex-1" />
      )}
    </div>
  )
}
