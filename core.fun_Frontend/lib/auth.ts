// Authentication types and interfaces for BullX-style Telegram auth
import { apiClient } from './api'

export interface TelegramUser {
  id: number
  username?: string
  first_name: string
  last_name?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface AuthUser {
  id: string
  telegramId: number
  username?: string
  firstName: string
  lastName?: string
  photoUrl?: string
  walletAddress: string
  walletPrivateKey?: string // Only available during creation
  createdAt: number
  lastLoginAt: number
  subscriptionTier: 'FREE' | 'PREMIUM' | 'VIP'
  isActive: boolean
}

export interface AuthSession {
  token: string
  user: AuthUser
  expiresAt: number
}

export interface TelegramAuthResult {
  success: boolean
  authUrl?: string
  error?: string
}

export interface LoginResult {
  success: boolean
  session?: AuthSession
  isNewUser?: boolean
  error?: string
}

export interface WalletInfo {
  address: string
  balance: string
  coreBalance: string
  tokenBalances: Array<{
    token: string
    symbol: string
    balance: string
    value: number
  }>
}

// Telegram Web App authentication
export class TelegramAuth {
  private botUsername: string
  private authUrlBase: string
  private apiBase: string

  constructor(botUsername: string = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'core_dot_fun_bot') {
    this.botUsername = botUsername
    this.authUrlBase = `https://t.me/${this.botUsername}`
    this.apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'
  }

  // Generate authentication URL for Telegram Web App via backend deep link
  async generateAuthUrl(returnUrl?: string): Promise<string> {
    try {
      const res = await fetch(`${this.apiBase}/api/auth/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: returnUrl })
      })
      const data = await res.json()
      if (data?.success && data?.deepLink) {
        return data.deepLink as string
      }
    } catch (_error) {
      console.log('API unavailable, using direct bot link')
    }

    // Fallback: Direct bot link with start command
    // The bot will handle authentication and redirect back to the web app
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'core_dot_fun_bot'
    return `https://t.me/${botUsername}?start=webapp_auth`
  }

  // Validate Telegram Web App data
  validateTelegramData(initData: string): TelegramUser | null {
    try {
      const urlParams = new URLSearchParams(initData)
      const user = urlParams.get('user')
      const hash = urlParams.get('hash')
      const authDate = urlParams.get('auth_date')

      if (!user || !hash || !authDate) {
        console.error('Missing required Telegram auth parameters')
        return null
      }

      const userData = JSON.parse(user) as TelegramUser
      userData.auth_date = parseInt(authDate)
      userData.hash = hash

      // Check if auth is recent (within 24 hours)
      const now = Math.floor(Date.now() / 1000)
      if (now - userData.auth_date > 86400) {
        console.error('Telegram auth data is too old')
        return null
      }

      return userData
    } catch (error) {
      console.error('Failed to validate Telegram data:', error)
      return null
    }
  }

  // Login with Telegram Web App data
  async loginWithTelegram(initData: string): Promise<LoginResult> {
    const telegramUser = this.validateTelegramData(initData)
    
    if (!telegramUser) {
      return {
        success: false,
        error: 'Invalid Telegram authentication data'
      }
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/auth/telegram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          telegramUser,
          initData
        })
      })

      const data = await response.json()

