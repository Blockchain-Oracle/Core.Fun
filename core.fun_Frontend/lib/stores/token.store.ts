import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { apiClient, TokenData } from '@/lib/api'

interface TokenFilters {
  status: 'all' | 'new' | 'graduating' | 'graduated'
  minMarketCap: number
  maxMarketCap: number
  minLiquidity: number
  hideRugged: boolean
  sortBy: 'marketCap' | 'volume' | 'age' | 'holders' | 'price' | 'change24h'
  sortOrder: 'asc' | 'desc'
}

interface PriceUpdate {
  price: number
  change1h: number
  change24h: number
  volume24h: number
  marketCap: number
  timestamp: number
}

interface TokenState {
  // Token Lists
  allTokens: TokenData[]
  trendingTokens: TokenData[]
  newTokens: TokenData[]
  graduatedTokens: TokenData[]
  
  // Filters & Sorting (Persistent)
  filters: TokenFilters
  
  // Search
  searchQuery: string
  searchResults: TokenData[]
  
  // Real-time Updates
  priceUpdates: Map<string, PriceUpdate>
  subscribedTokens: Set<string>
  
  // Loading states
  isLoading: boolean
  isSearching: boolean
  error: string | null
  
  // Pagination
  hasMore: boolean
  total: number
  page: number
  
  // Actions
  fetchTokens: (options?: { reset?: boolean }) => Promise<void>
  fetchTrendingTokens: () => Promise<void>
  updateFilters: (filters: Partial<TokenFilters>) => void
  resetFilters: () => void
  searchTokens: (query: string) => Promise<void>
  clearSearch: () => void
  subscribeToToken: (address: string) => void
  unsubscribeFromToken: (address: string) => void
  updateTokenPrice: (address: string, update: PriceUpdate) => void
  addNewToken: (token: TokenData) => void
  updateToken: (address: string, updates: Partial<TokenData>) => void
}

const defaultFilters: TokenFilters = {
  status: 'all',
  minMarketCap: 0,
  maxMarketCap: Number.MAX_SAFE_INTEGER,
  minLiquidity: 0,
  hideRugged: true,
  sortBy: 'marketCap',
  sortOrder: 'desc'
}

