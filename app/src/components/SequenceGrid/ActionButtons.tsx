import styled from "@emotion/styled"
import { EngineActions } from "@midiseq/core"
import { FC, useEffect } from "react"
import { useActions, useLatchActions } from "../../hooks/useActions"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { Toggle } from "../ui/Toggle"

const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--color-divider);
`

const ActionButton = styled.button`
  min-width: 5rem;
  height: 2rem;
  border: none;
  border-radius: 1rem;
  background: var(--color-background-secondary);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  touch-action: none;

  &:hover {
    background: var(--color-highlight);
  }

  &[data-held="true"] {
    background: var(--color-theme);
    color: var(--color-on-surface);
  }
`

// a div, not a label: a label wrapping the switch would double-fire clicks
const Latch = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
`

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
    <Bar>
      {ACTIONS.map(({ action }) => (
        <ActionButton
          key={action}
          type="button"
          data-held={actions[action]}
          {...held(action)}
        >
          <Localized name={`sequencer-action-${action}`} />
        </ActionButton>
      ))}
      <Latch>
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
      </Latch>
    </Bar>
  )
}
