import { FC, InputHTMLAttributes } from "react"
import { cn } from "./cn"

// The track and the thumb are vendor pseudo-elements, which no utility can
// name; they are styled by the .slider rule in styles.css.
export const Slider: FC<InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => <input type="range" className={cn("slider", className)} {...props} />
