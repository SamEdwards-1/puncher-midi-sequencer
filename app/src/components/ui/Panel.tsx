import { FC, HTMLAttributes } from "react"
import { cn } from "./cn"

// Scrolling is left to each panel: two of them scroll as a whole, the middle
// one holds a grid that shrinks instead.
export const Panel: FC<HTMLAttributes<HTMLElement>> = ({
  className,
  ...props
}) => (
  <section
    className={cn("flex min-h-0 flex-col bg-background", className)}
    {...props}
  />
)

export interface PanelHeaderProps extends HTMLAttributes<HTMLElement> {
  as?: "h2" | "div"
}

export const PanelHeader: FC<PanelHeaderProps> = ({
  as: Tag = "h2",
  className,
  ...props
}) => (
  <Tag
    className={cn(
      "m-0 border-b border-divider px-4 py-3 text-title font-semibold text-fg",
      className,
    )}
    {...props}
  />
)
