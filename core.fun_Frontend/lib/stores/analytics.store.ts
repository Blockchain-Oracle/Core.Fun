import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '@/lib/api'

export interface PlatformStats {
  totalVolume: string
  tokensCreated: number
  totalHolders: number
  graduated: number
  totalMarketCap: string
  tokensCreated24h: number
  volumeChange24h: number
  tokensChange24h: number
  holdersChange24h: number
  graduatedChange24h: number
  platformFees: string
  totalStaked: string
  totalRewardsDistributed: string
  activeStakers: number
  averageAPY: number
}

export interface TokenAnalytics {
  address: string
  period: '24h' | '7d' | '30d'
  priceChange: number
  volumeChange: number
  holdersChange: number
  transactions: number
  uniqueTraders: number
  buyPressure: number
  sellPressure: number
  avgHoldTime: number
  whaleActivity: number
}

export interface SystemHealth {
  api: 'healthy' | 'degraded' | 'down'
  blockchain: 'healthy' | 'degraded' | 'down'
  websocket: 'healthy' | 'degraded' | 'down'
  database: 'healthy' | 'degraded' | 'down'
  latency: {
    api: number
    blockchain: number
    database: number
  }
  blockHeight: number
  gasPrice: string
}

export interface ChartData {
  timestamp: number
  value: number
  label?: string
}

interface AnalyticsState {
  // Platform metrics
  platformStats: PlatformStats | null
  systemHealth: SystemHealth | null
  
  // Token analytics cache
  tokenAnalytics: Map<string, TokenAnalytics>
  
  // Chart data
  volumeChart: ChartData[]
  tvlChart: ChartData[]
  usersChart: ChartData[]
  feesChart: ChartData[]
  
  // Loading states
  isLoading: boolean
  error: string | null
  lastUpdated: number | null
  
  // Actions
  fetchPlatformStats: () => Promise<void>
  fetchSystemHealth: () => Promise<void>
  fetchTokenAnalytics: (tokenAddress: string, period?: '24h' | '7d' | '30d') => Promise<void>
  updateChartData: (chartType: 'volume' | 'tvl' | 'users' | 'fees', data: ChartData[]) => void
  reset: () => void
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      // Initial state
      platformStats: null,
      systemHealth: null,
      tokenAnalytics: new Map(),
      volumeChart: [],
      tvlChart: [],
      usersChart: [],
      feesChart: [],
      isLoading: false,
      error: null,
      lastUpdated: null,

      // Fetch platform statistics
      fetchPlatformStats: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getStats()
          if (response.success && response.data) {
            set({ 
              platformStats: response.data.stats,
              lastUpdated: Date.now(),
              isLoading: false 
            })
          } else {
            set({ 
              error: response.error || 'Failed to fetch platform stats', 
              isLoading: false 
            })
          }
        } catch (error) {
          set({ 
            error: 'Failed to fetch platform stats', 
            isLoading: false 
          })
        }
      },

      // Fetch system health
      fetchSystemHealth: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getSystemHealth()
          if (response.success && response.data) {
            set({ 
              systemHealth: response.data.health,
              isLoading: false 
            })
          } else {
            set({ 
              error: response.error || 'Failed to fetch system health', 
              isLoading: false 
            })
          }
        } catch (error) {
          set({ 
            error: 'Failed to fetch system health', 
            isLoading: false 
          })
        }
      },

      // Fetch token analytics
      fetchTokenAnalytics: async (tokenAddress: string, period: '24h' | '7d' | '30d' = '24h') => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getTokenAnalytics(tokenAddress, period)
          if (response.success && response.data) {
            const analytics: TokenAnalytics = {
              address: tokenAddress,
              period,
              ...response.data.analytics
            }
            
            // Update cache
            const currentAnalytics = new Map(get().tokenAnalytics)
            currentAnalytics.set(`${tokenAddress}-${period}`, analytics)
            
            set({ 
              tokenAnalytics: currentAnalytics,
              isLoading: false 
            })
          } else {
            set({ 
              error: response.error || 'Failed to fetch token analytics', 
              isLoading: false 
            })
          }
        } catch (error) {
          set({ 
            error: 'Failed to fetch token analytics', 
            isLoading: false 
          })
        }
      },

      // Update chart data
      updateChartData: (chartType: 'volume' | 'tvl' | 'users' | 'fees', data: ChartData[]) => {
        switch (chartType) {
          case 'volume':
            set({ volumeChart: data })
            break
          case 'tvl':
            set({ tvlChart: data })
            break
          case 'users':
            set({ usersChart: data })
            break
          case 'fees':
            set({ feesChart: data })
            break
        }
      },

      // Reset store
      reset: () => {
        set({
          platformStats: null,
          systemHealth: null,
          tokenAnalytics: new Map(),
          volumeChart: [],
          tvlChart: [],
          usersChart: [],
          feesChart: [],
          isLoading: false,
          error: null,
          lastUpdated: null
        })
      }
    }),
    {
      name: 'analytics-storage',
      partialize: (state) => ({
        platformStats: state.platformStats,
        lastUpdated: state.lastUpdated,
        // Don't persist charts or analytics cache
      })
    }
  )
)

export default AnalyticsState