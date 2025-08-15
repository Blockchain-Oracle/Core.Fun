import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { apiClient } from '@/lib/api-client'

interface TokenHolding {
  tokenAddress: string
  symbol: string
  name: string
  balance: string
  averageCost: number
  currentPrice: number
  value: number
  pnl: number
  pnlPercentage: number
  trades: number
  // Aliases for compatibility
  tokenSymbol?: string
  tokenName?: string
}

interface PortfolioStats {
  totalValue: number
  totalCost: number
  totalPnl: number
  totalPnlPercentage: number
  winRate: number
  bestPerformer: TokenHolding | null
  worstPerformer: TokenHolding | null
}

interface PnLHistory {
  timestamp: number
  value: number
  pnl: number
}

interface PortfolioState {
  // Holdings
  holdings: TokenHolding[]
  stats: PortfolioStats | null
  
  // P&L History
  pnlHistory: PnLHistory[]
  
  // Summary properties (computed from stats)
  totalValue?: number
  totalPnL?: number
  pnlPercentage?: number
  
  // Loading states
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  
  // Actions
  fetchPortfolio: () => Promise<void>
  refreshPrices: () => Promise<void>
  fetchPnLHistory: (days: number) => Promise<void>
  updateHoldingPrice: (tokenAddress: string, price: number) => void
  removeHolding: (tokenAddress: string) => void
  calculateStats: () => void
}

export const usePortfolioStore = create<PortfolioState>()(
  immer((set, get) => ({
    // Initial state
    holdings: [],
    stats: null,
    pnlHistory: [],
    isLoading: false,
    isRefreshing: false,
    error: null,

    // Fetch portfolio
    fetchPortfolio: async () => {
      set((state) => {
        state.isLoading = true
        state.error = null
      })

      try {
        const response = await apiClient.getPortfolio()

        if (response.success && response.data) {
          set((state) => {
            state.holdings = response.data.holdings.map((h: any) => ({
              tokenAddress: h.tokenAddress,
              symbol: h.symbol,
              name: h.name,
              balance: h.balance,
              averageCost: h.averageCost,
              currentPrice: h.currentPrice,
              value: parseFloat(h.balance) * h.currentPrice,
              pnl: (parseFloat(h.balance) * h.currentPrice) - (parseFloat(h.balance) * h.averageCost),
              pnlPercentage: ((h.currentPrice - h.averageCost) / h.averageCost) * 100,
              trades: h.trades,
              // Add aliases
              tokenSymbol: h.symbol,
              tokenName: h.name
            }))
          })
          
          // Calculate stats
          get().calculateStats()
        }
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to fetch portfolio'
        })
      } finally {
        set((state) => {
          state.isLoading = false
        })
      }
    },

    // Refresh prices
    refreshPrices: async () => {
      const { holdings } = get()
      if (holdings.length === 0) return

      set((state) => {
        state.isRefreshing = true
      })

      try {
        // Fetch current prices for all holdings
        const addresses = holdings.map(h => h.tokenAddress)
        const prices = await Promise.all(
          addresses.map(addr => apiClient.getTokenPrice(addr))
        )

        set((state) => {
          prices.forEach((response, index) => {
            if (response.success && response.data) {
              const holding = state.holdings[index]
              holding.currentPrice = response.data.price
              holding.value = parseFloat(holding.balance) * response.data.price
              holding.pnl = holding.value - (parseFloat(holding.balance) * holding.averageCost)
              holding.pnlPercentage = ((response.data.price - holding.averageCost) / holding.averageCost) * 100
            }
          })
        })

        // Recalculate stats
        get().calculateStats()
      } catch (error) {
        console.error('Failed to refresh prices:', error)
      } finally {
        set((state) => {
          state.isRefreshing = false
        })
      }
    },

    // Fetch P&L history
    fetchPnLHistory: async (days) => {
      try {
        const response = await apiClient.getPnLHistory(days)

        if (response.success && response.data) {
          set((state) => {
            state.pnlHistory = response.data.map((point: any) => ({
              timestamp: point.timestamp,
              value: point.value,
              pnl: point.pnl
            }))
          })
        }
      } catch (error) {
        console.error('Failed to fetch P&L history:', error)
      }
    },

    // Update holding price (from WebSocket)
    updateHoldingPrice: (tokenAddress, price) => {
      set((state) => {
        const holding = state.holdings.find(h => h.tokenAddress === tokenAddress)
        if (holding) {
          holding.currentPrice = price
          holding.value = parseFloat(holding.balance) * price
          holding.pnl = holding.value - (parseFloat(holding.balance) * holding.averageCost)
          holding.pnlPercentage = ((price - holding.averageCost) / holding.averageCost) * 100
        }
      })
      
      // Recalculate stats
      get().calculateStats()
    },

    // Remove holding (after selling all)
    removeHolding: (tokenAddress) => {
      set((state) => {
        const index = state.holdings.findIndex(h => h.tokenAddress === tokenAddress)
        if (index > -1) {
          state.holdings.splice(index, 1)
        }
      })
      
      // Recalculate stats
      get().calculateStats()
    },

    // Calculate portfolio stats
    calculateStats: () => {
      const { holdings } = get()
      
      if (holdings.length === 0) {
        set((state) => {
          state.stats = null
        })
        return
      }

      const totalValue = holdings.reduce((sum, h) => sum + h.value, 0)
      const totalCost = holdings.reduce((sum, h) => sum + (parseFloat(h.balance) * h.averageCost), 0)
      const totalPnl = totalValue - totalCost
      const totalPnlPercentage = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
      
      const winners = holdings.filter(h => h.pnl > 0)
      const winRate = (winners.length / holdings.length) * 100
      
      const bestPerformer = holdings.reduce((best, current) => 
        (!best || current.pnlPercentage > best.pnlPercentage) ? current : best
      , null as TokenHolding | null)
      
      const worstPerformer = holdings.reduce((worst, current) => 
        (!worst || current.pnlPercentage < worst.pnlPercentage) ? current : worst
      , null as TokenHolding | null)

      set((state) => {
        state.stats = {
          totalValue,
          totalCost,
          totalPnl,
          totalPnlPercentage,
          winRate,
          bestPerformer,
          worstPerformer
        }
        // Also set summary properties
        state.totalValue = totalValue
        state.totalPnL = totalPnl
        state.pnlPercentage = totalPnlPercentage
      })
    }
  }))
)

export default PortfolioState