import {
  CC_NAMES,
  choiceIndex,
  defaultModulation,
  ModulationJSON,
  ModulationTarget,
  modulationChoices,
  modulationCount,
  modulationOf,
  nextModulationCC,
  sameTarget,
} from "@midiseq/core"
import CogIcon from "mdi-react/CogIcon"
import CogOutlineIcon from "mdi-react/CogOutlineIcon"
import {
  FC,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useShowModulation } from "../../actions/modulation"
import { usePatchEditor } from "../../actions/patch"
import { usePatch, usePatchSelector } from "../../hooks/usePatch"
import { useSelectedStep } from "../../hooks/useSequencerView"
import {
  Localized,
  useFormat,
  useLocalization,
} from "../../localize/useLocalization"
import { trackModulationSet } from "../../services/analytics"
import { TONICS } from "../../theory/scales"
import { Button } from "../ui/Button"
import { cn } from "../ui/cn"
import { Select } from "../ui/Select"
import { Stepper } from "../ui/Stepper"
import { modulationTargetLabel, modulationValueLabel } from "./labels"

const GEAR =
  "flex h-5 w-5 items-center justify-center rounded-sm transition-opacity duration-100 hover:bg-highlight focus-visible:outline-1 focus-visible:outline-theme"
// Out of sight until its field's label is hovered, or it is itself, or it
// has the keyboard's focus; where nothing can hover, always there.
const UNTIL_HOVERED =
  "opacity-0 group-has-[[data-field-label]:hover]/field:opacity-100 hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"

// digits are all a typed CC number means; the stepper clamps it
const parseNumber = (text: string) => {
  const number = Number.parseInt(text.replace(/[^0-9]/g, ""), 10)
  return Number.isFinite(number) ? number : null
}

/**
 * The gear beside a setting's label, which opens its modulation: a CC that
 * drives the setting from the steps' envelopes. It shows while the label is
 * hovered, and stays, in the envelopes' colour, while the setting is
 * modulated. `className` places it.
 */
