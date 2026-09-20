import { createDemoPatch, PatchJSON } from "@midiseq/core"
import { makeObservable, observable } from "mobx"

export class SequencerStore {
  patch: PatchJSON = createDemoPatch()
  // the file this patch came from, and whether it has changed since
  fileName: string | null = null
  isSaved = true

  constructor() {
    makeObservable(this, {
      patch: observable.ref,
      fileName: observable,
      isSaved: observable,
    })
  }
}
