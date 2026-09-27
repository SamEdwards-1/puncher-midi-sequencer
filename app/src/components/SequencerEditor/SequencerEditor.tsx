import { FC } from "react"
import { useMediaQuery } from "../../hooks/useMediaQuery"
import { SidePane, useSidePane } from "../../hooks/useSequencerView"
import { useLocalization } from "../../localize/useLocalization"
import { SequenceGrid } from "../SequenceGrid/SequenceGrid"
import { SequencerPanel } from "../SequencerPanel/SequencerPanel"
import { TopBar } from "../TopBar/TopBar"
import { cn } from "../ui/cn"
import { VoicePanel } from "../VoicePanel/VoicePanel"

// Narrower than this, the sequencer's settings give up their own column and
// share the voices'; narrower still, everything shares one.
const THREE_COLUMNS = "(min-width: 1200px)"
const TWO_COLUMNS = "(min-width: 876px)"

export const SequencerEditor: FC = () => {
  const three = useMediaQuery(THREE_COLUMNS)
  const two = useMediaQuery(TWO_COLUMNS)

  return (
    <div className="flex min-h-0 grow flex-col bg-background">
      <TopBar />
      {three ? (
        <div className="grid min-h-0 grow grid-cols-[minmax(calc(16rem-25px),calc(20rem-25px))_1fr_minmax(calc(18rem+100px),calc(22rem+100px))]">
          <SequencerPanel />
          <SequenceGrid />
          <VoicePanel />
        </div>
      ) : two ? (
        // the settings on the left, the grid on the right
        <div className="grid min-h-0 grow grid-cols-[minmax(calc(18rem+100px),calc(22rem+100px))_1fr]">
          <Panes panes={["sequencer", "voices"]} className="border-r" />
          <SequenceGrid />
        </div>
      ) : (
        <div className="flex min-h-0 grow flex-col">
          <Panes
            panes={["grid", "voices", "sequencer"]}
            className="min-h-0 flex-1"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Panes that share a column, a tab each: the sequencer's settings and the
 * voices' beside the grid, or, in one column, the grid as well.
 */
const Panes: FC<{ panes: SidePane[]; className?: string }> = ({
  panes,
  className,
}) => {
  const [chosen, setPane] = useSidePane()
  const localized = useLocalization()
  const names: Record<SidePane, string> = {
    grid: localized["sequencer-grid"],
    sequencer: localized["sequencer-panel"],
    voices: localized["sequencer-voices"],
  }
  // the grid's tab, where the grid has a column of its own, is its Voices
  const pane = panes.includes(chosen) ? chosen : "voices"

  return (
    <div className={cn("flex min-h-0 flex-col border-divider", className)}>
      <div
        role="tablist"
        aria-label={localized["sequencer-settings-panes"]}
        className="flex flex-none border-b border-divider"
      >
        {panes.map((name) => (
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
      {pane === "grid" ? (
        <SequenceGrid className="min-h-0 flex-1" />
      ) : pane === "sequencer" ? (
        <SequencerPanel header={false} className="min-h-0 flex-1" />
      ) : (
        <VoicePanel header={false} className="min-h-0 flex-1" />
      )}
    </div>
  )
}
