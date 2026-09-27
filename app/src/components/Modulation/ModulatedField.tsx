import {
  ModulatedSetting,
  ModulationTarget,
  ModulationValue,
} from "@midiseq/core"
import {
  FC,
  HTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { useLiveModulation } from "../../hooks/useLiveModulation"
import { ButtonField, Field } from "../ui/Field"
import { ModulationButton } from "./ModulationButton"

/** A setting's value as its field shows it: its own, or a step's for it. */
export type Shown = <T extends ModulationValue>(own: T) => T

/** A name for a setting of its own, so a gear left open for one isn't another's. */
export const targetKey = (target: ModulationTarget) =>
  [target.kind, "voice" in target ? target.voice : "", target.setting].join("-")

/**
 * What a setting's control shows while the sequence plays: the value a
 * step's envelope has the setting at, where one does — until the control
 * itself is pointed at, pressed or focused, when it shows the setting's own
 * value again, which is the one it changes. `showing` is the step's, or
 * undefined for the setting's own; `control` is what the control's box
 * takes to know what is done to it.
 */
export const useShownModulation = (
  target: ModulationTarget,
): {
  showing: ModulatedSetting | undefined
  control: HTMLAttributes<HTMLElement>
} => {
  const live = useLiveModulation(target)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState(false)
  const control = useRef<HTMLElement | null>(null)

  // a press lasts until it is let go, wherever that is
  useEffect(() => {
    if (!pressed) {
      return
    }
    const release = () => setPressed(false)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", release)
    return () => {
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", release)
    }
  }, [pressed])

  // Focus can go with an element taken out from under it, and nothing says
  // so, so the page is asked whether the control still has it.
  const focusedNow =
    focused && control.current?.contains(document.activeElement) === true

  return {
    showing: hovered || focusedNow || pressed ? undefined : live,
    control: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: (event) => {
        control.current = event.currentTarget
        setFocused(true)
      },
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
        }
      },
      onPointerDown: () => setPressed(true),
    },
  }
}

/**
 * The row of a setting a CC can drive: its label, the gear beside it that
 * opens its modulation, and its control, which shows the value a step's
 * envelope has the setting at as useShownModulation says, in the envelopes'
 * colour. The label and gear leave it be, so the gear can be opened on a
 * field showing its step's value. `children` is given the value to show for
 * the one it has; `buttons` makes the row a ButtonField.
 */
export const ModulatedField: FC<{
  label: string
  target: ModulationTarget
  buttons?: boolean
  children: (shown: Shown) => ReactNode
}> = ({ label, target, buttons = false, children }) => {
  const { showing, control } = useShownModulation(target)
  const shown: Shown = (own) =>
    showing === undefined ? own : (showing.value as typeof own)
  const Row = buttons ? ButtonField : Field

  return (
    <Row
      label={label}
      // another voice's gear is another gear, so one left open doesn't
      // carry over
      aside={<ModulationButton key={targetKey(target)} target={target} />}
      live={showing !== undefined}
      control={control}
    >
      {children(shown)}
    </Row>
  )
}
