import CloseIcon from "mdi-react/CloseIcon"
import { FC, ReactNode } from "react"
import { cn } from "./cn"

export type ToastTone = "info" | "warning" | "error"

// Solid and dark whatever the theme, under white text, so a toast reads
// over anything and in any theme. Not theme colours: those are made from VS
// Code themes, which have nothing for this.
const TONES: Record<ToastTone, string> = {
  info: "border-[#3a5f9e] bg-[#1f3f73]",
  warning: "border-[#a8641c] bg-[#7a4210]",
  error: "border-[#b0402f] bg-[#8a2418]",
}

/**
 * A note in the bottom-left corner, over the app, until it's dismissed or
 * whatever it is about stops being true. It slides up from below the edge of
 * the window and back down again, staying mounted while it's closed so it
 * can; closed, it's hidden from everything once it's out of sight. `action`
 * follows the message, a link's worth of way to fix it.
 */
export const Toast: FC<{
  open: boolean
  tone: ToastTone
  children: ReactNode
  action?: ReactNode
  title?: string
  dismissLabel: string
  onDismiss: () => void
}> = ({ open, tone, children, action, title, dismissLabel, onDismiss }) => (
  <div
    data-tone={tone}
    aria-hidden={!open}
    inert={!open}
    className={cn(
      "fixed bottom-4 left-4 z-40 flex max-w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border py-2 pl-4 pr-2 text-small leading-5 text-white shadow-[0_1rem_3rem_var(--midiseq-shadow)]",
      // visibility flips at the end of the slide down, the start of the up
      "motion-safe:transition-[translate,visibility] motion-safe:duration-200 motion-safe:ease-out",
      open
        ? "visible translate-y-0 starting:translate-y-[calc(100%+2rem)]"
        : "invisible translate-y-[calc(100%+2rem)]",
      TONES[tone],
    )}
  >
    <div className="min-w-0">
      {/* an output is a status region already, read out as it changes */}
      <output title={title}>{children}</output>
      {action !== undefined && <> {action}</>}
    </div>
    {/* one line tall, so the cross sits level with the message's first line */}
    <div className="flex h-[1lh] flex-none items-center">
      {/* an IconButton's size, in white for the toast's dark ground */}
      <button
        type="button"
        aria-label={dismissLabel}
        title={dismissLabel}
        className="flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded-sm text-white/80 hover:bg-white/15 hover:text-white"
        onClick={onDismiss}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  </div>
)

/** A toast's action: a link, though it does something here rather than go. */
export const ToastAction: FC<{ children: ReactNode; onClick: () => void }> = ({
  children,
  onClick,
}) => (
  <button
    type="button"
    className="whitespace-nowrap font-semibold text-white underline underline-offset-2 hover:text-white/80"
    onClick={onClick}
  >
    {children}
  </button>
)
