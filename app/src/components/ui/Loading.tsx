import { FC } from "react"

/**
 * A spinner over the app, saying what it is waiting for. It spins by
 * transform, which the browser keeps turning even while the page is busy.
 */
export const Loading: FC<{ label: string }> = ({ label }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    {/* an output is a status region already, read out as it changes */}
    <output className="flex items-center gap-3 rounded-lg border border-popup-border bg-background px-5 py-4 text-body text-fg shadow-[0_1rem_3rem_var(--midiseq-shadow)]">
      <span
        aria-hidden
        className="h-5 w-5 flex-none rounded-full border-2 border-fg-tertiary border-t-theme motion-safe:animate-spin"
      />
      {label}
    </output>
  </div>
)
