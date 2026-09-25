import { ButtonHTMLAttributes, FC } from "react"
import { cn } from "./cn"

export type ButtonSize = "md" | "sm" | "field"

const SIZES: Record<ButtonSize, string> = {
  md: "h-8 px-3 text-body",
  sm: "h-[1.7rem] px-[0.6rem] text-small",
  // the height of a select, so it lines up inside a field row
  field: "h-[1.9rem] px-[0.6rem] text-small",
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
      "flex items-center gap-[0.4rem] rounded-sm disabled:opacity-40",
      SIZES[size],
      active || primary
        ? "bg-theme text-on-surface enabled:hover:brightness-110"
        : "bg-background-secondary text-fg enabled:hover:bg-highlight",
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