export const useTokenStore = create<TokenState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      allTokens: [],
      trendingTokens: [],
      newTokens: [],
      graduatedTokens: [],
      filters: defaultFilters,
      searchQuery: '',
      searchResults: [],
      priceUpdates: new Map(),
      subscribedTokens: new Set(),
      isLoading: false,
      isSearching: false,
      error: null,
      hasMore: false,
      total: 0,
      page: 1,

      // Fetch tokens (client-side filtering/sorting)
      fetchTokens: async (options = {}) => {
        const { filters } = get()

        set((state) => {
          state.isLoading = true
          state.error = null
          if (options.reset) {
            state.page = 1
            state.allTokens = []
          }
        })

        try {
          const response = await apiClient.getTokens()

          if (response.success) {
            // Build working list - handle both response structures
            const incoming = response.tokens || response.data?.tokens || []

            // Apply filters client-side
            const filtered = incoming.filter((t) => {
              // Status filter
              if (filters.status === 'new' && t.status !== 'CREATED') return false
              if (filters.status === 'graduated' && !(t.status === 'GRADUATED' || t.status === 'LAUNCHED')) return false
              if (filters.status === 'graduating') {
                const progressPct = ((t.liquidity || 0) / 250) * 100
                if (!(t.status === 'CREATED' && progressPct >= 80)) return false
              }

              // Rug/honeypot filter
              if (filters.hideRugged && t.isHoneypot) return false

              // Market cap / liquidity ranges
              if (typeof t.marketCap === 'number') {
                if (t.marketCap < (filters.minMarketCap || 0)) return false
                if (filters.maxMarketCap !== Number.MAX_SAFE_INTEGER && t.marketCap > filters.maxMarketCap) return false
              }
              if (typeof t.liquidity === 'number' && t.liquidity < (filters.minLiquidity || 0)) return false

              return true
            })

            // Sort
            const sortBy = filters.sortBy
            const order = filters.sortOrder
            filtered.sort((a: any, b: any) => {
              const av = a?.[sortBy] ?? 0
              const bv = b?.[sortBy] ?? 0
              const cmp = av > bv ? 1 : av < bv ? -1 : 0
              return order === 'asc' ? cmp : -cmp
            })

            set((state) => {
              if (options.reset) {
                state.allTokens = filtered
              } else {
                state.allTokens.push(...filtered)
              }
              state.total = filtered.length
              state.hasMore = false
              state.page += 1

              // Update categorized lists
              console.log('All tokens status values:', state.allTokens.map(t => ({ address: t.address, status: t.status })))
              // For now, show all tokens in different categories based on graduation percentage
              const lowProgress = state.allTokens.filter(t => t.graduationPercentage < 50)
              const highProgress = state.allTokens.filter(t => t.graduationPercentage >= 50 && t.graduationPercentage < 100)
              const graduated = state.allTokens.filter(t => t.status === 'GRADUATED' || t.status === 'LAUNCHED')
              
              state.newTokens = lowProgress.length > 0 ? lowProgress : state.allTokens.slice(0, 1)  // Show at least one
              state.graduatedTokens = graduated
              console.log('New tokens:', state.newTokens.length, 'Graduated:', state.graduatedTokens.length)
            })
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Failed to fetch tokens'
          })
        } finally {
          set((state) => {
            state.isLoading = false
          })
        }
      },

      // Fetch trending tokens
      fetchTrendingTokens: async () => {
        try {
          const response = await apiClient.getTokens()
          if (response.success) {
            const tokens = [...(response.tokens || response.data?.tokens || [])]
            tokens.sort((a: any, b: any) => (b.volume24h || 0) - (a.volume24h || 0))
            set((state) => {
              state.trendingTokens = tokens.slice(0, 10)
            })
          }
        } catch (error) {
          console.error('Failed to fetch trending tokens:', error)
        }
      },

      // Update filters
      updateFilters: (newFilters) => {
        set((state) => {
          state.filters = { ...state.filters, ...newFilters }
        })
        // Refetch with new filters
        get().fetchTokens({ reset: true })
      },

      // Reset filters
      resetFilters: () => {
        set((state) => {
          state.filters = defaultFilters
        })
        get().fetchTokens({ reset: true })
      },

      // Search tokens
      searchTokens: async (query) => {
        if (!query.trim()) {
          get().clearSearch()
          return
        }

        set((state) => {
          state.searchQuery = query
          state.isSearching = true
        })

        try {
          const response = await apiClient.searchTokens(query)

          if (response.success && response.data) {
            set((state) => {
              state.searchResults = response.data
            })
          }
        } catch (error) {
          console.error('Search failed:', error)
        } finally {
          set((state) => {
            state.isSearching = false
          })
        }
      },

      // Clear search
      clearSearch: () => {
        set((state) => {
          state.searchQuery = ''
          state.searchResults = []
        })
      },

      // Subscribe to token updates
      subscribeToToken: (address) => {
        set((state) => {
          state.subscribedTokens.add(address)
        })
      },

      // Unsubscribe from token
      unsubscribeFromToken: (address) => {
        set((state) => {
          state.subscribedTokens.delete(address)
        })
      },

      // Update token price
      updateTokenPrice: (address, update) => {
        set((state) => {
          state.priceUpdates.set(address, update)
          
          // Update token in lists
          const updateTokenInList = (token: TokenData) => {
            if (token.address === address) {
              token.price = update.price
              token.priceChange24h = update.change24h
              token.volume24h = update.volume24h
              token.marketCap = update.marketCap
            }
            return token
          }
          
          state.allTokens = state.allTokens.map(updateTokenInList)
          state.trendingTokens = state.trendingTokens.map(updateTokenInList)
          state.newTokens = state.newTokens.map(updateTokenInList)
          state.graduatedTokens = state.graduatedTokens.map(updateTokenInList)
          state.searchResults = state.searchResults.map(updateTokenInList)
        })
      },

      // Add new token
      addNewToken: (token) => {
        set((state) => {
          // Add to beginning of list
          state.allTokens.unshift(token)
          state.total += 1
          
          // Add to appropriate category
          if (token.status === 'CREATED') {
            state.newTokens.unshift(token)
          } else if (token.status === 'GRADUATED') {
            state.graduatedTokens.unshift(token)
          }
        })
      },

      // Update token
      updateToken: (address, updates) => {
        set((state) => {
          const updateInList = (tokens: TokenData[]) => {
            const index = tokens.findIndex(t => t.address === address)
            if (index > -1) {
              Object.assign(tokens[index], updates)
            }
          }
          
          updateInList(state.allTokens)
          updateInList(state.trendingTokens)
          updateInList(state.newTokens)
          updateInList(state.graduatedTokens)
          updateInList(state.searchResults)
        })
      }
    })),
    {
      name: 'token-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist filters
        filters: state.filters
      })
    }
  )
)

export default TokenState