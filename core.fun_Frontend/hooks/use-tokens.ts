import { useState, useEffect, useCallback } from 'react'
import { apiClient, TokenData, wsClient } from '@/lib/api'

export interface UseTokensOptions {
  status?: 'CREATED' | 'LAUNCHED' | 'GRADUATED'
  limit?: number
  sortBy?: string
  order?: 'asc' | 'desc'
  realtime?: boolean
}

export function useTokens(options: UseTokensOptions = {}) {
  const [tokens, setTokens] = useState<TokenData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.getTokens({
        status: options.status,
        limit: options.limit || 50,
        sortBy: options.sortBy || 'createdAt',
        order: options.order || 'desc'
      })

      if (response.success && response.data) {
        setTokens(response.data.tokens)
        setTotal(response.data.total)
        setHasMore(response.data.hasMore)
      } else {
        setError(response.error || 'Failed to fetch tokens')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [options.status, options.limit, options.sortBy, options.order])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  // Set up real-time updates via WebSocket
  useEffect(() => {
    if (!options.realtime) return

    const handleNewToken = (data: any) => {
      if (data.status === options.status || !options.status) {
        setTokens(prev => [data, ...prev])
        setTotal(prev => prev + 1)
      }
    }

    const handlePriceUpdate = (data: any) => {
      setTokens(prev => prev.map(token => 
        token.address === data.token 
          ? { ...token, price: data.price, priceChange24h: data.priceChange24h }
          : token
      ))
    }

    const handleTokenUpdate = (data: any) => {
      setTokens(prev => prev.map(token => 
        token.address === data.address 
          ? { ...token, ...data }
          : token
      ))
    }

    wsClient.connect()
    wsClient.subscribe('tokens', handleNewToken)
    wsClient.subscribe('prices', handlePriceUpdate)
    wsClient.subscribe('alerts', handleTokenUpdate)

    return () => {
      wsClient.unsubscribe('tokens', handleNewToken)
      wsClient.unsubscribe('prices', handlePriceUpdate)
      wsClient.unsubscribe('alerts', handleTokenUpdate)
    }
  }, [options.realtime, options.status])

  return {
    tokens,
    loading,
    error,
    hasMore,
    total,
    refetch: fetchTokens
  }
}

export function useToken(address: string) {
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchToken = useCallback(async () => {
    if (!address) return

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.getToken(address)
      
      if (response.success && response.data) {
        setToken(response.data)
      } else {
        setError(response.error || 'Failed to fetch token')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchToken()
  }, [fetchToken])

  return {
    token,
    loading,
    error,
    refetch: fetchToken
  }
}

export function useTokenAnalytics(address: string) {
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async () => {
    if (!address) return

    setLoading(true)
    setError(null)

    try {
      const response = await apiClient.getTokenAnalytics(address)
      
      if (response.success && response.data) {
        setAnalytics(response.data)
      } else {
        setError(response.error || 'Failed to fetch analytics')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  return {
    analytics,
    loading,
    error,
    refetch: fetchAnalytics
  }
}

// Hook for real-time price updates
export function usePriceUpdates(tokenAddress: string) {
  const [price, setPrice] = useState<number>(0)
  const [priceChange24h, setPriceChange24h] = useState<number>(0)
  const [volume24h, setVolume24h] = useState<number>(0)

  useEffect(() => {
    const handlePriceUpdate = (data: any) => {
      if (data.token === tokenAddress) {
        setPrice(data.price)
        setPriceChange24h(data.priceChange24h)
        setVolume24h(data.volume24h)
      }
    }

    wsClient.connect()
    wsClient.subscribe('prices', handlePriceUpdate)

    return () => {
      wsClient.unsubscribe('prices', handlePriceUpdate)
    }
  }, [tokenAddress])

  return { price, priceChange24h, volume24h }
}

// Hook for trade updates
export function useTradeUpdates(tokenAddress?: string) {
  const [trades, setTrades] = useState<any[]>([])

  useEffect(() => {
    const handleTradeUpdate = (data: any) => {
      if (!tokenAddress || data.tokenIn === tokenAddress || data.tokenOut === tokenAddress) {
        setTrades(prev => [data, ...prev.slice(0, 49)]) // Keep last 50 trades
      }
    }

    wsClient.connect()
    wsClient.subscribe('trades', handleTradeUpdate)

    return () => {
      wsClient.unsubscribe('trades', handleTradeUpdate)
    }
  }, [tokenAddress])

  return { trades }
}