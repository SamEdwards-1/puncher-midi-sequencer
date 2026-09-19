import { SequencerStore } from "./SequencerStore"

export default class RootStore {
  readonly sequencerStore = new SequencerStore()
}
