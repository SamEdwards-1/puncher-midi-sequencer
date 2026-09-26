import { AutoSaveService } from "../services/AutoSaveService"
import { ClockFollower } from "../services/ClockFollower"
import { FileService } from "../services/FileService"
import { MIDIInput } from "../services/MIDIInput"
import { MIDIRecorder } from "../services/MIDIRecorder"
import { OutputRouter } from "../services/OutputRouter"
import { SequencerPlayer } from "../services/SequencerPlayer"
import { Ticker } from "../services/Ticker"
import { ExportSettingsStore } from "./ExportSettingsStore"
import { HistoryStore } from "./HistoryStore"
import { ImportSettingsStore } from "./ImportSettingsStore"
import { MIDIDeviceStore, RequestMIDIAccess } from "./MIDIDeviceStore"
import { PlaybackSettingsStore } from "./PlaybackSettingsStore"
import { registerReactions } from "./reactions"
import { SequencerStore } from "./SequencerStore"
import { SynthStore } from "./SynthStore"

export interface RootStoreOptions {
  requestMIDIAccess?: RequestMIDIAccess | null
  storage?: Storage | null
  ticker?: Ticker
  now?: () => number
  fileService?: FileService
  synthStore?: SynthStore
  autoSave?: AutoSaveService
}

export default class RootStore {
  readonly sequencerStore = new SequencerStore()
  readonly history = new HistoryStore(this.sequencerStore)
  readonly outputRouter = new OutputRouter()
  readonly midiInput = new MIDIInput()
  readonly clockFollower: ClockFollower
  readonly midiDeviceStore: MIDIDeviceStore
  readonly playbackSettings: PlaybackSettingsStore
  readonly exportSettings: ExportSettingsStore
  readonly importSettings: ImportSettingsStore
  readonly recorder: MIDIRecorder
  readonly player: SequencerPlayer
  readonly synthStore: SynthStore
  readonly fileService: FileService
  readonly autoSave: AutoSaveService

  constructor(options: RootStoreOptions = {}) {
    this.midiDeviceStore = new MIDIDeviceStore(
      options.requestMIDIAccess,
      options.storage,
    )
    this.playbackSettings = new PlaybackSettingsStore(options.storage)
    this.exportSettings = new ExportSettingsStore(options.storage)
    this.importSettings = new ImportSettingsStore(options.storage)
    this.recorder = new MIDIRecorder(
      this.sequencerStore,
      this.midiInput,
      // a whole take undoes in one go
      () => this.history.push(),
      // assigned below; read only once a CC arrives
      () => this.player.stepProgress(),
    )
    this.player = new SequencerPlayer(
      this.sequencerStore.patch,
      this.outputRouter,
      { ticker: options.ticker, now: options.now },
    )
    this.clockFollower = new ClockFollower(options.now)
    this.synthStore = options.synthStore ?? new SynthStore()
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
