import { ActionTarget, EngineActions } from "@midiseq/core"
import type { MdiReactIconComponentType } from "mdi-react"
import FlipHorizontalIcon from "mdi-react/FlipHorizontalIcon"
import PauseIcon from "mdi-react/PauseIcon"
import SwapVerticalIcon from "mdi-react/SwapVerticalIcon"
import SyncIcon from "mdi-react/SyncIcon"
import { FC, PointerEvent, useEffect } from "react"
import { useActions, useLatchActions } from "../../hooks/useActions"
import { useSelectedVoice } from "../../hooks/useSequencerView"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { targetKey, useShownModulation } from "../Modulation/ModulatedField"
import { ModulationButton } from "../Modulation/ModulationButton"
import { cn } from "../ui/cn"
import { GUTTER_RIGHT } from "../ui/Panel"
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
  { action: "hold", key: "KeyH", icon: PauseIcon },
  { action: "sync", key: "KeyY", icon: SyncIcon },
  { action: "flip", key: "KeyF", icon: FlipHorizontalIcon },
  { action: "transpose", key: "KeyT", icon: SwapVerticalIcon },
]

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)

// On while held or latched, like a key down. While a step's envelope has
// the action, on or off in the envelopes' colour, as a field showing a
// step's value is.
const lit = (on: boolean, live: boolean) =>
  live
    ? on
      ? "bg-envelope text-on-surface"
      : "bg-background-secondary text-envelope hover:bg-highlight"
    : on
      ? "bg-theme text-on-surface"
      : "bg-background-secondary text-fg hover:bg-highlight"

/**
 * An action as its button shows it, and what a press does: holds it while
 * the button is down, or with Latch on, turns it on or off. While the
 * sequence plays a step whose envelope has the action — Sync, the selected
 * voice's — the button shows it as the step has it, until it is pointed at
 * or pressed, when it shows the button's own again. Not while it has the
 * focus, which a button keeps after a click.
 */
const useAction = (action: Action) => {
  const { actions, setAction, toggleAction } = useActions()
  const [latch] = useLatchActions()
  const [voice] = useSelectedVoice()
  const target: ActionTarget =
    action === "sync"
      ? { kind: "action", setting: "sync", voice }
      : { kind: "action", setting: action }
  const { showing, control } = useShownModulation(target)
  const held = actions[action]
  return {
    target,
    held,
    live: showing !== undefined,
    className: lit(
      showing === undefined ? held : showing.value === true,
      showing !== undefined,
    ),
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        control.onPointerDown?.(event)
        if (latch) {
          toggleAction(action)
        } else {
          setAction(action, true)
        }
      },
      onPointerUp: () => !latch && setAction(action, false),
      onPointerLeave: () => !latch && setAction(action, false),
      onBlur: () => !latch && setAction(action, false),
      onMouseEnter: control.onMouseEnter,
      onMouseLeave: control.onMouseLeave,
    },
  }
}

/**
 * An action's button in the row under the grid, with the gear that opens
 * its modulation at its corner, showing while the button is hovered. The
 * button is its own label.
 */
const ActionButton: FC<{ action: Action }> = ({ action }) => {
  const { target, held, live, className, handlers } = useAction(action)
  const hint = useLocalization()[`sequencer-action-${action}-hint`]
  return (
    <span className="group/field relative flex">
      <button
        type="button"
        title={hint}
        data-field-label
        data-held={held}
        data-live={live}
        className={cn(ACTION_BUTTON, className)}
        {...handlers}
      >
        <Localized name={`sequencer-action-${action}`} />
      </button>
      {/* Sync's is the selected voice's, and another voice's is another
          gear, so one left open doesn't carry over */}
      <ModulationButton
        key={targetKey(target)}
        target={target}
        className="absolute -top-2 -right-2 bg-background"
      />
    </span>
  )
}

export const ActionButtons: FC = () => {
  const { setAction, toggleAction } = useActions()
  const [latch] = useLatchActions()

  // H, Y, F and S hold an action for as long as the key is down
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
    <div
      data-action-buttons
      className={cn(
        "flex items-center justify-center gap-2 border-t border-divider pl-4",
        GUTTER_RIGHT,
        "py-3",
      )}
    >
      {ACTIONS.map(({ action }) => (
        <ActionButton key={action} action={action} />
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
    <div
      className="ml-2 flex items-center gap-[0.4rem] text-small font-normal text-fg-secondary"
      title={localized["sequencer-action-latch-hint"]}
    >
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

// an action as an icon, for the title bar: no gear there
const ActionIcon: FC<{
  action: Action
  icon: MdiReactIconComponentType
}> = ({ action, icon: Icon }) => {
  const { held, live, className, handlers } = useAction(action)
  const localized = useLocalization()
  return (
    <button
      type="button"
      aria-label={localized[`sequencer-action-${action}`]}
      title={localized[`sequencer-action-${action}-hint`]}
      data-held={held}
      data-live={live}
      className={cn(ACTION_ICON, className)}
      {...handlers}
    >
      <Icon size={16} />
    </button>
  )
}

/**
 * The same actions as icons, and Latch, for the grid's title bar while the
 * buttons are scrolled away under the grid. They drop into view when
 * `shown`, and are out of reach, to the mouse, keyboard and screen readers,
 * when not.
 */
export const ActionIcons: FC<{ shown: boolean }> = ({ shown }) => (
  <div
    data-action-icons
    aria-hidden={!shown}
    inert={!shown}
    className={cn(
      "flex items-center gap-1 transition-[translate,opacity] duration-200 ease-out",
      shown ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0",
    )}
  >
    {ACTIONS.map(({ action, icon }) => (
      <ActionIcon key={action} action={action} icon={icon} />
    ))}
    <Latch />
  </div>
)
