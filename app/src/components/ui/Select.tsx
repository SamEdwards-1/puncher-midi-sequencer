import { FC, SelectHTMLAttributes } from "react"
import { cn } from "./cn"

export const Select: FC<SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...props
}) => (
  <select
    className={cn(
      "h-[1.9rem] rounded-sm border border-divider bg-background px-[0.4rem] text-body text-fg focus:border-theme focus:outline-none",
      className,
    )}
    {...props}
  />
)
