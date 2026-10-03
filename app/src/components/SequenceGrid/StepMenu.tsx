import { FC } from "react"
import { usePatchEditor } from "../../actions/patch"
import { usePatch } from "../../hooks/usePatch"
import { useCopiedStep, useSelectedStep } from "../../hooks/useSequencerView"
import { Localized, useFormat } from "../../localize/useLocalization"
import { ContextMenu, MenuDivider, MenuItem, Point } from "../ui/Menu"

/**
 * What a right-click on a step offers: the step editor's copy, paste and
 * clear, and room made for a step either side of it, or the step taken out
 * with those after it moving back to close the gap. The selection goes to
 * a step inserted, so the editor shows the room made. There is no inserting
 * after the grid's last step: the room would be past its end, out of sight.
 */
export const StepMenu: FC<{
  index: number
  at: Point
  onClose: () => void
}> = ({ index, at, onClose }) => {
  const patch = usePatch()
  const { copiedStep, setCopiedStep } = useCopiedStep()
  const [, setSelected] = useSelectedStep()
  const { paste, clearStepContent, insertStep, deleteStep } = usePatchEditor()
  const format = useFormat()

  const insert = (at: number) => {
    insertStep(at)
    setSelected(at)
  }

  return (
    <ContextMenu
      label={format("sequencer-step-number", { step: index + 1 })}
      at={at}
      onClose={onClose}
    >
      {(close) => (
        <>
          <MenuItem
            close={close}
            onSelect={() => setCopiedStep(patch.steps[index])}
          >
            <Localized name="sequencer-step-copy" />
          </MenuItem>
          <MenuItem
            close={close}
            disabled={copiedStep === null}
            onSelect={() => {
              if (copiedStep !== null) {
                paste(index, copiedStep)
              }
            }}
          >
            <Localized name="sequencer-step-paste" />
          </MenuItem>
          <MenuDivider />
          <MenuItem close={close} onSelect={() => insert(index)}>
            <Localized name="sequencer-step-insert-before" />
          </MenuItem>
          <MenuItem
            close={close}
            disabled={index + 1 >= patch.size}
            onSelect={() => insert(index + 1)}
          >
            <Localized name="sequencer-step-insert-after" />
          </MenuItem>
          <MenuDivider />
          <MenuItem close={close} onSelect={() => clearStepContent(index)}>
            <Localized name="sequencer-step-clear" />
          </MenuItem>
          <MenuItem close={close} onSelect={() => deleteStep(index)}>
            <Localized name="sequencer-step-delete" />
          </MenuItem>
        </>
      )}
    </ContextMenu>
  )
}
