'use client'

import { useEffect } from 'react'
import { useAuthStore, useWebSocketStore, useTokenStore, usePortfolioStore, useWalletStore } from '@/lib/stores'

export function StoreInitializer({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore(state => state.initializeAuth)
  const { isAuthenticated, session } = useAuthStore()
  
  const connectWebSocket = useWebSocketStore(state => state.connect)
  const disconnectWebSocket = useWebSocketStore(state => state.disconnect)
  const subscribeToChannels = useWebSocketStore(state => state.subscribe)
  
  const fetchTokens = useTokenStore(state => state.fetchTokens)
  const fetchTrendingTokens = useTokenStore(state => state.fetchTrendingTokens)
  
  const fetchPortfolio = usePortfolioStore(state => state.fetchPortfolio)
  const refreshBalance = useWalletStore(state => state.refreshBalance)

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (isAuthenticated && session) {
      // Connect with auth token
      connectWebSocket(session.token)
      
      // Subscribe to default channels
      subscribeToChannels('alerts')
      subscribeToChannels('tokens')
      subscribeToChannels('prices')
      subscribeToChannels('trades')
    } else {
      // Connect without auth for public data
      connectWebSocket()
      
      // Subscribe to public channels only
      subscribeToChannels('tokens')
      subscribeToChannels('prices')
    }

    return () => {
      disconnectWebSocket()
    }
  }, [isAuthenticated, session])

  // Load initial data
  useEffect(() => {
    // Load tokens
    fetchTokens({ reset: true })
    fetchTrendingTokens()

    // If authenticated, load user data
    if (isAuthenticated) {
      fetchPortfolio()
      refreshBalance()
    }
  }, [isAuthenticated])

  // Set up periodic data refresh
  useEffect(() => {
    if (!isAuthenticated) return

    const refreshInterval = setInterval(() => {
      refreshBalance()
      fetchPortfolio()
    }, 60000) // Refresh every minute

    return () => clearInterval(refreshInterval)
  }, [isAuthenticated])

  return <>{children}</>
}