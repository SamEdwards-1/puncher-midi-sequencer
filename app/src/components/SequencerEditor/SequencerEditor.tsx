import { FC } from "react"
import { SequenceGrid } from "../SequenceGrid/SequenceGrid"
import { SequencerPanel } from "../SequencerPanel/SequencerPanel"
import { TopBar } from "../TopBar/TopBar"
import { VoicePanel } from "../VoicePanel/VoicePanel"

export const SequencerEditor: FC = () => (
  <div className="flex min-h-0 grow flex-col bg-background">
    <TopBar />
    <div className="grid min-h-0 grow grid-cols-[minmax(16rem,20rem)_1fr_minmax(18rem,22rem)]">
      <SequencerPanel />
      <SequenceGrid />
      <VoicePanel />
    </div>
  </div>
)
