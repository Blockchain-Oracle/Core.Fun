import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '@/lib/api-client'

export interface StakingTier {
  name: string
  minStake: number
  feeDiscount: number
  maxAlerts: number
  copyTradeSlots: number
  apiAccess: boolean
  apy: number
  benefits?: string[]
}

export interface StakingStatus {
  stakedAmount: string
  tier: string
  tierName: string
  pendingRewards: string
  totalClaimed: string
  apy: number
  feeDiscount: number
  lastStakedAt: Date
  lastClaimedAt: Date
  canUnstake: boolean
  cooldownEnd?: Date
}

export interface StakingHistory {
  type: 'stake' | 'unstake' | 'claim'
  amount: string
  txHash: string
  timestamp: number
  blockNumber: number
}

export interface StakingStats {
  totalStaked: string
  totalStakers: number
  totalRewardsPaid: string
  averageApy: number
  platformToken: string
  tierDistribution: Record<string, number>
}

interface StakingState {
  // State
  status: StakingStatus | null
  history: StakingHistory[]
  stats: StakingStats | null
  isLoading: boolean
  error: string | null
  
  // Tier configuration
  tiers: StakingTier[]
  
  // Actions
  fetchStatus: (walletAddress: string) => Promise<void>
  fetchHistory: (walletAddress: string, limit?: number) => Promise<void>
  fetchStats: () => Promise<void>
  fetchTiers: () => Promise<void>
  stake: (amount: string) => Promise<void>
  unstake: (amount: string) => Promise<void>
  claimRewards: () => Promise<void>
  reset: () => void
}

// Default tier configuration (will be overridden by backend)
const DEFAULT_TIERS: StakingTier[] = [
  {
    name: 'Free',
    minStake: 0,
    feeDiscount: 0,
    maxAlerts: 5,
    copyTradeSlots: 0,
    apiAccess: false,
    apy: 0
  },
  {
    name: 'Bronze',
    minStake: 1000,
    feeDiscount: 1,
    maxAlerts: 10,
    copyTradeSlots: 1,
    apiAccess: false,
    apy: 10
  },
  {
    name: 'Silver',
    minStake: 5000,
    feeDiscount: 2,
    maxAlerts: 25,
    copyTradeSlots: 3,
    apiAccess: false,
    apy: 15
  },
  {
    name: 'Gold',
    minStake: 10000,
    feeDiscount: 3,
    maxAlerts: 50,
    copyTradeSlots: 5,
    apiAccess: true,
    apy: 20
  },
  {
    name: 'Platinum',
    minStake: 50000,
    feeDiscount: 5,
    maxAlerts: -1,
    copyTradeSlots: 10,
    apiAccess: true,
    apy: 25
  }
]

export const useStakingStore = create<StakingState>()(
  persist(
    (set, get) => ({
      // Initial state
      status: null,
      history: [],
      stats: null,
      isLoading: false,
      error: null,
      tiers: DEFAULT_TIERS,

      // Fetch staking status
      fetchStatus: async (walletAddress: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getStakingStatus(walletAddress)
          if (response.success && response.data) {
            set({ 
              status: response.data,
              isLoading: false 
            })
          } else {
            set({ error: response.error || 'Failed to fetch staking status', isLoading: false })
          }
        } catch (error) {
          set({ error: 'Failed to fetch staking status', isLoading: false })
        }
      },

      // Fetch staking history
      fetchHistory: async (walletAddress: string, limit: number = 50) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getStakingHistory(walletAddress, limit)
          if (response.success && response.data) {
            set({ history: response.data, isLoading: false })
          } else {
            set({ error: response.error || 'Failed to fetch staking history', isLoading: false })
          }
        } catch (error) {
          set({ error: 'Failed to fetch staking history', isLoading: false })
        }
      },

      // Fetch staking stats
      fetchStats: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.getStakingStats()
          if (response.success && response.data) {
            set({ stats: response.data, isLoading: false })
          } else {
            set({ error: response.error || 'Failed to fetch stats', isLoading: false })
          }
        } catch (error) {
          set({ error: 'Failed to fetch stats', isLoading: false })
        }
      },

      // Fetch tier configuration
      fetchTiers: async () => {
        try {
          const response = await apiClient.getStakingTiers()
          if (response.success && response.data) {
            set({ tiers: response.data })
          }
        } catch (error) {
          console.error('Failed to fetch tiers, using defaults:', error)
        }
      },

      // Stake tokens
      stake: async (amount: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.stake(amount)
          if (response.success) {
            set({ isLoading: false })
            // Refresh status after staking
            const walletAddress = get().status?.stakedAmount ? localStorage.getItem('walletAddress') : null
            if (walletAddress) {
              await get().fetchStatus(walletAddress)
            }
          } else {
            throw new Error(response.error || 'Failed to stake tokens')
          }
        } catch (error: any) {
          set({ error: error.message || 'Failed to stake tokens', isLoading: false })
          throw error
        }
      },

      // Unstake tokens
      unstake: async (amount: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.unstake(amount)
          if (response.success) {
            set({ isLoading: false })
            // Refresh status after unstaking
            const walletAddress = localStorage.getItem('walletAddress')
            if (walletAddress) {
              await get().fetchStatus(walletAddress)
            }
          } else {
            throw new Error(response.error || 'Failed to unstake tokens')
          }
        } catch (error: any) {
          set({ error: error.message || 'Failed to unstake tokens', isLoading: false })
          throw error
        }
      },

      // Claim rewards
      claimRewards: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiClient.claimRewards()
          if (response.success) {
            // Update local state - reset pending rewards
            const currentStatus = get().status
            if (currentStatus) {
              set({
                status: {
                  ...currentStatus,
                  pendingRewards: '0'
                },
                isLoading: false
              })
            }
            // Refresh status after claiming
            const walletAddress = localStorage.getItem('walletAddress')
            if (walletAddress) {
              await get().fetchStatus(walletAddress)
            }
          } else {
            throw new Error(response.error || 'Failed to claim rewards')
          }
        } catch (error: any) {
          set({ error: error.message || 'Failed to claim rewards', isLoading: false })
          throw error
        }
      },

      // Reset store
      reset: () => {
        set({
          status: null,
          history: [],
          stats: null,
          isLoading: false,
          error: null,
          tiers: DEFAULT_TIERS
        })
      }
    }),
    {
      name: 'staking-storage',
      partialize: (state) => ({
        status: state.status,
        history: state.history.slice(0, 10), // Only persist last 10 history items
        stats: state.stats,
        tiers: state.tiers
      })
    }
  )
)

export default StakingState