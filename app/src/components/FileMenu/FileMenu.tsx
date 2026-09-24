import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import { FC, useState } from "react"
import { useFileActions } from "../../actions/file"
import { Localized, useLocalization } from "../../localize/useLocalization"
import { cn } from "../ui/cn"

const ITEM = "px-4 py-2 text-left text-body text-fg hover:bg-highlight"

export const FileMenu: FC = () => {
  const [open, setOpen] = useState(false)
  const { newPatch, open: openFile, save, saveAs } = useFileActions()
  const localized = useLocalization()

  const run = (action: () => void | Promise<void>) => () => {
    setOpen(false)
    void action()
  }

  return (
    <div className="relative flex items-center">
      {/* a menu-bar title, flat rather than a pill */}
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1 rounded-sm pr-2 pl-3 text-body",
          open
            ? "bg-background-secondary text-fg"
            : "text-fg-secondary hover:bg-highlight hover:text-fg",
        )}
        onClick={() => setOpen(!open)}
      >
        <Localized name="sequencer-file" />
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={localized["sequencer-file"]}
          className="absolute top-[calc(100%+0.25rem)] left-0 z-20 flex min-w-[10rem] flex-col rounded-lg border border-popup-border bg-background-secondary py-1 shadow-[0_1rem_3rem_var(--midiseq-shadow)]"
        >
          <button type="button" className={ITEM} onClick={run(newPatch)}>
            <Localized name="sequencer-file-new" />
          </button>
          <button type="button" className={ITEM} onClick={run(openFile)}>
            <Localized name="sequencer-file-open" />
          </button>
          <button type="button" className={ITEM} onClick={run(save)}>
            <Localized name="sequencer-file-save" />
          </button>
          <button type="button" className={ITEM} onClick={run(saveAs)}>
            <Localized name="sequencer-file-save-as" />
          </button>
        </div>
      )}
    </div>
  )
}
