import { EngineActions } from "@midiseq/core"
import { FC, useEffect } from "react"
import { useActions, useLatchActions } from "../../hooks/useActions"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { cn } from "../ui/cn"
import { Toggle } from "../ui/Toggle"

const ACTION_BUTTON = "h-8 min-w-20 touch-none rounded-2xl text-body"

const ACTIONS: { action: keyof EngineActions; key: string }[] = [
  { action: "hang", key: "KeyH" },
  { action: "bump", key: "KeyB" },
  { action: "flip", key: "KeyF" },
  { action: "shift", key: "KeyS" },
]

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)

export const ActionButtons: FC = () => {
  const { actions, setAction, toggleAction } = useActions()
  const [latch, setLatch] = useLatchActions()
  const localized = useLocalization()

  // H, B, F and S hold an action for as long as the key is down
  useEffect(() => {
    const match = (event: KeyboardEvent) =>
      event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)
        ? undefined
        : ACTIONS.find(({ key }) => key === event.code)

    const onKeyDown = (event: KeyboardEvent) => {
      const found = match(event)
      if (found === undefined || event.repeat) {
        return
      }
      event.preventDefault()
      if (latch) {
        toggleAction(found.action)
      } else {
        setAction(found.action, true)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const found = match(event)
      if (found !== undefined && !latch) {
        setAction(found.action, false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [latch, setAction, toggleAction])

  const held = (action: keyof EngineActions) => ({
    onPointerDown: () =>
      latch ? toggleAction(action) : setAction(action, true),
    onPointerUp: () => !latch && setAction(action, false),
    onPointerLeave: () => !latch && setAction(action, false),
    onBlur: () => !latch && setAction(action, false),
  })

  return (
    <div className="flex items-center justify-center gap-2 border-t border-divider px-4 py-3">
      {ACTIONS.map(({ action }) => (
        <button
          key={action}
          type="button"
          data-held={actions[action]}
          className={cn(
            ACTION_BUTTON,
            actions[action]
              ? "bg-theme text-on-surface"
              : "bg-background-secondary text-fg hover:bg-highlight",
          )}
          {...held(action)}
        >
          <Localized name={`sequencer-action-${action}`} />
        </button>
      ))}
      {/* a div, not a label: a label wrapping the switch would double-fire
          clicks */}
      <div className="ml-2 flex items-center gap-[0.4rem] text-small text-fg-secondary">
        <Toggle
          label={localized["sequencer-action-latch"]}
          checked={latch}
          onChange={(next) => {
            setLatch(next)
            // leaving latch drops anything still on
            if (!next) {
              for (const { action } of ACTIONS) {
                setAction(action, false)
              }
            }
          }}
        />
        <Localized name="sequencer-action-latch" />
      </div>
    </div>
  )
}
