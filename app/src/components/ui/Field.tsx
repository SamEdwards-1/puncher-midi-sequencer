import { FC, HTMLAttributes, ReactNode } from "react"
import { cn } from "./cn"

// A label and its control, the controls of a column of rows lined up past
// the longest label. The row is a named group, so what sits beside a label
// can show itself while the label is hovered.
const ROW =
  "group/field flex items-center py-[0.3rem] text-body text-fg-secondary"
const LABEL = "order-1 min-w-0 max-w-[5.5rem]"
const ASIDE = "order-2 mr-0.5 flex flex-none items-center"
// a grid of one, so the control is stretched across it as it always was
const CONTROL = "order-3 ml-auto grid w-[calc(100%-6rem)] flex-none"
// A control showing what a step's envelope has its setting at, rather than
// its own value, does so in the envelopes' colour: a select's text and edge,
// a typed value, a combo box's edge, a slider's thumb.
const LIVE =
  "[&_input]:text-envelope [&_select]:border-envelope [&_select]:text-envelope [&_[data-combobox]]:border-envelope [--midiseq-slider-thumb:var(--midiseq-envelope)]"

export const Fields: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex flex-col px-4 pt-2 pb-3">{children}</div>
)

interface FieldProps {
  label: string
  aside?: ReactNode
  // the control shows a value a step's envelope has the setting at
  live?: boolean
  // what the control's box takes, such as handlers for what is done to it
  control?: HTMLAttributes<HTMLDivElement>
  children: ReactNode
}

/**
 * A row of a setting: its label, and the control the label names. `aside`
 * sits just after the label — outside it, so it takes no part in naming the
 * control, though it shows between the two.
 */
export const Field: FC<FieldProps> = ({
  label,
  aside,
  live = false,
  control,
  children,
}) => (
  <div className={ROW}>
    {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the children */}
    <label className="contents">
      <span data-field-label className={LABEL}>
        {label}
      </span>
      <div {...control} className={cn(CONTROL, live && LIVE)} data-live={live}>
        {children}
      </div>
    </label>
    {aside !== undefined && <span className={ASIDE}>{aside}</span>}
  </div>
)

// The same row for controls that are buttons: a label would lend them its
// own text as their name.
export const ButtonField: FC<FieldProps> = ({
  label,
  aside,
  live = false,
  control,
  children,
}) => (
  <div className={ROW}>
    <span data-field-label className={LABEL}>
      {label}
    </span>
    {aside !== undefined && <span className={ASIDE}>{aside}</span>}
    <div {...control} className={cn(CONTROL, live && LIVE)} data-live={live}>
      {children}
    </div>
  </div>
)