      if (data.success && data.session) {
        // Store session in localStorage
        localStorage.setItem('auth_session', JSON.stringify(data.session))
        
        return {
          success: true,
          session: data.session,
          isNewUser: data.isNewUser
        }
      } else {
        return {
          success: false,
          error: data.error || 'Authentication failed'
        }
      }
    } catch (error) {
      console.error('Telegram login error:', error)
      return {
        success: false,
        error: 'Network error during authentication'
      }
    }
  }

  // Get current session from localStorage
  getCurrentSession(): AuthSession | null {
    try {
      const sessionData = localStorage.getItem('auth_session')
      if (!sessionData) return null

      const session: AuthSession = JSON.parse(sessionData)
      
      // Check if session is expired
      if (Date.now() > session.expiresAt) {
        this.logout()
        return null
      }

      return session
    } catch (error) {
      console.error('Failed to get current session:', error)
      return null
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.getCurrentSession() !== null
  }

  // Logout and clear session
  logout(): void {
    localStorage.removeItem('auth_session')
  }

  // Refresh session token
  async refreshSession(): Promise<boolean> {
    const currentSession = this.getCurrentSession()
    if (!currentSession) return false

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.token}`
        }
      })

      const data = await response.json()

      if (data.success && data.session) {
        localStorage.setItem('auth_session', JSON.stringify(data.session))
        return true
      }
    } catch (error) {
      console.error('Failed to refresh session:', error)
    }

    return false
  }
}

// Wallet management functions
export class WalletService {
  constructor(private authSession: AuthSession) {}

  async getWalletInfo(): Promise<WalletInfo | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/wallet/info`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authSession.token}`
        }
      })

      if (!response.ok) {
        console.error('Wallet info request failed:', response.status)
        return null
      }

      const data = await response.json()
      
      if (data.success && data.data) {
        // Transform the backend response to match our WalletInfo interface
        return {
          address: data.data.address,
          balance: data.data.balance, // USD value
          coreBalance: data.data.coreBalance,
          balanceUSD: parseFloat(data.data.balance),
          tokens: data.data.tokenBalances,
          tokenBalances: data.data.tokenBalances
        } as any
      }
      
      return null
    } catch (error) {
      console.error('Failed to get wallet info:', error)
      return null
    }
  }

  async exportPrivateKey(): Promise<string | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/wallet/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authSession.token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.error('Export private key request failed:', response.status)
        return null
      }

      const data = await response.json()
      return data.success && data.data ? data.data.privateKey : null
    } catch (error) {
      console.error('Failed to export private key:', error)
      return null
    }
  }

  async getBalance(): Promise<{ core: string; usd: string; tokens?: Record<string, any> }> {
    try {
      const walletInfo = await this.getWalletInfo()
      if (!walletInfo) {
        return { core: '0', usd: '0' }
      }
      
      return {
        core: walletInfo.coreBalance || '0',
        usd: walletInfo.balance || '0',
        tokens: walletInfo.tokens?.reduce((acc: Record<string, any>, token: any) => {
          acc[token.token || token.address] = {
            balance: token.balance,
            value: token.value || 0
          }
          return acc
        }, {})
      }
    } catch (error) {
      console.error('Failed to get balance:', error)
      return { core: '0', usd: '0' }
    }
  }

  async getTransactions(): Promise<any[]> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/wallet/transactions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authSession.token}`
        }
      })

      if (!response.ok) {
        console.error('Get transactions request failed:', response.status)
        return []
      }

      const data = await response.json()
      return data.success && data.data ? data.data.transactions || [] : []
    } catch (error) {
      console.error('Failed to get transactions:', error)
      return []
    }
  }

  async sendTransaction(to: string, amount: string, tokenAddress?: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/wallet/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authSession.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to,
          amount,
          tokenAddress
        })
      })

      const data = await response.json()
      
      if (data.success && data.data) {
        return { 
          success: true, 
          hash: data.data.transactionHash
        }
      } else {
        return { 
          success: false, 
          error: data.error || 'Transaction failed'
        }
      }
    } catch (error: any) {
      console.error('Failed to send transaction:', error)
      return { success: false, error: error.message || 'Failed to send transaction' }
    }
  }
}

// Global auth instance
export const telegramAuth = new TelegramAuth()

// Utility function to get authenticated API headers
export function getAuthHeaders(): HeadersInit | undefined {
  const session = telegramAuth.getCurrentSession()
  return session ? { 'Authorization': `Bearer ${session.token}` } : undefined
}

// Extended API client methods for authenticated requests
declare module './api' {
  interface ApiClient {
    request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>
  }
}