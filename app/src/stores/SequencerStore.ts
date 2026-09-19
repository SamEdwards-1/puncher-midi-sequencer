import { makeObservable, observable } from "mobx"

// Holds the patch and file state. Only the name exists until the core
// entities land in milestone 1.
export class SequencerStore {
  name = ""

  constructor() {
    makeObservable(this, {
      name: observable,
    })
  }
}
