import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
  className?: string
  children?: React.ReactNode
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight transition-colors focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 select-none",
        {
          "border-red-200/80 bg-red-50 text-red-700": variant === "default",
          "border-slate-200 bg-slate-100 text-slate-700": variant === "secondary",
          "border-rose-200 bg-rose-50 text-rose-700 font-semibold": variant === "destructive",
          "border-slate-200 bg-white text-slate-800": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
