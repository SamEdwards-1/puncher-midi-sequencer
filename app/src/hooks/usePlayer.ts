import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

export function usePlayer() {
  const { player } = useStores()

  return {
    get isPlaying() {
      return useMobxGetter(player, "isPlaying")
    },
    get isPaused() {
      return useMobxGetter(player, "isPaused")
    },
    get position() {
      return useMobxGetter(player, "position")
    },
    play: player.play,
    pause: player.pause,
    stop: player.stop,
    panic: player.panic,
  }
}
