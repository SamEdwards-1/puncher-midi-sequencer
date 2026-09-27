import { FC, ReactNode } from "react"

// A label and its control, the controls of a column of rows lined up past
// the longest label. The row is a named group, so what sits beside a label
// can show itself while the label is hovered.
const ROW =
  "group/field flex items-center py-[0.3rem] text-body text-fg-secondary"
const LABEL = "order-1 min-w-0 max-w-[6.5rem]"
const ASIDE = "order-2 mr-1 flex flex-none items-center"
// a grid of one, so the control is stretched across it as it always was
const CONTROL = "order-3 ml-auto grid w-[calc(100%-7rem)] flex-none"

export const Fields: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex flex-col px-4 pt-2 pb-3">{children}</div>
)

/**
 * A row of a setting: its label, and the control the label names. `aside`
 * sits just after the label — outside it, so it takes no part in naming the
 * control, though it shows between the two.
 */
export const Field: FC<{
  label: string
  aside?: ReactNode
  children: ReactNode
}> = ({ label, aside, children }) => (
  <div className={ROW}>
    {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the children */}
    <label className="contents">
      <span data-field-label className={LABEL}>
        {label}
      </span>
      <div className={CONTROL}>{children}</div>
    </label>
    {aside !== undefined && <span className={ASIDE}>{aside}</span>}
  </div>
)

// The same row for controls that are buttons: a label would lend them its
// own text as their name.
export const ButtonField: FC<{
  label: string
  aside?: ReactNode
  children: ReactNode
}> = ({ label, aside, children }) => (
  <div className={ROW}>
    <span data-field-label className={LABEL}>
      {label}
    </span>
    {aside !== undefined && <span className={ASIDE}>{aside}</span>}
    <div className={CONTROL}>{children}</div>
  </div>
)
