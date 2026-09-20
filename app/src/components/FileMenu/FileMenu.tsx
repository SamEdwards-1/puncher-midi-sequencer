import styled from "@emotion/styled"
import { FC, useState } from "react"
import { useFileActions } from "../../actions/file"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { ToolbarButton } from "../ui/Button"

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`

const Popup = styled.div`
  position: absolute;
  left: 0;
  top: calc(100% + 0.25rem);
  z-index: 20;
  min-width: 10rem;
  padding: 0.25rem 0;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-popup-border);
  border-radius: 0.5rem;
  box-shadow: 0 1rem 3rem var(--color-shadow);
  display: flex;
  flex-direction: column;
`

const Item = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--color-highlight);
  }
`

export const FileMenu: FC = () => {
  const [open, setOpen] = useState(false)
  const { newPatch, open: openFile, save, saveAs } = useFileActions()
  const localized = useLocalization()

  const run = (action: () => void | Promise<void>) => () => {
    setOpen(false)
    void action()
  }

  return (
    <Wrapper>
      <ToolbarButton
        type="button"
        aria-expanded={open}
        data-active={open}
        onClick={() => setOpen(!open)}
      >
        <Localized name="sequencer-file" />
      </ToolbarButton>
      {open && (
        <Popup role="menu" aria-label={localized["sequencer-file"]}>
          <Item type="button" onClick={run(newPatch)}>
            <Localized name="sequencer-file-new" />
          </Item>
          <Item type="button" onClick={run(openFile)}>
            <Localized name="sequencer-file-open" />
          </Item>
          <Item type="button" onClick={run(save)}>
            <Localized name="sequencer-file-save" />
          </Item>
          <Item type="button" onClick={run(saveAs)}>
            <Localized name="sequencer-file-save-as" />
          </Item>
        </Popup>
      )}
    </Wrapper>
  )
}
