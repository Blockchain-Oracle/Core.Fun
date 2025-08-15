import { useState, useEffect, useCallback } from 'react'
import { apiClient, wsClient } from '@/lib/api'

export interface PlatformStats {
  totalTokens: number
  totalVolume24h: number
  totalTrades24h: number
  totalLiquidity: number
  newTokens24h: number
  topGainers: any[]
  topLosers: any[]
  mostTraded: any[]
}

export function useStats() {
  const [stats, setStats] = useState<PlatformStats>({
    totalTokens: 0,
    totalVolume24h: 0,
    totalTrades24h: 0,
    totalLiquidity: 0,
    newTokens24h: 0,
    topGainers: [],
    topLosers: [],
    mostTraded: []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.getStats()
      
      if (response.success && response.data) {
        setStats(response.data)
      } else {
        setError(response.error || 'Failed to fetch stats')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()

    // Set up real-time updates
    const handleStatsUpdate = (data: any) => {
      setStats(prev => ({ ...prev, ...data }))
    }

    wsClient.connect()
    wsClient.subscribe('stats', handleStatsUpdate)

    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000)

    return () => {
      wsClient.unsubscribe('stats', handleStatsUpdate)
      clearInterval(interval)
    }
  }, [fetchStats])

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  }
}