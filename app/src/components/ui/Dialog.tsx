import { FC, ReactNode, useEffect, useRef } from "react"
import { Button } from "./Button"
import { cn } from "./cn"

/**
 * A modal panel over the app. It closes on Escape or on a click outside it,
 * so it never traps anyone, and takes the focus on opening so Escape reaches
 * it without a click first. Its footer is a close button, or the buttons
 * given in its place; a narrow one suits a handful of options.
 */
export const Dialog: FC<{
  title: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  narrow?: boolean
}> = ({ title, closeLabel, onClose, children, footer, narrow = false }) => {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the panel takes focus so Escape reaches it
        tabIndex={0}
        className={cn(
          "flex max-h-[min(44rem,90vh)] flex-col rounded-lg border border-popup-border bg-background shadow-[0_1rem_3rem_var(--midiseq-shadow)] focus:outline-none",
          narrow ? "w-[min(26rem,100%)]" : "w-[min(46rem,100%)]",
        )}
      >
        <h2 className="m-0 px-6 pt-5 pb-3 text-title font-semibold text-fg">
          {title}
        </h2>
        <div className="flex min-h-0 flex-1 gap-6 px-6">{children}</div>
        <div className="flex justify-end gap-2 px-6 pt-4 pb-5">
          {footer ?? (
            <Button type="button" onClick={onClose}>
              {closeLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