export const ModulationButton: FC<{
  target: ModulationTarget
  className?: string
}> = ({ target, className }) => {
  const localized = useLocalization()
  const format = useFormat()
  // the setting's own modulation, which most edits leave as it was; a
  // target comes new with each render, so it goes by what it says
  const modulation = usePatchSelector(
    (patch) => modulationOf(patch, target),
    [JSON.stringify(target)],
  )
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const name = format("sequencer-modulation-settings", {
    target: modulationTargetLabel(target, localized),
  })

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          modulation === undefined
            ? name
            : format("sequencer-modulation-by", { cc: modulation.cc })
        }
        data-modulated={modulation !== undefined}
        className={cn(
          GEAR,
          modulation !== undefined
            ? "text-envelope"
            : "text-fg-tertiary hover:text-fg",
          modulation !== undefined || open ? "opacity-100" : UNTIL_HOVERED,
          className,
        )}
        onClick={() => setOpen(!open)}
      >
        {modulation === undefined ? (
          <CogOutlineIcon size={14} />
        ) : (
          <CogIcon size={14} />
        )}
      </button>
      {open && (
        <ModulationPopover
          target={target}
          anchor={button}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/**
 * A setting's modulation: its CC, offered as the next undefined one nothing
 * uses, and the range of the setting's values the CC's 0 to 127 run across.
 * Once the setting is modulated, changes land as they are made.
 */
const ModulationPopover: FC<{
  target: ModulationTarget
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
}> = ({ target, anchor, onClose }) => {
  const patch = usePatch()
  const localized = useLocalization()
  const format = useFormat()
  const { editModulation, removeModulation } = usePatchEditor()
  const showModulation = useShowModulation()
  const [step] = useSelectedStep()
  const popup = useRef<HTMLDivElement>(null)
  // the changes made while it is open count as one edit
  const editTracked = useRef(false)
  const existing = modulationOf(patch, target)
  // What isn't in the patch: a modulation still to be given, or a change to
  // one that can't land, its CC being another's. Until there is one, what
  // a new modulation would be, which follows the patch: a modulation taken
  // away is offered again as it would start.
  const [draft, setDraft] = useState<ModulationJSON | null>(null)
  const fallback = defaultModulation(patch, target, nextModulationCC(patch))
  const shown = { ...(draft ?? existing ?? fallback), target }
  const clash = patch.modulations.find(
    (modulation) =>
      modulation.cc === shown.cc && !sameTarget(modulation.target, target),
  )
  // the steps sending the setting's CC, which it modulates on, or for a CC
  // still to be given, the steps that would start modulating too
  const listed = existing?.cc ?? shown.cc
  const onSteps = patch.steps.flatMap((each, index) =>
    each.envelopes.some(({ cc }) => cc === listed) ? [index] : [],
  )

  const change = (next: ModulationJSON) => {
    const taken = patch.modulations.some(
      (modulation) =>
        modulation.cc === next.cc && !sameTarget(modulation.target, target),
    )
    if (existing === undefined || taken) {
      setDraft(next)
      return
    }
    setDraft(null)
    // a run of steps on the CC number is one edit
    editModulation(next, `modulation-${JSON.stringify(target)}`)
    if (!editTracked.current) {
      editTracked.current = true
      trackModulationSet(next, "edit", "editor")
    }
  }

  // below the gear, nudged back inside the window once its size is known
  const [at, setAt] = useState({ x: 0, y: 0 })
  useLayoutEffect(() => {
    const element = popup.current
    const gear = anchor.current?.getBoundingClientRect()
    if (element === null || gear === undefined) {
      return
    }
    const { width, height } = element.getBoundingClientRect()
    const margin = 8
    setAt({
      x: Math.min(
        Math.max(margin, gear.left),
        window.innerWidth - width - margin,
      ),
      y: Math.min(
        Math.max(margin, gear.bottom + 4),
        window.innerHeight - height - margin,
      ),
    })
  }, [anchor])

  // closes on a click elsewhere — the gear toggles it itself — or Escape
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !popup.current?.contains(target) &&
        !anchor.current?.contains(target)
      ) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [anchor, onClose])

  const title = modulationTargetLabel(target, localized)
  const count = modulationCount(shown)

  return (
    <div
      ref={popup}
      role="dialog"
      aria-label={format("sequencer-modulation-of", { target: title })}
      data-modulation-popover
      className="fixed z-30 flex w-72 flex-col gap-2 rounded-lg border border-popup-border bg-background-secondary px-3 pt-3 pb-3 text-body text-fg-secondary shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
      style={{ left: at.x, top: at.y }}
    >
      <div className="text-small font-semibold text-fg">
        {title}
        <span className="font-normal text-fg-tertiary">
          {" "}
          · <Localized name="sequencer-modulation" />
        </span>
      </div>

      <div className="grid grid-cols-[3rem_1fr] items-center gap-x-2 gap-y-2">
        <span>
          <Localized name="sequencer-modulation-cc" />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-28 flex-none">
            <Stepper
              label={format("sequencer-modulation-cc-of", { target: title })}
              value={shown.cc}
              min={0}
              max={127}
              parse={parseNumber}
              invalid={clash !== undefined}
              onChange={(cc) => change({ ...shown, cc })}
            />
          </div>
          <span
            className="min-w-0 truncate text-small text-fg-tertiary"
            title={CC_NAMES[shown.cc]}
          >
            {CC_NAMES[shown.cc]}
          </span>
        </div>

        <RangeSelect
          label={localized["sequencer-modulation-from"]}
          target={target}
          value={shown.from}
          onChange={(from) => change({ ...shown, from })}
        />
        <RangeSelect
          label={localized["sequencer-modulation-to"]}
          target={target}
          value={shown.to}
          onChange={(to) => change({ ...shown, to })}
        />
      </div>

      <div className="text-small text-fg-tertiary" data-modulation-count>
        {format("sequencer-modulation-values", { count })} · CC 0–127
      </div>
      {existing !== undefined && (
        <div className="text-small text-fg-tertiary" data-modulation-steps>
          {onSteps.length === 0 ? (
            <Localized name="sequencer-modulation-on-none" />
          ) : (
            format("sequencer-modulation-on", {
              count: onSteps.length,
              steps: onSteps.map((index) => index + 1).join(", "),
            })
          )}
        </div>
      )}
      {clash !== undefined && (
        <div className="text-small text-error" role="alert">
          {format("sequencer-modulation-taken", {
            cc: shown.cc,
            target: modulationTargetLabel(clash.target, localized),
          })}
        </div>
      )}
      {existing === undefined && clash === undefined && onSteps.length > 0 && (
        <div className="text-small text-yellow">
          {format("sequencer-modulation-on-steps", {
            cc: shown.cc,
            count: onSteps.length,
          })}
        </div>
      )}
      <p className="m-0 text-small text-fg-tertiary">
        <Localized
          name={
            target.kind === "action"
              ? "sequencer-modulation-action-hint"
              : "sequencer-modulation-hint"
          }
        />
      </p>

      <div className="flex items-center gap-2 pt-1">
        {existing === undefined ? (
          <Button
            type="button"
            size="sm"
            primary
            disabled={clash !== undefined}
            onClick={() => {
              setDraft(null)
              showModulation(target, shown)
            }}
          >
            <Localized name="sequencer-modulation-assign" />
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => showModulation(target)}
            >
              {format("sequencer-modulation-show", { step: step + 1 })}
            </Button>
            <div className="grow" />
            <Button
              type="button"
              size="sm"
              title={localized["sequencer-modulation-remove-hint"]}
              onClick={() => {
                removeModulation(target)
                onClose()
              }}
            >
              <Localized name="sequencer-modulation-remove" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** One end of a modulation's range, from every value its setting has. */
const RangeSelect: FC<{
  label: string
  target: ModulationTarget
  value: ModulationJSON["from"]
  onChange: (value: ModulationJSON["from"]) => void
}> = ({ label, target, value, onChange }) => {
  const localized = useLocalization()
  const choices = modulationChoices(target)
  const option = (index: number) => (
    <option key={index} value={index}>
      {modulationValueLabel(target, choices[index], localized)}
    </option>
  )
  const indexes = choices.map((_, index) => index)
  return (
    <>
      <span>{label}</span>
      <Select
        aria-label={`${modulationTargetLabel(target, localized)} ${label}`}
        className="min-w-0"
        value={String(Math.max(0, choiceIndex(choices, value)))}
        onChange={(event) => onChange(choices[Number(event.target.value)])}
      >
        {target.setting === "scale" ? (
          // none, then a group of scales for each tonic
          <>
            {option(0)}
            {TONICS.map((tonic, pitch) => (
              <optgroup key={tonic} label={tonic}>
                {indexes
                  .filter((index) => {
                    const choice = choices[index]
                    return (
                      typeof choice === "object" &&
                      choice !== null &&
                      choice.tonic === pitch
                    )
                  })
                  .map(option)}
              </optgroup>
            ))}
          </>
        ) : (
          indexes.map(option)
        )}
      </Select>
    </>
  )
}
