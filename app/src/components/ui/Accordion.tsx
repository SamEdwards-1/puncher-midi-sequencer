import ChevronDownIcon from "mdi-react/ChevronDownIcon"
import ChevronUpIcon from "mdi-react/ChevronUpIcon"
import { FC, ReactNode } from "react"
import { cn } from "./cn"

/**
 * A part of a dialog that folds away: a row the width of the dialog with
 * its name, a summary of what it holds — seen open or folded, so a folded
 * one still shows what it will do — and a chevron at the far end. The open
 * one's row is lit. Accordions one after another are ruled apart, with no
 * border round them.
 */
export const Accordion: FC<{
  label: ReactNode
  summary?: ReactNode
  open: boolean
  onOpen: (open: boolean) => void
  children: ReactNode
}> = ({ label, summary, open, onOpen, children }) => (
  <section
    data-accordion
    className="flex min-w-0 flex-none flex-col [[data-accordion]+&]:border-t [[data-accordion]+&]:border-divider"
  >
    <button
      type="button"
      aria-expanded={open}
      onClick={() => onOpen(!open)}
      className={cn(
        "flex min-w-0 items-center gap-2 px-3 py-2 text-left text-body hover:bg-highlight",
        open ? "bg-highlight font-medium text-fg" : "text-fg-secondary",
      )}
    >
      <span className="flex-none">{label}</span>
      {summary !== undefined && (
        <span
          className="min-w-0 truncate font-normal text-small text-fg-tertiary"
          data-fold-summary
        >
          {summary}
        </span>
      )}
      {open ? (
        <ChevronUpIcon size={18} className="ml-auto flex-none" />
      ) : (
        <ChevronDownIcon size={18} className="ml-auto flex-none" />
      )}
    </button>
    {open && <div className="flex flex-col gap-1 px-3 py-3">{children}</div>}
  </section>
)
