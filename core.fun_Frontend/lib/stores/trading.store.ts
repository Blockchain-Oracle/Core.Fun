import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface TradingSettings {
  defaultBuyAmount: string
  defaultSellPercentage: number
  slippageTolerance: number
  gasPrice: 'slow' | 'standard' | 'fast'
  autoApprove: boolean
  mevProtection: boolean
}

interface TokenWatchItem {
  address: string
  symbol: string
  name: string
  targetPrice?: number
  alertOnLaunch?: boolean
  autoSnipe?: boolean
  snipeAmount?: string
}

interface Trade {
  id: string
  tokenAddress: string
  tokenSymbol: string
  type: 'buy' | 'sell'
  amount: string
  price: string
  total: string
  timestamp: number
  txHash: string
  status: 'pending' | 'success' | 'failed'
}

interface TradingState {
  // User Settings (Persistent)
  settings: TradingSettings
  
  // Favorites & Watchlist (Persistent)
  favoriteTokens: string[]
  watchlist: TokenWatchItem[]
  
  // Active Trading State
  selectedToken: string | null
  activeQuote: any | null
  tradeHistory: Trade[]
  pendingTrades: Trade[]
  
  // Actions
  updateSettings: (settings: Partial<TradingSettings>) => void
  addFavorite: (tokenAddress: string) => void
  removeFavorite: (tokenAddress: string) => void
  isFavorite: (tokenAddress: string) => boolean
  addToWatchlist: (item: TokenWatchItem) => void
  removeFromWatchlist: (address: string) => void
  updateWatchlistItem: (address: string, updates: Partial<TokenWatchItem>) => void
  setSelectedToken: (address: string | null) => void
  setActiveQuote: (quote: any) => void
  addTrade: (trade: Trade) => void
  updateTradeStatus: (id: string, status: 'success' | 'failed') => void
  clearPendingTrades: () => void
}

export const useTradingStore = create<TradingState>()(
  persist(
    immer((set, get) => ({
      // Default settings
      settings: {
        defaultBuyAmount: '0.1',
        defaultSellPercentage: 50,
        slippageTolerance: 5,
        gasPrice: 'standard',
        autoApprove: true,
        mevProtection: false
      },
      
      // Empty initial state
      favoriteTokens: [],
      watchlist: [],
      selectedToken: null,
      activeQuote: null,
      tradeHistory: [],
      pendingTrades: [],

      // Update settings
      updateSettings: (newSettings) => {
        set((state) => {
          state.settings = { ...state.settings, ...newSettings }
        })
      },

      // Favorites management
      addFavorite: (tokenAddress) => {
        set((state) => {
          if (!state.favoriteTokens.includes(tokenAddress)) {
            state.favoriteTokens.push(tokenAddress)
          }
        })
      },

      removeFavorite: (tokenAddress) => {
        set((state) => {
          const index = state.favoriteTokens.indexOf(tokenAddress)
          if (index > -1) {
            state.favoriteTokens.splice(index, 1)
          }
        })
      },

      isFavorite: (tokenAddress) => {
        return get().favoriteTokens.includes(tokenAddress)
      },

      // Watchlist management
      addToWatchlist: (item) => {
        set((state) => {
          const exists = state.watchlist.find(w => w.address === item.address)
          if (!exists) {
            state.watchlist.push(item)
          }
        })
      },

      removeFromWatchlist: (address) => {
        set((state) => {
          const index = state.watchlist.findIndex(w => w.address === address)
          if (index > -1) {
            state.watchlist.splice(index, 1)
          }
        })
      },

      updateWatchlistItem: (address, updates) => {
        set((state) => {
          const item = state.watchlist.find(w => w.address === address)
          if (item) {
            Object.assign(item, updates)
          }
        })
      },

      // Trading state
      setSelectedToken: (address) => {
        set((state) => {
          state.selectedToken = address
          state.activeQuote = null
        })
      },

      setActiveQuote: (quote) => {
        set((state) => {
          state.activeQuote = quote
        })
      },

      // Trade history
      addTrade: (trade) => {
        set((state) => {
          if (trade.status === 'pending') {
            state.pendingTrades.push(trade)
          } else {
            state.tradeHistory.unshift(trade)
            // Keep only last 100 trades
            if (state.tradeHistory.length > 100) {
              state.tradeHistory = state.tradeHistory.slice(0, 100)
            }
          }
        })
      },

      updateTradeStatus: (id, status) => {
        set((state) => {
          const pendingIndex = state.pendingTrades.findIndex(t => t.id === id)
          if (pendingIndex > -1) {
            const trade = state.pendingTrades[pendingIndex]
            trade.status = status
            
            // Move to history
            state.tradeHistory.unshift(trade)
            state.pendingTrades.splice(pendingIndex, 1)
            
            // Keep only last 100 trades
            if (state.tradeHistory.length > 100) {
              state.tradeHistory = state.tradeHistory.slice(0, 100)
            }
          }
        })
      },

      clearPendingTrades: () => {
        set((state) => {
          state.pendingTrades = []
        })
      }
    })),
    {
      name: 'trading-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist settings, favorites, watchlist, and trade history
        settings: state.settings,
        favoriteTokens: state.favoriteTokens,
        watchlist: state.watchlist,
        tradeHistory: state.tradeHistory
      })
    }
  )
)

export default TradingState