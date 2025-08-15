// Bridge hook to migrate from Context to Zustand
import { useAuthStore } from '@/lib/stores'
import { useEffect, useState, useCallback } from 'react'

export function useAuth() {
  const {
    user,
    session,
    wallet,
    walletService,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    refreshSession,
    refreshWallet,
    generateAuthUrl,
    initializeAuth
  } = useAuthStore()

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  return {
    user,
    session,
    wallet,
    walletService,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    refreshSession,
    refreshWallet,
    generateAuthUrl
  }
}

// Export a hook that matches the old useWallet interface
export function useWallet() {
  const { wallet, walletService, refreshWallet } = useAuthStore()

  return {
    wallet,
    walletService,
    balance: wallet?.balance,
    coreBalance: wallet?.coreBalance,
    exportPrivateKey: async () => {
      return walletService?.exportPrivateKey() || null
    },
    refreshBalance: refreshWallet
  }
}

// Hook for Telegram Web App integration
// Re-export from use-auth.ts for compatibility
export { AuthContext_Export, useAuthProvider } from './use-auth'

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