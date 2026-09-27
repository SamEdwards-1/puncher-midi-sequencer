import { EngineActions } from "@midiseq/core"
import type { MdiReactIconComponentType } from "mdi-react"
import FlipHorizontalIcon from "mdi-react/FlipHorizontalIcon"
import PauseIcon from "mdi-react/PauseIcon"
import SwapVerticalIcon from "mdi-react/SwapVerticalIcon"
import SyncIcon from "mdi-react/SyncIcon"
import { FC, useEffect } from "react"
import { useActions, useLatchActions } from "../../hooks/useActions"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { cn } from "../ui/cn"
import { Toggle } from "../ui/Toggle"

const ACTION_BUTTON = "h-8 min-w-20 touch-none rounded-2xl text-body"

const ACTION_ICON =
  "flex h-7 w-7 touch-none items-center justify-center rounded-full"

type Action = keyof EngineActions

const ACTIONS: {
  action: Action
  key: string
  icon: MdiReactIconComponentType
}[] = [
  { action: "hang", key: "KeyH", icon: PauseIcon },
  { action: "bump", key: "KeyB", icon: SyncIcon },
  { action: "flip", key: "KeyF", icon: FlipHorizontalIcon },
  { action: "shift", key: "KeyS", icon: SwapVerticalIcon },
]

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)

// on while held or latched, like a key down
const lit = (on: boolean) =>
  on
    ? "bg-theme text-on-surface"
    : "bg-background-secondary text-fg hover:bg-highlight"

/**
 * The actions, and what a press does to one: holds it while the button is
 * down, or with Latch on, turns it on or off.
 */
const useHold = () => {
  const { actions, setAction, toggleAction } = useActions()
  const [latch] = useLatchActions()
  const hold = (action: Action) => ({
    onPointerDown: () =>
      latch ? toggleAction(action) : setAction(action, true),
    onPointerUp: () => !latch && setAction(action, false),
    onPointerLeave: () => !latch && setAction(action, false),
    onBlur: () => !latch && setAction(action, false),
  })
  return { actions, hold }
}

export const ActionButtons: FC = () => {
  const { setAction, toggleAction } = useActions()
  const { actions, hold } = useHold()
  const [latch] = useLatchActions()

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

  return (
    <div className="flex items-center justify-center gap-2 border-t border-divider px-4 py-3">
      {ACTIONS.map(({ action }) => (
        <button
          key={action}
          type="button"
          data-held={actions[action]}
          className={cn(ACTION_BUTTON, lit(actions[action]))}
          {...hold(action)}
        >
          <Localized name={`sequencer-action-${action}`} />
        </button>
      ))}
      <Latch />
    </div>
  )
}

const Latch: FC = () => {
  const { setAction } = useActions()
  const [latch, setLatch] = useLatchActions()
  const localized = useLocalization()

  return (
    // a div, not a label: a label wrapping the switch would double-fire
    // clicks
    <div className="ml-2 flex items-center gap-[0.4rem] text-small font-normal text-fg-secondary">
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
  )
}

/**
 * The same actions as icons, and Latch, for the grid's title bar while the
 * buttons are scrolled away under the grid. They drop into view when
 * `shown`, and are out of reach, to the mouse, keyboard and screen readers,
 * when not.
 */
export const ActionIcons: FC<{ shown: boolean }> = ({ shown }) => {
  const { actions, hold } = useHold()
  const localized = useLocalization()

  return (
    <div
      data-action-icons
      aria-hidden={!shown}
      inert={!shown}
      className={cn(
        "flex items-center gap-1 transition-[translate,opacity] duration-200 ease-out",
        shown ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0",
      )}
    >
      {ACTIONS.map(({ action, icon: Icon }) => {
        const name = localized[`sequencer-action-${action}`]
        return (
          <button
            key={action}
            type="button"
            aria-label={name}
            title={name}
            data-held={actions[action]}
            className={cn(ACTION_ICON, lit(actions[action]))}
            {...hold(action)}
          >
            <Icon size={16} />
          </button>
        )
      })}
      <Latch />
    </div>
  )
}
