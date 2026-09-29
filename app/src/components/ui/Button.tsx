import { ButtonHTMLAttributes, FC, FieldsetHTMLAttributes } from "react"
import { cn } from "./cn"

export type ButtonSize = "md" | "sm" | "field" | "pill"

const SIZES: Record<ButtonSize, string> = {
  md: "h-8 px-3 text-body",
  sm: "h-[1.7rem] px-[0.6rem] text-small",
  // the height of a select, so it lines up inside a field row
  field: "h-[1.9rem] px-[0.6rem] text-small",
  // a small rounded tag, many to a row
  pill: "h-[1.4rem] rounded-full px-2 text-small",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize
  active?: boolean
  // the action a dialog is for, filled in the theme colour
  primary?: boolean
}

export const Button: FC<ButtonProps> = ({
  size = "md",
  active = false,
  primary = false,
  className,
  ...props
}) => (
  <button
    data-active={active}
    className={cn(
      "flex items-center gap-[0.4rem] disabled:opacity-40",
      size !== "pill" && "rounded-sm",
      SIZES[size],
      active || primary
        ? "bg-theme text-on-surface enabled:hover:brightness-110"
        : "bg-background-secondary text-fg enabled:hover:bg-highlight",
      className,
    )}
    {...props}
  />
)

export interface ButtonGroupProps
  extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  size?: Exclude<ButtonSize, "field" | "pill">
}

const GROUP_HEIGHTS: Record<NonNullable<ButtonGroupProps["size"]>, string> = {
  md: "h-8",
  sm: "h-[1.7rem]",
}

/**
 * Buttons that belong together, joined into one bar with a seam between
 * each. The bar keeps the height of a lone button, its border inside it. A
 * disabled button dims its label, not its fill, so the bar stays whole.
 */
export const ButtonGroup: FC<ButtonGroupProps> = ({
  size = "sm",
  className,
  ...props
}) => (
  <fieldset
    className={cn(
      "m-0 box-border flex min-w-0 flex-none divide-x divide-fg/15 overflow-hidden rounded-sm border border-fg/15 bg-background-secondary p-0",
      "*:h-full *:rounded-none *:disabled:text-fg/40 *:disabled:opacity-100",
      GROUP_HEIGHTS[size],
      className,
    )}
    {...props}
  />
)

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

/**
 * Just a glyph: no fill until it is hovered, and a tint while it is on. The
 * size of a stepper's buttons.
 */
export const IconButton: FC<IconButtonProps> = ({
  active = false,
  className,
  ...props
}) => (
  <button
    type="button"
    data-active={active}
    className={cn(
      "flex h-[1.6rem] w-[1.6rem] flex-none items-center justify-center rounded-sm disabled:opacity-40",
      active
        ? "bg-highlight text-theme"
        : "text-fg-secondary enabled:hover:bg-highlight enabled:hover:text-fg",
      className,
    )}
    {...props}
  />
)

export interface ToolbarButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  // record turns red rather than blue when it is on
  accent?: "theme" | "record"
}

/**
 * App-bar pill. It keeps its own height so it never reaches the top or
 * bottom edge of the bar.
 */
export const ToolbarButton: FC<ToolbarButtonProps> = ({
  active = false,
  accent = "theme",
  className,
  ...props
}) => (
  <button
    data-active={active}
    className={cn(
      "flex h-8 items-center gap-[0.4rem] self-center whitespace-nowrap rounded-full px-4 text-small",
      active
        ? cn(accent === "record" ? "bg-record" : "bg-theme", "text-on-surface")
        : "bg-transparent text-fg disabled:text-fg-tertiary enabled:hover:bg-highlight",
      className,
    )}
    {...props}
  />
)
