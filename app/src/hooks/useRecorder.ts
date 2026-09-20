import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

export function useRecorder() {
  const { recorder } = useStores()

  return {
    get isRecording() {
      return useMobxGetter(recorder, "isRecording")
    },
    get target() {
      return useMobxGetter(recorder, "target")
    },
    setTarget: recorder.setTarget,
    toggleRecording: recorder.toggleRecording,
  }
}
