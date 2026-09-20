import { AutoSaveService } from "../services/AutoSaveService"
import { FileService } from "../services/FileService"
import { MIDIInput } from "../services/MIDIInput"
import { MIDIRecorder } from "../services/MIDIRecorder"
import { OutputRouter } from "../services/OutputRouter"
import { SequencerPlayer } from "../services/SequencerPlayer"
import { Ticker } from "../services/Ticker"
import { HistoryStore } from "./HistoryStore"
import { MIDIDeviceStore, RequestMIDIAccess } from "./MIDIDeviceStore"
import { registerReactions } from "./reactions"
import { SequencerStore } from "./SequencerStore"

export interface RootStoreOptions {
  requestMIDIAccess?: RequestMIDIAccess | null
  storage?: Storage | null
  ticker?: Ticker
  now?: () => number
  fileService?: FileService
  autoSave?: AutoSaveService
}

export default class RootStore {
  readonly sequencerStore = new SequencerStore()
  readonly history = new HistoryStore(this.sequencerStore)
  readonly outputRouter = new OutputRouter()
  readonly midiInput = new MIDIInput()
  readonly midiDeviceStore: MIDIDeviceStore
  readonly recorder: MIDIRecorder
  readonly player: SequencerPlayer
  readonly fileService: FileService
  readonly autoSave: AutoSaveService

  constructor(options: RootStoreOptions = {}) {
    this.midiDeviceStore = new MIDIDeviceStore(
      options.requestMIDIAccess,
      options.storage,
    )
    this.recorder = new MIDIRecorder(
      this.sequencerStore,
      this.midiInput,
      () => this.midiDeviceStore.receiveChannel,
      // a whole take undoes in one go
      () => this.history.push(),
    )
    this.player = new SequencerPlayer(
      this.sequencerStore.patch,
      this.outputRouter,
      { ticker: options.ticker, now: options.now },
    )
    this.fileService = options.fileService ?? new FileService()
    this.autoSave =
      options.autoSave ??
      new AutoSaveService(
        () => this.sequencerStore.patch,
        () => this.sequencerStore.isSaved,
        options.storage,
      )
    registerReactions(this)
  }

  init() {
    void this.midiDeviceStore.connectOnStart()

    // A patch left behind by a crash or a closed tab comes back as unsaved
    // work, rather than being lost.
    const recovered = this.autoSave.restore()
    if (recovered !== null) {
      this.sequencerStore.patch = recovered
      this.sequencerStore.isSaved = false
    }
    this.autoSave.start()
  }
}
