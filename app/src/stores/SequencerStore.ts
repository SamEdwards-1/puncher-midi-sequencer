import { createDemoPatch, PatchJSON, withPatchName } from "@midiseq/core"
import { makeObservable, observable } from "mobx"

export class SequencerStore {
  // the demo under a name of its own, as any new patch gets
  patch: PatchJSON = withPatchName({ ...createDemoPatch(), name: "" })
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
