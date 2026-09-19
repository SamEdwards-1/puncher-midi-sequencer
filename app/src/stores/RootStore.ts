import { OutputRouter } from "../services/OutputRouter"
import { SequencerPlayer } from "../services/SequencerPlayer"
import { Ticker } from "../services/Ticker"
import { MIDIDeviceStore, RequestMIDIAccess } from "./MIDIDeviceStore"
import { registerReactions } from "./reactions"
import { SequencerStore } from "./SequencerStore"

export interface RootStoreOptions {
  requestMIDIAccess?: RequestMIDIAccess | null
  storage?: Storage | null
  ticker?: Ticker
  now?: () => number
}

export default class RootStore {
  readonly sequencerStore = new SequencerStore()
  readonly outputRouter = new OutputRouter()
  readonly midiDeviceStore: MIDIDeviceStore
  readonly player: SequencerPlayer

  constructor(options: RootStoreOptions = {}) {
    this.midiDeviceStore = new MIDIDeviceStore(
      options.requestMIDIAccess,
      options.storage,
    )
    this.player = new SequencerPlayer(
      this.sequencerStore.patch,
      this.outputRouter,
      { ticker: options.ticker, now: options.now },
    )
    registerReactions(this)
  }

  init() {
    void this.midiDeviceStore.requestMIDIAccess()
  }
}
