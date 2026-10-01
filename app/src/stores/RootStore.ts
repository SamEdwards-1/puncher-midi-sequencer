import { StepPreviews, withPatchName } from "@midiseq/core"
import { AudioRenderer, workerAudioRenderer } from "../services/AudioRenderer"
import { AutoSaveService } from "../services/AutoSaveService"
import { ClockFollower } from "../services/ClockFollower"
import { FileService } from "../services/FileService"
import { MIDIInput } from "../services/MIDIInput"
import { MIDIRecorder } from "../services/MIDIRecorder"
import { OutputRouter } from "../services/OutputRouter"
import { SequencerPlayer } from "../services/SequencerPlayer"
import { Ticker } from "../services/Ticker"
import { AudioExportSettingsStore } from "./AudioExportSettingsStore"
import { ExportSettingsStore } from "./ExportSettingsStore"
import { HistoryStore } from "./HistoryStore"
import { ImportSettingsStore } from "./ImportSettingsStore"
import { MIDIDeviceStore, RequestMIDIAccess } from "./MIDIDeviceStore"
import { PlaybackSettingsStore } from "./PlaybackSettingsStore"
import { RecentFilesStore } from "./RecentFilesStore"
import { registerReactions } from "./reactions"
import { SequencerStore } from "./SequencerStore"
import { SettingsTabStore } from "./SettingsTabStore"
import { SoundFontStore } from "./SoundFontStore"
import { SynthStore } from "./SynthStore"

/**
 * What can be handed in rather than made. Whatever is handed in belongs to
 * whoever made it, and outlives the root store: disposing the store only
 * undoes what the store itself did with it, such as starting the autosave,
 * and never disposes it. What the store makes, it disposes.
 */
export interface RootStoreOptions {
  requestMIDIAccess?: RequestMIDIAccess | null
  storage?: Storage | null
  ticker?: Ticker
  now?: () => number
  fileService?: FileService
  recentFiles?: RecentFilesStore
  synthStore?: SynthStore
  soundFonts?: SoundFontStore
  autoSave?: AutoSaveService
  audioRenderer?: AudioRenderer
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
  readonly audioExportSettings: AudioExportSettingsStore
  readonly importSettings: ImportSettingsStore
  readonly settingsTab: SettingsTabStore
  readonly recorder: MIDIRecorder
  readonly player: SequencerPlayer
  // what the step in the editor plays, shared by the panels showing it
  readonly stepPreviews = new StepPreviews()
  readonly synthStore: SynthStore
  readonly soundFonts: SoundFontStore
  readonly fileService: FileService
  readonly recentFiles: RecentFilesStore
  readonly autoSave: AutoSaveService
  readonly audioRenderer: AudioRenderer

  private readonly ownsSynthStore: boolean
  private readonly unregisterReactions: () => void
  // what init started, to stop again
  private stopResumeOnGesture: (() => void) | null = null
  private autoSaveStarted = false
  private disposed = false

  constructor(options: RootStoreOptions = {}) {
    this.midiDeviceStore = new MIDIDeviceStore(
      options.requestMIDIAccess,
      options.storage,
    )
    this.playbackSettings = new PlaybackSettingsStore(options.storage)
    this.exportSettings = new ExportSettingsStore(options.storage)
    this.audioExportSettings = new AudioExportSettingsStore(options.storage)
    this.importSettings = new ImportSettingsStore(options.storage)
    this.settingsTab = new SettingsTabStore(options.storage)
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
    this.ownsSynthStore = options.synthStore === undefined
    this.synthStore = options.synthStore ?? new SynthStore()
    this.soundFonts =
      options.soundFonts ?? new SoundFontStore(undefined, options.storage)
    this.fileService = options.fileService ?? new FileService()
    this.recentFiles = options.recentFiles ?? new RecentFilesStore()
    this.audioRenderer = options.audioRenderer ?? workerAudioRenderer
    this.autoSave =
      options.autoSave ??
      new AutoSaveService(
        () => this.sequencerStore.patch,
        () => this.sequencerStore.isSaved,
        options.storage,
      )
    this.unregisterReactions = registerReactions(this)
  }

  init() {
    void this.midiDeviceStore.connectOnStart()
    void this.soundFonts.init()
    void this.recentFiles.init()
    this.stopResumeOnGesture?.()
    this.stopResumeOnGesture = this.synthStore.resumeOnGesture(window)

    // A patch left behind by a crash or a closed tab comes back as unsaved
    // work, rather than being lost.
    const recovered = this.autoSave.restore()
    if (recovered !== null) {
      this.sequencerStore.patch = withPatchName(recovered)
      this.sequencerStore.isSaved = false
    }
    this.autoSave.start()
    this.autoSaveStarted = true
  }

  /**
   * Takes the app down: the reactions wiring it together stop, anything
   * sounding is silenced, the MIDI ports and the browser's MIDI access are
   * let go, what init started is stopped, and the workers and audio the
   * store made are ended. Disposing again does nothing.
   */
  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.recorder.dispose()
    this.unregisterReactions()
    this.player.dispose()
    this.midiInput.dispose()
    this.midiDeviceStore.dispose()
    this.stopResumeOnGesture?.()
    this.stopResumeOnGesture = null
    if (this.autoSaveStarted) {
      this.autoSave.stop()
    }
    if (this.ownsSynthStore) {
      this.synthStore.dispose()
    }
  }
}
