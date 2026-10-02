import { FC, useEffect, useRef } from "react"
import { useStores } from "../../hooks/useStores"

// how much of the ring the arc covers, in degrees
const ARC = 45

/**
 * A short arc riding the playing step's ring, once round in the time the
 * step lasts: from the top, clockwise, back to the top as the next step
 * takes over. Round after round while Hold keeps the step. A step a click
 * auditions shows it just the same.
 *
 * It sits over the step's 2px border, in the step's own text colour, and
 * turns every frame, set on the element rather than rendered. The step
 * shows it only while it is the one playing, so it goes when the step does.
 */
export const StepArc: FC = () => {
  const { player } = useStores()
  const arc = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const element = arc.current
    if (element === null) {
      return
    }
    let frame = 0
    const draw = () => {
      // the stored step the sequence plays, which differs from the one
      // shown while Flip is held; else the one a click is auditioning
      const step = player.step ?? player.preview?.step ?? null
      const progress = step === null ? null : player.playhead(step)
      // between a step ending and the next being shown it keeps where it got
      if (progress !== null) {
        element.style.transform = `rotate(${progress * 360}deg)`
        element.style.visibility = "visible"
        element.dataset.progress = String(progress)
      }
      if (player.sounding()) {
        frame = requestAnimationFrame(draw)
      }
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [player])

  return (
    <svg
      ref={arc}
      aria-hidden="true"
      data-step-arc
      className="pointer-events-none absolute top-[-2px] left-[-2px] h-[calc(100%+4px)] w-[calc(100%+4px)] overflow-visible"
      style={{ visibility: "hidden" }}
    >
      {/* Along the border's middle. A circle's stroke starts at three
          o'clock, so it is turned back a quarter and half the arc, which
          centres the arc on the top at the step's start. */}
      <circle
        cx="50%"
        cy="50%"
        style={{ r: "calc(50% - 1px)" }}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        pathLength={360}
        strokeDasharray={`${ARC} ${360 - ARC}`}
        strokeDashoffset={90 + ARC / 2}
      />
    </svg>
  )
}
