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
    get inputName() {
      return useMobxGetter(midiDeviceStore, "inputName")
    },
    get receiveChannel() {
      return useMobxGetter(midiDeviceStore, "receiveChannel")
    },
    get connectedInputNames() {
      return useMobxGetter(midiDeviceStore, "connectedInputNames")
    },
    setInputName: midiDeviceStore.setInputName,
    setReceiveChannel: midiDeviceStore.setReceiveChannel,
    setOutputName: midiDeviceStore.setOutputName,
    requestMIDIAccess: midiDeviceStore.requestMIDIAccess,
  }
}
