import { FC, SelectHTMLAttributes } from "react"
import { cn } from "./cn"

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  // the height of a small button, to sit in a row of them
  compact?: boolean
}

export const Select: FC<SelectProps> = ({
  compact = false,
  className,
  ...props
}) => (
  <select
    className={cn(
      "rounded-sm border border-divider bg-background px-[0.4rem] font-normal text-fg focus:border-theme focus:outline-none",
      compact ? "h-[1.7rem] text-small" : "h-[1.9rem] text-body",
      className,
    )}
    {...props}
  />
)
