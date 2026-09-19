import { useMobxGetter } from "./useMobxSelector"
import { useStores } from "./useStores"

export function usePlayer() {
  const { player } = useStores()

  return {
    get isPlaying() {
      return useMobxGetter(player, "isPlaying")
    },
    get position() {
      return useMobxGetter(player, "position")
    },
    play: player.play,
    stop: player.stop,
    panic: player.panic,
  }
}
