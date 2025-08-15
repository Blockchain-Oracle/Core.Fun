import type React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function Stat({ label, value, positive }: { label: string; value: string | number; positive?: boolean }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span
        className={cn(
          "font-medium",
          positive === undefined ? "text-white/80" : positive ? "text-orange-400" : "text-red-400",
        )}
      >
        {value}
      </span>
      <span className="text-white/40">{label}</span>
    </div>
  )
}

export function Chip({
  children,
  variant = "default",
}: { children: React.ReactNode; variant?: "default" | "success" | "danger" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 border-white/10 bg-white/5 px-1.5 text-[10px] leading-none text-white/70",
        variant === "success" && "border-orange-400/30 text-orange-300",
        variant === "danger" && "border-red-400/30 text-red-300",
      )}
    >
      {children}
    </Badge>
  )
}
