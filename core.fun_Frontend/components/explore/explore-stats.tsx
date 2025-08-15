"use client"

import { Card } from "@/components/ui/card"
import { TrendingUp, Users, DollarSign, Activity, Zap, Trophy, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api"
import { formatNumber } from "@/lib/data-transform"
import { Button } from "@/components/ui/button"

interface Stat {
  label: string
  value: string
  change?: number
  icon: React.ReactNode
  color: string
}

export default function ExploreStats() {
  const [stats, setStats] = useState<Stat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  const fetchStats = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await apiClient.getStats()
      
      if (response.success && response.data?.stats) {
        const { stats: data } = response.data
        
        // Format stats for display
        const formattedStats: Stat[] = [
          {
            label: "Total Volume",
            value: `${formatNumber(parseFloat(data.totalVolume || '0'))} CORE`,
            change: data.volumeChange24h,
            icon: <DollarSign className="h-4 w-4" />,
            color: "from-orange-500/20 to-orange-600/10"
          },
          {
            label: "Tokens Created",
            value: formatNumber(data.tokensCreated || 0),
            change: data.tokensChange24h,
            icon: <Zap className="h-4 w-4" />,
            color: "from-blue-500/20 to-blue-600/10"
          },
          {
            label: "Total Holders",
            value: formatNumber(data.totalHolders || 0),
            change: data.holdersChange24h,
            icon: <Users className="h-4 w-4" />,
            color: "from-purple-500/20 to-purple-600/10"
          },
          {
            label: "Graduated",
            value: formatNumber(data.graduated || 0),
            change: data.graduatedChange24h,
            icon: <Trophy className="h-4 w-4" />,
            color: "from-yellow-500/20 to-yellow-600/10"
          },
        ]
        
        setStats(formattedStats)
      } else {
        // If API fails, show zero values instead of mock data
        setStats([
          {
            label: "Total Volume",
            value: "0 CORE",
            change: 0,
            icon: <DollarSign className="h-4 w-4" />,
            color: "from-orange-500/20 to-orange-600/10"
          },
          {
            label: "Tokens Created",
            value: "0",
            change: 0,
            icon: <Zap className="h-4 w-4" />,
            color: "from-blue-500/20 to-blue-600/10"
          },
          {
            label: "Total Holders",
            value: "0",
            change: 0,
            icon: <Users className="h-4 w-4" />,
            color: "from-purple-500/20 to-purple-600/10"
          },
          {
            label: "Graduated",
            value: "0",
            change: 0,
            icon: <Trophy className="h-4 w-4" />,
            color: "from-yellow-500/20 to-yellow-600/10"
          },
        ])
        setError(response.error || 'Failed to fetch stats')
      }
    } catch (err: any) {
      console.error('Error fetching stats:', err)
      const errorMessage = err?.message || 'Failed to load platform statistics'
      setError(errorMessage)
      
      // Retry after 5 seconds on error
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          fetchStats()
        }
      }, 5000)
      // Show zero values on error
      setStats([
        {
          label: "Total Volume",
          value: "0 CORE",
          change: 0,
          icon: <DollarSign className="h-4 w-4" />,
          color: "from-orange-500/20 to-orange-600/10"
        },
        {
          label: "Tokens Created",
          value: "0",
          change: 0,
          icon: <Zap className="h-4 w-4" />,
          color: "from-blue-500/20 to-blue-600/10"
        },
        {
          label: "Total Holders",
          value: "0",
          change: 0,
          icon: <Users className="h-4 w-4" />,
          color: "from-purple-500/20 to-purple-600/10"
        },
        {
          label: "Graduated",
          value: "0",
          change: 0,
          icon: <Trophy className="h-4 w-4" />,
          color: "from-yellow-500/20 to-yellow-600/10"
        },
      ])
    } finally {
      setIsLoading(false)
      setLastRefresh(Date.now())
    }
  }

  useEffect(() => {
    fetchStats()
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    fetchStats()
  }

  return (
    <div className="relative">
      {/* Refresh button */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="text-white/60 hover:text-white"
        >
          <RefreshCw className={cn(
            "h-4 w-4",
            isLoading && "animate-spin"
          )} />
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="px-4 pt-2">
          <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
            {error}
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        {/* Loading skeletons */}
        {isLoading && stats.length === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card
              key={`skeleton-${index}`}
              className="relative overflow-hidden border-white/10 bg-gradient-to-br from-white/[0.02] to-transparent p-4 animate-pulse"
            >
              <div className="relative">
                <div className="flex items-start justify-between mb-2">
                  <div className="h-8 w-8 rounded-lg bg-white/10" />
                  <div className="h-4 w-12 bg-white/10 rounded" />
                </div>
                <div className="h-7 w-24 bg-white/10 rounded mb-1" />
                <div className="h-3 w-16 bg-white/10 rounded" />
              </div>
            </Card>
          ))
        ) : (
          stats.map((stat, index) => (
            <Card
              key={index}
              className="relative overflow-hidden border-white/10 bg-gradient-to-br from-white/[0.02] to-transparent p-4"
            >
          <div className="absolute inset-0 bg-gradient-to-br opacity-50" 
               style={{ background: `linear-gradient(135deg, ${stat.color})` }} />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-2">
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
                stat.color
              )}>
                {stat.icon}
              </div>
              {stat.change !== undefined && (
                <div className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  stat.change > 0 ? "text-orange-400" : "text-red-400"
                )}>
                  <TrendingUp className={cn(
                    "h-3 w-3",
                    stat.change < 0 && "rotate-180"
                  )} />
                  {Math.abs(stat.change)}%
                </div>
              )}
            </div>
            
            <div className="text-2xl font-bold text-white mb-1">
              {stat.value}
            </div>
            
            <div className="text-xs text-white/50">
              {stat.label}
            </div>
          </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}