import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs md:text-sm text-slate-900 shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-semibold placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:border-red-600 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
