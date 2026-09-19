import { createDemoPatch, PatchJSON } from "@midiseq/core"
import { makeObservable, observable } from "mobx"

// Holds the patch. It starts as the demo patch until editing and files land.
export class SequencerStore {
  patch: PatchJSON = createDemoPatch()

  constructor() {
    makeObservable(this, {
      patch: observable.ref,
    })
  }
}
