import type React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

export default function SectionColumn({
  title,
  itemsCount,
  premium = false,
  children,
}: {
  title: string
  itemsCount?: number
  premium?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-white/10 bg-black/40",
        "h-full min-h-[400px] md:min-h-[500px] xl:min-h-0",
        premium && "ring-1 ring-yellow-400/40",
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-lg border-b border-white/10 bg-black/60 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-[15px] font-semibold">{title}</h2>
          {typeof itemsCount === "number" && (
            <Badge variant="outline" className="border-white/15 text-white/70 text-xs">
              {itemsCount}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-white/80 hover:text-white h-8 px-2">
          <SlidersHorizontal className="h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline text-xs">Filter</span>
        </Button>
      </div>
      
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </div>
  )
}