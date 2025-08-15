"use client"

import { HeaderBase } from '../HeaderBase'
import { Button } from "@/components/ui/button"
import { 
  TrendingUp,
  Eye,
  Settings,
  ChartBar,
  Activity,
  BarChart3
} from "lucide-react"
import { useState } from 'react'

export default function NeoTopbar() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const leftContent = (
    <div className="flex items-center gap-3">
      {/* Neo Vision Label */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-orange-400" />
        </div>
        <span className="text-lg font-semibold text-white">Analytics</span>
      </div>

      {/* View Mode Toggle */}
      <div className="hidden sm:flex items-center gap-1 rounded-lg bg-white/5 p-1">
        <Button
          size="sm"
          variant={viewMode === 'grid' ? "secondary" : "ghost"}
          className={`h-6 px-2 text-xs ${viewMode === 'grid' ? 'bg-orange-500/20 text-orange-400' : 'text-white/50'}`}
          onClick={() => setViewMode('grid')}
        >
          Grid View
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'list' ? "secondary" : "ghost"}
          className={`h-6 px-2 text-xs ${viewMode === 'list' ? 'bg-orange-500/20 text-orange-400' : 'text-white/50'}`}
          onClick={() => setViewMode('list')}
        >
          List View
        </Button>
      </div>
    </div>
  )

  const rightContent = (
    <>
      {/* View Options */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 text-white/50 hover:text-white"
      >
        <Eye className="h-4 w-4" />
      </Button>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 text-white/50 hover:text-white"
      >
        <ChartBar className="h-4 w-4" />
      </Button>

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 text-white/50 hover:text-white"
      >
        <Settings className="h-4 w-4" />
      </Button>

      {/* Stats */}
      <Button 
        variant="outline" 
        size="sm" 
        className="h-8 gap-2 border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
      >
        <Activity className="h-3 w-3" />
        Live Data
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