import { FC } from "react"
import { useFileActions } from "../../actions/file"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { MenuBarMenu, MenuItem } from "../ui/Menu"

export const FileMenu: FC = () => {
  const { newPatch, open, save, saveAs } = useFileActions()
  const localized = useLocalization()

  return (
    <MenuBarMenu label={localized["sequencer-file"]}>
      {(close) => (
        <>
          <MenuItem close={close} onSelect={newPatch}>
            <Localized name="sequencer-file-new" />
          </MenuItem>
          <MenuItem close={close} onSelect={open}>
            <Localized name="sequencer-file-open" />
          </MenuItem>
          <MenuItem close={close} onSelect={save}>
            <Localized name="sequencer-file-save" />
          </MenuItem>
          <MenuItem close={close} onSelect={saveAs}>
            <Localized name="sequencer-file-save-as" />
          </MenuItem>
        </>
      )}
    </MenuBarMenu>
  )
}
