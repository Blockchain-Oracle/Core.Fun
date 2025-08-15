import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { useAuthStore } from './auth.store'

interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  type: 'send' | 'receive' | 'buy' | 'sell'
  token?: {
    address: string
    symbol: string
    name: string
  }
}

interface WalletState {
  // Balances
  coreBalance: string
  usdBalance: string
  tokenBalances: Map<string, { balance: string; value: string }>
  
  // Transactions
  transactions: Transaction[]
  pendingTransactions: Transaction[]
  
  // Loading states
  isLoadingBalance: boolean
  isLoadingTransactions: boolean
  
  // Actions
  refreshBalance: () => Promise<void>
  refreshTransactions: () => Promise<void>
  sendToken: (to: string, amount: string, tokenAddress?: string) => Promise<{ success: boolean; hash?: string; error?: string }>
  exportPrivateKey: () => Promise<string | null>
  addPendingTransaction: (tx: Transaction) => void
  updateTransactionStatus: (hash: string, status: 'confirmed' | 'failed') => void
}

export const useWalletStore = create<WalletState>()(
  immer((set, get) => ({
    // Initial state
    coreBalance: '0',
    usdBalance: '0',
    tokenBalances: new Map(),
    transactions: [],
    pendingTransactions: [],
    isLoadingBalance: false,
    isLoadingTransactions: false,

    // Refresh balance
    refreshBalance: async () => {
      const authStore = useAuthStore.getState()
      const walletService = authStore.walletService
      
      // Don't try to refresh if not authenticated or no wallet service
      if (!authStore.isAuthenticated || !walletService) {
        set((state) => {
          state.coreBalance = '0'
          state.usdBalance = '0'
          state.tokenBalances = new Map()
        })
        return
      }

      set((state) => {
        state.isLoadingBalance = true
      })

      try {
        const balances = await walletService.getBalance()
        
        set((state) => {
          state.coreBalance = balances.core || '0'
          state.usdBalance = balances.usd || '0'
          
          // Update token balances
          if (balances.tokens) {
            state.tokenBalances = new Map(
              Object.entries(balances.tokens).map(([address, data]: [string, any]) => [
                address,
                { balance: data.balance, value: data.value }
              ])
            )
          }
        })
      } catch (error) {
        console.log('Could not refresh balance:', error)
        // Set default values on error
        set((state) => {
          state.coreBalance = '0'
          state.usdBalance = '0'
          state.tokenBalances = new Map()
        })
      } finally {
        set((state) => {
          state.isLoadingBalance = false
        })
      }
    },

    // Refresh transactions
    refreshTransactions: async () => {
      const authStore = useAuthStore.getState()
      const walletService = authStore.walletService
      
      if (!authStore.isAuthenticated || !walletService) {
        set((state) => {
          state.transactions = []
        })
        return
      }

      set((state) => {
        state.isLoadingTransactions = true
      })

      try {
        const transactions = await walletService.getTransactions()
        
        set((state) => {
          state.transactions = transactions
          
          // Move confirmed transactions from pending
          const confirmedHashes = new Set(transactions.map(tx => tx.hash))
          state.pendingTransactions = state.pendingTransactions.filter(
            tx => !confirmedHashes.has(tx.hash)
          )
        })
      } catch (error) {
        console.log('Could not refresh transactions:', error)
        set((state) => {
          state.transactions = []
        })
      } finally {
        set((state) => {
          state.isLoadingTransactions = false
        })
      }
    },

    // Send token
    sendToken: async (to: string, amount: string, tokenAddress?: string) => {
      const walletService = useAuthStore.getState().walletService
      if (!walletService) {
        return { success: false, error: 'Wallet not connected' }
      }

      try {
        const result = await walletService.sendTransaction(to, amount, tokenAddress)
        
        if (result.success && result.hash) {
          // Add to pending transactions
          get().addPendingTransaction({
            hash: result.hash,
            from: useAuthStore.getState().user?.walletAddress || '',
            to,
            value: amount,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send',
            token: tokenAddress ? {
              address: tokenAddress,
              symbol: 'TOKEN', // Would need to fetch this
              name: 'Token'
            } : undefined
          })

          // Refresh balance after a delay
          setTimeout(() => {
            get().refreshBalance()
            get().refreshTransactions()
          }, 3000)
        }

        return result
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed'
        }
      }
    },

    // Export private key
    exportPrivateKey: async () => {
      const authStore = useAuthStore.getState()
      const walletService = authStore.walletService
      
      if (!authStore.isAuthenticated || !walletService) return null

      try {
        return await walletService.exportPrivateKey()
      } catch (error) {
        console.log('Could not export private key:', error)
        return null
      }
    },

    // Add pending transaction
    addPendingTransaction: (tx: Transaction) => {
      set((state) => {
        state.pendingTransactions.push(tx)
      })
    },

    // Update transaction status
    updateTransactionStatus: (hash: string, status: 'confirmed' | 'failed') => {
      set((state) => {
        const txIndex = state.pendingTransactions.findIndex(tx => tx.hash === hash)
        if (txIndex !== -1) {
          state.pendingTransactions[txIndex].status = status
          
          if (status === 'confirmed') {
            // Move to confirmed transactions
            state.transactions.unshift(state.pendingTransactions[txIndex])
            state.pendingTransactions.splice(txIndex, 1)
          }
        }
      })
    }
  }))
)

export default WalletState