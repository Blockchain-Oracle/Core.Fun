import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '@/lib/api-client'

export interface TreasuryStats {
  totalCollected: string
  totalDistributed: string
  pendingDistribution: string
  lastDistribution: number
  nextDistribution: number
  feeBreakdown: {
    creation: string
    trading: string
    graduation: string
  }
  distributionHistory: Array<{
    amount: string
    timestamp: number
    txHash: string
    recipients: number
  }>
}

export interface TreasuryHistoryItem {
  type: 'collection' | 'distribution'
  amount: string
  source?: string
  txHash: string
  timestamp: number
  blockNumber: number
}

export interface FeeStructure {
  creationFee: number // in CORE
  tradingFee: number // percentage
  graduationFee: number // percentage
  stakingDiscounts: {
    bronze: number
    silver: number
    gold: number
    platinum: number
  }
}

interface TreasuryState {
  // State
  stats: TreasuryStats | null
  history: TreasuryHistoryItem[]
  feeStructure: FeeStructure
  isLoading: boolean
  error: string | null
  
  // Actions
  fetchStats: () => Promise<void>
  fetchHistory: (limit?: number) => Promise<void>
  calculateFee: (
    operation: 'creation' | 'trading' | 'graduation',
    amount: number,
    stakingTier?: string
  ) => number
  reset: () => void
}

// Default fee structure
const DEFAULT_FEE_STRUCTURE: FeeStructure = {
  creationFee: 0.1, // 0.1 CORE
  tradingFee: 1, // 1%
  graduationFee: 2, // 2%
  stakingDiscounts: {
    bronze: 1,
    silver: 2,
    gold: 3,
    platinum: 5
  }
}

export const useTreasuryStore = create<TreasuryState>()(
  persist(
    (set, get) => ({
      // Initial state
      stats: null,
      history: [],
      feeStructure: DEFAULT_FEE_STRUCTURE,
      isLoading: false,
      error: null,

      // Fetch treasury statistics
      fetchStats: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getTreasuryStats()
          if (response.success && response.data) {
            set({ 
              stats: {
                totalCollected: response.data.totalCollected,
                totalDistributed: response.data.totalDistributed,
                pendingDistribution: response.data.pendingDistribution,
                lastDistribution: response.data.lastDistribution ? new Date(response.data.lastDistribution).getTime() : 0,
                nextDistribution: response.data.nextDistribution ? new Date(response.data.nextDistribution).getTime() : 0,
                feeBreakdown: {
                  creation: '0',
                  trading: '0',
                  graduation: '0'
                },
                distributionHistory: response.data.distributions?.map((d: any) => ({
                  amount: d.amount,
                  timestamp: new Date(d.timestamp).getTime(),
                  txHash: d.txHash,
                  recipients: d.recipients
                })) || []
              },
              isLoading: false 
            })
          } else {
            set({ 
              error: response.error || 'Failed to fetch treasury stats', 
              isLoading: false 
            })
          }
        } catch (error) {
          set({ 
            error: 'Failed to fetch treasury stats', 
            isLoading: false 
          })
        }
      },

      // Fetch treasury history
      fetchHistory: async (limit: number = 50) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getTreasuryHistory(limit)
          if (response.success && response.data) {
            set({ 
              history: response.data.map((item: any) => ({
                type: item.type,
                amount: item.amount,
                source: item.source,
                txHash: item.txHash,
                timestamp: new Date(item.timestamp).getTime(),
                blockNumber: 0
              })),
              isLoading: false 
            })
          } else {
            set({ 
              error: response.error || 'Failed to fetch treasury history', 
              isLoading: false 
            })
          }
        } catch (error) {
          set({ 
            error: 'Failed to fetch treasury history', 
            isLoading: false 
          })
        }
      },

      // Calculate fee with staking discount
      calculateFee: (
        operation: 'creation' | 'trading' | 'graduation',
        amount: number,
        stakingTier?: string
      ): number => {
        const { feeStructure } = get()
        
        let baseFee: number
        switch (operation) {
          case 'creation':
            baseFee = feeStructure.creationFee
            break
          case 'trading':
            baseFee = amount * (feeStructure.tradingFee / 100)
            break
          case 'graduation':
            baseFee = amount * (feeStructure.graduationFee / 100)
            break
          default:
            baseFee = 0
        }

        // Apply staking discount
        if (stakingTier && stakingTier.toLowerCase() !== 'free') {
          const tierLower = stakingTier.toLowerCase() as keyof typeof feeStructure.stakingDiscounts
          const discount = feeStructure.stakingDiscounts[tierLower] || 0
          baseFee = baseFee * (1 - discount / 100)
        }

        return baseFee
      },

      // Reset store
      reset: () => {
        set({
          stats: null,
          history: [],
          isLoading: false,
          error: null
        })
      }
    }),
    {
      name: 'treasury-storage',
      partialize: (state) => ({
        stats: state.stats,
        history: state.history.slice(0, 20), // Only persist last 20 history items
        feeStructure: state.feeStructure
      })
    }
  )
)

export default TreasuryState