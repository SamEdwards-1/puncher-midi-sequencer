import { FC, ReactNode } from "react"

const ROW =
  "grid grid-cols-[6.5rem_1fr] items-center gap-2 py-[0.3rem] text-body text-fg-secondary"

export const Fields: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex flex-col px-4 pt-2 pb-3">{children}</div>
)

export const Field: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the control is the children
  <label className={ROW}>
    <span>{label}</span>
    {children}
  </label>
)

// The same row for controls that are buttons: a label would lend them its
// own text as their name.
export const ButtonField: FC<{ label: string; children: ReactNode }> = ({
  label,
  children,
}) => (
  <div className={ROW}>
    <span>{label}</span>
    {children}
  </div>
)
