import { FC, useEffect, useLayoutEffect, useRef } from "react"
import { useMobxGetter } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { Plot, toX } from "./envelopeGeometry"

// the flag atop the line, this many pixels across
const CAP = 9

/**
 * Where the step is as it sounds — played in the sequence, or clicked and
 * auditioned — as a line down the graph that crosses it in time with the
 * sound. It is yellow, a colour nothing else on the graph uses, over a halo
 * of the background so it reads across notes and the envelope alike.
 *
 * It moves every frame, set on the element rather than rendered, and only
 * while something sounds; the step not sounding, or sounding outside the
 * stretch zoomed in on, it is hidden.
 */
export const Playhead: FC<{ step: number; plot: Plot }> = ({ step, plot }) => {
  const { player } = useStores()
  // each wakes the loop: playing starts, or a click sounds a step
  const isPlaying = useMobxGetter(player, "isPlaying")
  const preview = useMobxGetter(player, "preview")
  const head = useRef<SVGGElement>(null)
  // the latest plot, read each frame, so a resize or zoom never restarts it
  const latest = useRef(plot)
  useLayoutEffect(() => {
    latest.current = plot
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: isPlaying and preview aren't read, but start the loop again
  useEffect(() => {
    const element = head.current
    if (element === null) {
      return
    }
    let frame = 0
    const draw = () => {
      const time = player.playhead(step)
      const x = time === null ? null : toX(latest.current, time)
      if (x === null || x < 0 || x > latest.current.width) {
        element.setAttribute("visibility", "hidden")
        element.removeAttribute("data-time")
      } else {
        element.setAttribute("visibility", "visible")
        element.setAttribute("transform", `translate(${x} 0)`)
        element.setAttribute("data-time", String(time))
      }
      if (player.sounding()) {
        frame = requestAnimationFrame(draw)
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [player, step, isPlaying, preview])

  return (
    <g
      ref={head}
      data-envelope-playhead
      visibility="hidden"
      pointerEvents="none"
    >
      <line
        y1={0}
        y2={plot.height}
        stroke="var(--midiseq-editor-background)"
        strokeOpacity={0.8}
        strokeWidth={4}
      />
      <line
        y1={0}
        y2={plot.height}
        stroke="var(--midiseq-yellow)"
        strokeWidth={1.5}
      />
      <path
        d={`M ${-CAP / 2} 0 H ${CAP / 2} L 0 ${CAP * 0.6} Z`}
        fill="var(--midiseq-yellow)"
        stroke="var(--midiseq-editor-background)"
        strokeWidth={1}
      />
    </g>
  )
}
