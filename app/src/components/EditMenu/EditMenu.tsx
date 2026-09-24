import { FC } from "react"
import { useHistory } from "../../hooks/useHistory"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { MenuBarMenu, MenuItem } from "../ui/Menu"

// The keys already bound in useKeyboardShortcuts, spelt the platform's way.
const onMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const UNDO_KEYS = onMac ? "⌘Z" : "Ctrl+Z"
const REDO_KEYS = onMac ? "⇧⌘Z" : "Ctrl+Shift+Z"

export const EditMenu: FC = () => {
  const { canUndo, canRedo, undo, redo } = useHistory()
  const localized = useLocalization()

  return (
    <MenuBarMenu label={localized["sequencer-edit"]}>
      {(close) => (
        <>
          <MenuItem
            close={close}
            onSelect={undo}
            disabled={!canUndo}
            shortcut={UNDO_KEYS}
          >
            <Localized name="sequencer-undo" />
          </MenuItem>
          <MenuItem
            close={close}
            onSelect={redo}
            disabled={!canRedo}
            shortcut={REDO_KEYS}
          >
            <Localized name="sequencer-redo" />
          </MenuItem>
        </>
      )}
    </MenuBarMenu>
  )
}
