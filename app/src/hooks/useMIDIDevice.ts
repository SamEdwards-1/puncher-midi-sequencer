import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

export function useMIDIDevice() {
  const { midiDeviceStore } = useStores()

  return {
    isSupported: midiDeviceStore.isSupported,
    get isLoading() {
      return useMobxGetter(midiDeviceStore, "isLoading")
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
    setOutputName: midiDeviceStore.setOutputName,
    requestMIDIAccess: midiDeviceStore.requestMIDIAccess,
  }
}
