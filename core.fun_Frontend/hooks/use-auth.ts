import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { telegramAuth, AuthSession, AuthUser, WalletService, WalletInfo, TelegramAuth } from '@/lib/auth'

export interface AuthContextType {
  user: AuthUser | null
  session: AuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  wallet: WalletInfo | null
  walletService: WalletService | null
  login: (initData: string) => Promise<boolean>
  logout: () => void
  refreshWallet: () => Promise<void>
  refreshSession: () => Promise<boolean>
  generateAuthUrl: (returnUrl?: string) => Promise<string>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useAuthProvider(): AuthContextType {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [walletService, setWalletService] = useState<WalletService | null>(null)

  const user = session?.user || null
  const isAuthenticated = !!session

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true)
      
      try {
        const currentSession = telegramAuth.getCurrentSession()
        
        if (currentSession) {
          setSession(currentSession)
          
          // Initialize wallet service
          const ws = new WalletService(currentSession)
          setWalletService(ws)
          
          // Load wallet info
          const walletInfo = await ws.getWalletInfo()
          setWallet(walletInfo)
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  // Auto-refresh session before expiry
  useEffect(() => {
    if (!session) return

    const timeUntilExpiry = session.expiresAt - Date.now()
    const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000) // Refresh 5 minutes before expiry, minimum 1 minute

    const refreshTimer = setTimeout(async () => {
      const success = await telegramAuth.refreshSession()
      if (success) {
        const newSession = telegramAuth.getCurrentSession()
        setSession(newSession)
      } else {
        // Session refresh failed, logout
        logout()
      }
    }, refreshTime)

    return () => clearTimeout(refreshTimer)
  }, [session])

  const login = useCallback(async (initData: string): Promise<boolean> => {
    setIsLoading(true)
    
    try {
      const result = await telegramAuth.loginWithTelegram(initData)
      
      if (result.success && result.session) {
        setSession(result.session)
        
        // Initialize wallet service
        const ws = new WalletService(result.session)
        setWalletService(ws)
        
        // Load wallet info
        const walletInfo = await ws.getWalletInfo()
        setWallet(walletInfo)
        
        return true
      } else {
        console.error('Login failed:', result.error)
        return false
      }
    } catch (error) {
      console.error('Login error:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    telegramAuth.logout()
    setSession(null)
    setWallet(null)
    setWalletService(null)
  }, [])

  const refreshWallet = useCallback(async () => {
    if (!walletService) return
    
    try {
      const walletInfo = await walletService.getWalletInfo()
      setWallet(walletInfo)
    } catch (error) {
      console.error('Failed to refresh wallet:', error)
    }
  }, [walletService])

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const success = await telegramAuth.refreshSession()
    if (success) {
      const newSession = telegramAuth.getCurrentSession()
      setSession(newSession)
      return true
    }
    return false
  }, [])

  const generateAuthUrl = useCallback((returnUrl?: string): Promise<string> => {
    return telegramAuth.generateAuthUrl(returnUrl)
  }, [])

  return {
    user,
    session,
    isAuthenticated,
    isLoading,
    wallet,
    walletService,
    login,
    logout,
    refreshWallet,
    refreshSession,
    generateAuthUrl
  }
}

export const AuthContext_Export = AuthContext

// Hook for Telegram Web App integration
export function useTelegramWebApp() {
  const [isReady, setIsReady] = useState(false)
  const [webApp, setWebApp] = useState<any>(null)
  const [initData, setInitData] = useState<string>('')

  useEffect(() => {
    // Check if running in Telegram Web App
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp
      setWebApp(tg)
      setInitData(tg.initData || '')
      
      // Initialize Telegram Web App
      tg.ready()
      tg.expand()
      
      setIsReady(true)
    }
  }, [])

  const showAlert = useCallback((message: string) => {
    if (webApp) {
      webApp.showAlert(message)
    } else {
      alert(message)
    }
  }, [webApp])

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (webApp) {
        webApp.showConfirm(message, resolve)
      } else {
        resolve(confirm(message))
      }
    })
  }, [webApp])

  const hapticFeedback = useCallback((type: 'impact' | 'notification' | 'selection' = 'impact') => {
    if (webApp?.HapticFeedback) {
      switch (type) {
        case 'impact':
          webApp.HapticFeedback.impactOccurred('medium')
          break
        case 'notification':
          webApp.HapticFeedback.notificationOccurred('success')
          break
        case 'selection':
          webApp.HapticFeedback.selectionChanged()
          break
      }
    }
  }, [webApp])

  const setMainButton = useCallback((text: string, onClick: () => void) => {
    if (webApp?.MainButton) {
      webApp.MainButton.text = text
      webApp.MainButton.onClick(onClick)
      webApp.MainButton.show()
    }
  }, [webApp])

  const hideMainButton = useCallback(() => {
    if (webApp?.MainButton) {
      webApp.MainButton.hide()
    }
  }, [webApp])

  const openInvoice = useCallback((url: string) => {
    if (webApp) {
      webApp.openInvoice(url)
    } else {
      window.open(url, '_blank')
    }
  }, [webApp])

  return {
    isReady,
    webApp,
    initData,
    isTelegramWebApp: !!webApp,
    showAlert,
    showConfirm,
    hapticFeedback,
    setMainButton,
    hideMainButton,
    openInvoice
  }
}

// Hook for wallet operations
export function useWallet() {
  const { wallet, walletService, refreshWallet } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const sendTransaction = useCallback(async (
    to: string, 
    amount: string, 
    tokenAddress?: string
  ): Promise<string | null> => {
    if (!walletService) return null
    
    setIsLoading(true)
    try {
      const txHash = await walletService.sendTransaction(to, amount, tokenAddress)
      if (txHash) {
        // Refresh wallet after successful transaction
        await refreshWallet()
      }
      return txHash
    } catch (error) {
      console.error('Transaction failed:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [walletService, refreshWallet])

  const exportPrivateKey = useCallback(async (): Promise<string | null> => {
    if (!walletService) return null
    
    setIsLoading(true)
    try {
      return await walletService.exportPrivateKey()
    } catch (error) {
      console.error('Failed to export private key:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [walletService])

  return {
    wallet,
    isLoading,
    sendTransaction,
    exportPrivateKey,
    refreshWallet
  }
}