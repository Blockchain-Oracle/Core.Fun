// MemeFactory API service for interacting with the backend
import { TokenSale, TokenCreationParams, BondingCurveQuote, StakingInfo } from './types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'

// Contract addresses (Core Testnet)
export const CONTRACTS = {
  memeFactory: '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  staking: '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  platformToken: '0x26EfC13dF039c6B4E084CEf627a47c348197b655',
  treasury: '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a'
}

// Bonding curve constants
export const BONDING_CURVE = {
  TOKEN_LIMIT: 500000, // 500K tokens to graduation
  TARGET_RAISED: 3, // 3 CORE target
  MAX_SUPPLY: 1000000, // 1M total supply
  CREATION_FEE: 0.1, // 0.1 CORE
  PLATFORM_FEE: 50, // 0.5% (50 basis points)
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

class MemeFactoryService {
  private baseUrl: string
  private authToken: string | null = null

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
    // Get auth token from localStorage if available
    if (typeof window !== 'undefined') {
      this.authToken = localStorage.getItem('authToken')
    }
  }

  setAuthToken(token: string) {
    this.authToken = token
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', token)
    }
  }

  clearAuthToken() {
    this.authToken = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken')
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      }

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      })

      const data = await response.json()
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP error! status: ${response.status}`
        }
      }

      return { success: true, data }
    } catch (error) {
      console.error('API request failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Token Creation
  async createToken(params: TokenCreationParams): Promise<ApiResponse<{
    tokenAddress: string
    txHash: string
  }>> {
    return this.request('/api/trading/create-token', {
      method: 'POST',
      body: JSON.stringify(params)
    })
  }

  // Buy tokens via bonding curve
  async buyToken(
    tokenAddress: string,
    amountCore: string,
    slippage: number = 5
  ): Promise<ApiResponse<{
    txHash: string
    tokensReceived: string
  }>> {
    return this.request('/api/trading/buy', {
      method: 'POST',
      body: JSON.stringify({ tokenAddress, amountCore, slippage })
    })
  }

  // Sell tokens via bonding curve
  async sellToken(
    tokenAddress: string,
    tokenAmount: string,
    slippage: number = 5
  ): Promise<ApiResponse<{
    txHash: string
    coreReceived: string
  }>> {
    return this.request('/api/trading/sell', {
      method: 'POST',
      body: JSON.stringify({ tokenAddress, tokenAmount, slippage })
    })
  }

  // Get buy/sell quote
  async getQuote(
    tokenAddress: string,
    amount: string,
    type: 'buy' | 'sell'
  ): Promise<ApiResponse<BondingCurveQuote>> {
    const params = new URLSearchParams({
      tokenAddress,
      amount,
      type
    })
    
    return this.request(`/api/trading/quote?${params.toString()}`, {
      method: 'GET'
    })
  }

  // Get token info
  async getTokenInfo(tokenAddress: string): Promise<ApiResponse<TokenSale>> {
    return this.request(`/api/tokens/${tokenAddress}`, {
      method: 'GET'
    })
  }

  // Get all tokens
  async getAllTokens(
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'createdAt'
  ): Promise<ApiResponse<{
    tokens: TokenSale[]
    total: number
    hasMore: boolean
  }>> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy
    })
    
    return this.request(`/api/tokens?${params.toString()}`, {
      method: 'GET'
    })
  }

  // Get staking info
  async getStakingInfo(address: string): Promise<ApiResponse<StakingInfo>> {
    return this.request(`/api/staking/${address}`, {
      method: 'GET'
    })
  }

  // Stake tokens
  async stake(amount: string): Promise<ApiResponse<{ txHash: string }>> {
    return this.request('/api/staking/stake', {
      method: 'POST',
      body: JSON.stringify({ amount })
    })
  }

  // Unstake tokens
  async unstake(amount: string): Promise<ApiResponse<{ txHash: string }>> {
    return this.request('/api/staking/unstake', {
      method: 'POST',
      body: JSON.stringify({ amount })
    })
  }

  // Claim rewards
  async claimRewards(): Promise<ApiResponse<{ txHash: string; amount: string }>> {
    return this.request('/api/staking/claim', {
      method: 'POST'
    })
  }

  // Calculate bonding curve price
  calculateBondingCurvePrice(currentSold: number): number {
    const basePrice = 0.0001
    const priceIncrement = 0.00001
    const step = 10000
    return basePrice + (priceIncrement * Math.floor(currentSold / step))
  }

  // Calculate tokens out for given CORE amount
  calculateTokensOut(currentSold: number, coreIn: number): number {
    let remaining = coreIn
    let tokensOut = 0
    let sold = currentSold

    while (remaining > 0 && sold < BONDING_CURVE.TOKEN_LIMIT) {
      const price = this.calculateBondingCurvePrice(sold)
      const step = 10000
      const tokensInStep = Math.min(step - (sold % step), BONDING_CURVE.TOKEN_LIMIT - sold)
      const costForStep = tokensInStep * price

      if (remaining >= costForStep) {
        tokensOut += tokensInStep
        remaining -= costForStep
        sold += tokensInStep
      } else {
        tokensOut += remaining / price
        remaining = 0
      }
    }

    // Apply platform fee
    const fee = tokensOut * (BONDING_CURVE.PLATFORM_FEE / 10000)
    return tokensOut - fee
  }

  // Calculate CORE out for given token amount
  calculateCoreOut(currentSold: number, tokensIn: number): number {
    let remaining = tokensIn
    let coreOut = 0
    let sold = currentSold

    while (remaining > 0 && sold > 0) {
      const price = this.calculateBondingCurvePrice(sold - 1)
      const step = 10000
      const tokensInStep = Math.min(sold % step || step, sold, remaining)
      const proceeds = tokensInStep * price

      coreOut += proceeds
      remaining -= tokensInStep
      sold -= tokensInStep
    }

    // Apply platform fee
    const fee = coreOut * (BONDING_CURVE.PLATFORM_FEE / 10000)
    return coreOut - fee
  }
}

export const memeFactory = new MemeFactoryService()
export default memeFactory