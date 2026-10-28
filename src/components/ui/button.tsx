import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon" | "xs"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap shrink-0 rounded-lg text-xs font-semibold tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none",
          {
            "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800": variant === "default" || variant === "primary",
            "bg-rose-600 text-white shadow-xs hover:bg-rose-700 active:bg-rose-800": variant === "destructive",
            "border border-slate-200 bg-white hover:bg-slate-50/80 hover:border-slate-300 text-slate-700 shadow-2xs": variant === "outline",
            "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300": variant === "secondary",
            "hover:bg-slate-100 text-slate-600 hover:text-slate-900": variant === "ghost",
            "text-red-600 underline-offset-4 hover:underline p-0 h-auto font-medium": variant === "link",
            "h-9 px-3.5 py-1.5": size === "default",
            "h-7 px-2.5 text-[11px]": size === "xs",
            "h-8 px-3 text-xs": size === "sm",
            "h-10 px-5 text-sm": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
