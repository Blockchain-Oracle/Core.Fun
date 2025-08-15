import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { telegramAuth, AuthSession, AuthUser, WalletService, WalletInfo } from '@/lib/auth'

interface AuthState {
  // State
  user: AuthUser | null
  session: AuthSession | null
  wallet: WalletInfo | null
  walletService: WalletService | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (initData: string) => Promise<boolean>
  logout: () => void
  refreshSession: () => Promise<boolean>
  refreshWallet: () => Promise<void>
  initializeAuth: () => Promise<void>
  generateAuthUrl: (returnUrl?: string) => Promise<string>
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      user: null,
      session: null,
      wallet: null,
      walletService: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Initialize auth on app load
      initializeAuth: async () => {
        set((state) => {
          state.isLoading = true
          state.error = null
        })

        try {
          const currentSession = telegramAuth.getCurrentSession()
          
          if (currentSession) {
            // Check if session is still valid
            const timeUntilExpiry = currentSession.expiresAt - Date.now()
            
            if (timeUntilExpiry <= 0) {
              // Session expired, clear it
              telegramAuth.logout()
              set((state) => {
                state.session = null
                state.user = null
                state.walletService = null
                state.wallet = null
                state.isAuthenticated = false
                state.isLoading = false
              })
              return
            }
            
            const ws = new WalletService(currentSession)
            
            // Try to get wallet info, but don't fail if it returns null
            let walletInfo = null
            try {
              walletInfo = await ws.getWalletInfo()
            } catch (error) {
              console.log('Could not fetch wallet info during init, will retry later')
            }
            
            set((state) => {
              state.session = currentSession
              state.user = currentSession.user
              state.walletService = ws
              state.wallet = walletInfo
              state.isAuthenticated = true
            })

            // Update wallet store with the fetched balance if we got wallet info
            if (walletInfo) {
              const { useWalletStore } = await import('./wallet.store')
              useWalletStore.getState().refreshBalance()
            }

            // Setup auto-refresh
            const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000)
            
            setTimeout(() => {
              get().refreshSession()
            }, refreshTime)
          }
        } catch (error) {
          console.error('Failed to initialize auth:', error)
          // Clear any invalid session
          telegramAuth.logout()
          set((state) => {
            state.session = null
            state.user = null
            state.walletService = null
            state.wallet = null
            state.isAuthenticated = false
            state.error = null // Don't show error for initialization failures
          })
        } finally {
          set((state) => {
            state.isLoading = false
          })
        }
      },

      // Login with Telegram
      login: async (initData: string) => {
        set((state) => {
          state.isLoading = true
          state.error = null
        })

        try {
          const result = await telegramAuth.loginWithTelegram(initData)
          
          if (result.success && result.session) {
            const ws = new WalletService(result.session)
            const walletInfo = await ws.getWalletInfo()
            
            set((state) => {
              state.session = result.session
              state.user = result.session.user
              state.walletService = ws
              state.wallet = walletInfo
              state.isAuthenticated = true
              state.isLoading = false
            })

            // Update wallet store with the fetched balance
            if (walletInfo) {
              const { useWalletStore } = await import('./wallet.store')
              useWalletStore.getState().refreshBalance()
            }

            // Setup auto-refresh
            const timeUntilExpiry = result.session.expiresAt - Date.now()
            const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000)
            
            setTimeout(() => {
              get().refreshSession()
            }, refreshTime)

            return true
          } else {
            set((state) => {
              state.error = result.error || 'Login failed'
              state.isLoading = false
            })
            return false
          }
        } catch (error) {
          set((state) => {
            state.error = error instanceof Error ? error.message : 'Login failed'
            state.isLoading = false
          })
          return false
        }
      },

      // Logout
      logout: () => {
        telegramAuth.logout()
        set((state) => {
          state.user = null
          state.session = null
          state.wallet = null
          state.walletService = null
          state.isAuthenticated = false
          state.error = null
        })
      },

      // Refresh session
      refreshSession: async () => {
        try {
          const success = await telegramAuth.refreshSession()
          if (success) {
            const newSession = telegramAuth.getCurrentSession()
            set((state) => {
              state.session = newSession
              state.user = newSession?.user || null
            })

            // Setup next refresh
            if (newSession) {
              const timeUntilExpiry = newSession.expiresAt - Date.now()
              const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000)
              
              setTimeout(() => {
                get().refreshSession()
              }, refreshTime)
            }

            return true
          } else {
            // Session refresh failed, logout
            get().logout()
            return false
          }
        } catch (error) {
          console.error('Session refresh failed:', error)
          get().logout()
          return false
        }
      },

      // Refresh wallet info
      refreshWallet: async () => {
        const { walletService } = get()
        if (!walletService) return

        try {
          const walletInfo = await walletService.getWalletInfo()
          set((state) => {
            state.wallet = walletInfo
          })
        } catch (error) {
          console.error('Failed to refresh wallet:', error)
          set((state) => {
            state.error = 'Failed to refresh wallet'
          })
        }
      },

      // Generate auth URL
      generateAuthUrl: async (returnUrl?: string) => {
        return telegramAuth.generateAuthUrl(returnUrl)
      },

      // Error handling
      setError: (error: string | null) => {
        set((state) => {
          state.error = error
        })
      },

      clearError: () => {
        set((state) => {
          state.error = null
        })
      }
    })),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        // Only persist session data, not wallet service instance
        session: state.session,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

export default AuthState