import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

export function useMIDIDevice() {
  const { midiDeviceStore } = useStores()

  return {
    isSupported: midiDeviceStore.isSupported,
    get isLoading() {
      return useMobxGetter(midiDeviceStore, "isLoading")
    },
    get hasAccess() {
      return useMobxGetter(midiDeviceStore, "hasAccess")
    },
    get permission() {
      return useMobxGetter(midiDeviceStore, "permission")
    },
    get requestError() {
      return useMobxGetter(midiDeviceStore, "requestError")
    },
    get outputNames() {
      return useMobxGetter(midiDeviceStore, "outputNames")
    },
    get connectedOutputNames() {
      return useMobxGetter(midiDeviceStore, "connectedOutputNames")
    },
    get inputNames() {
      return useMobxGetter(midiDeviceStore, "inputNames")
    },
    get connectedInputNames() {
      return useMobxGetter(midiDeviceStore, "connectedInputNames")
    },
    get filter() {
      return useMobxGetter(midiDeviceStore, "filter")
    },
    toggleInput: midiDeviceStore.toggleInput,
    toggleOutput: midiDeviceStore.toggleOutput,
    setVoiceOutput: midiDeviceStore.setVoiceOutput,
    setFilter: midiDeviceStore.setFilter,
    requestMIDIAccess: midiDeviceStore.requestMIDIAccess,
  }
}
