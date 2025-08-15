"use client"

import { useState } from "react"
import { HeaderBase } from '../HeaderBase'
import { Button } from "@/components/ui/button"
import { 
  Search, 
  Filter, 
  Flame, 
  Settings, 
  TrendingUp,
  ChartBar
} from "lucide-react"
import { useRouter } from "next/navigation"

export default function ExploreTopbar() {
  const [selectedTab, setSelectedTab] = useState<"new" | "trending">("trending")
  const [selectedTimeframe, setSelectedTimeframe] = useState("24H")
  const timeframes = ["24H", "12H", "6H", "1H", "5M"]
  const router = useRouter()

  const leftContent = (
    <div className="flex items-center gap-3">
      {/* Explore Label */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
          <Search className="h-4 w-4 text-orange-400" />
        </div>
        <span className="text-lg font-semibold text-white">Explore</span>
      </div>

      {/* Tab Selector */}
      <div className="flex items-center rounded-lg bg-white/5 p-1">
        <Button
          size="sm"
          variant={selectedTab === "new" ? "secondary" : "ghost"}
          className={`h-7 px-3 ${selectedTab === "new" ? "bg-white/10 text-white" : "text-white/50"}`}
          onClick={() => setSelectedTab("new")}
        >
          <TrendingUp className="h-3 w-3 mr-1" />
          New Tokens
        </Button>
        <Button
          size="sm"
          variant={selectedTab === "trending" ? "secondary" : "ghost"}
          className={`h-7 px-3 ${selectedTab === "trending" ? "bg-orange-500/20 text-orange-400" : "text-white/50"}`}
          onClick={() => setSelectedTab("trending")}
        >
          <Flame className="h-3 w-3 mr-1" />
          Trending
        </Button>
      </div>

      {/* Timeframe selector for trending */}
      {selectedTab === "trending" && (
        <div className="hidden lg:flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {timeframes.map((tf) => (
            <Button
              key={tf}
              size="sm"
              variant={selectedTimeframe === tf ? "secondary" : "ghost"}
              className={`h-6 px-2 text-xs ${
                selectedTimeframe === tf 
                  ? "bg-orange-500/20 text-orange-400" 
                  : "text-white/50 hover:text-white"
              }`}
              onClick={() => setSelectedTimeframe(tf)}
            >
              {tf}
            </Button>
          ))}
        </div>
      )}
    </div>
  )

  const rightContent = (
    <>
      {/* Filter */}
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 gap-2 border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
      >
        <Filter className="h-3 w-3" />
        Filter
      </Button>

      {/* Settings */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 text-white/50 hover:text-white"
      >
        <Settings className="h-4 w-4" />
      </Button>

      {/* Advanced */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 gap-1 text-white/50 hover:text-white"
        onClick={() => router.push('/neo')}
      >
        <ChartBar className="h-3 w-3" />
        Advanced
      </Button>
    </>
  )

  return (
    <HeaderBase 
      leftContent={leftContent}
      rightContent={rightContent}
      showSearch={false}
    />
  )
}