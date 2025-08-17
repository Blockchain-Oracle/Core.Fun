// Enhanced API client for MemeFactory integration  
const API_BASE_URL = 'http://localhost:3001' // Hardcoded temporarily to debug

// Debug: log the API base URL to console (remove in production)
if (typeof window !== 'undefined') {
  console.log('API_BASE_URL:', API_BASE_URL)
  console.log('NEXT_PUBLIC_API_BASE_URL env var:', process.env.NEXT_PUBLIC_API_BASE_URL)
}

export interface TokenInfo {
  address: string
  creator: string
  name: string
  symbol: string
  totalSupply: string
  availableSupply: string
  reserveBalance: string
  currentPrice: string
  marketCap: string
  isLaunched: boolean
  createdAt: number
  launchedAt: number
  volume24h?: string
  holders?: number
  transactions24h?: number
  
  // Additional properties expected by frontend components
  status?: 'new' | 'graduated' | 'graduating'
  imageUrl?: string
  image_url?: string // Alias for imageUrl
  description?: string
  twitter?: string
  telegram?: string
  website?: string
  isVerified?: boolean
  raisedAmount?: string
  targetAmount?: string
  raised?: number
  sold?: number
  isGraduated?: boolean
  graduationPercentage?: number
  tradingEnabled?: boolean
  maxWallet?: string
  maxTransaction?: string
  price?: number
  priceChange24h?: number
  decimals?: number
}

export interface PriceHistory {
  timestamp: number
  price: string
  amount: string
  type: 'buy' | 'sell'
  txHash: string
}

export interface Trade {
  type: 'buy' | 'sell'
  trader: string
  amount: string
  cost?: string
  proceeds?: string
  timestamp: number
  txHash: string
  blockNumber: number
}

export interface TransactionRequest {
  type: 'createToken' | 'buyToken' | 'sellToken'
  params: any
}

export interface TransactionResult {
  success: boolean
  txHash?: string
  error?: string
  gasUsed?: string
  effectiveGasPrice?: string
}

export interface GasEstimate {
  gasLimit: string
  gasPrice: string
  totalCost: string
}

class EnhancedApiClient {
  private baseUrl: string
  private authToken: string | null = null

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
    // Don't set authToken here - always read from localStorage on each request
  }

  setAuthToken(token: string) {
    this.authToken = token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Add any headers from options
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value
        })
      } else {
        Object.assign(headers, options.headers)
      }
    }

    // Always get the latest auth token from localStorage
    let currentToken = this.authToken
    if (typeof window !== 'undefined') {
      const session = localStorage.getItem('auth_session')
      if (session) {
        try {
          const parsed = JSON.parse(session)
          currentToken = parsed.token
        } catch (e) {
          console.error('Failed to parse auth session:', e)
        }
      }
    }
    
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`
    }

    const fullUrl = `${this.baseUrl}/api${endpoint}`
    console.log('Making API request to:', fullUrl, 'baseUrl:', this.baseUrl)
    
    const response = await fetch(fullUrl, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  // Token endpoints
  async getAllTokens(): Promise<{ success: boolean; tokens: TokenInfo[]; count: number }> {
    return this.get('/tokens')
  }

  // Alias for getAllTokens to match what frontend components expect
  async getTokens(): Promise<{ success: boolean; data: { tokens: TokenInfo[] } }> {
    const result = await this.getAllTokens()
    return {
      success: result.success,
      data: { tokens: result.tokens || [] }
    }
  }

  async getTokenInfo(address: string): Promise<{ success: boolean; token: TokenInfo }> {
    return this.get(`/tokens/${address}`)
  }

  async getTokenPriceHistory(
    address: string,
    hours: number = 24
  ): Promise<{ success: boolean; priceHistory: PriceHistory[]; hours: number }> {
    return this.get(`/tokens/${address}/chart?hours=${hours}`)
  }

  async getRecentTrades(
    address: string,
    limit: number = 50
  ): Promise<{ success: boolean; trades: Trade[]; count: number }> {
    return this.get(`/tokens/${address}/trades?limit=${limit}`)
  }

  // Trading endpoints (require authentication)
  async createToken(params: {
    name: string
    symbol: string
    description?: string
    imageUrl?: string
    twitter?: string
    telegram?: string
    website?: string
  }): Promise<TransactionResult & { success: boolean }> {
    return this.post('/tokens/create', params)
  }

  async buyToken(
    tokenAddress: string,
    coreAmount: string
  ): Promise<TransactionResult & { success: boolean; expectedTokens?: string }> {
    return this.post(`/tokens/${tokenAddress}/buy`, { coreAmount })
  }

  async sellToken(
    tokenAddress: string,
    tokenAmount: string
  ): Promise<TransactionResult & { success: boolean; expectedCore?: string }> {
    return this.post(`/tokens/${tokenAddress}/sell`, { tokenAmount })
  }

  // Calculation endpoints
  async calculateBuyReturn(
    tokenAddress: string,
    coreAmount: string
  ): Promise<{ success: boolean; coreAmount: string; tokenAmount: string; rate: number }> {
    return this.post(`/tokens/${tokenAddress}/calculate-buy`, { amount: coreAmount })
  }

  async calculateSellReturn(
    tokenAddress: string,
    tokenAmount: string
  ): Promise<{ success: boolean; tokenAmount: string; coreAmount: string; rate: number }> {
    return this.post(`/tokens/${tokenAddress}/calculate-sell`, { amount: tokenAmount })
  }

  // Gas estimation (requires authentication)
  async estimateGas(request: TransactionRequest): Promise<GasEstimate & { success: boolean }> {
    return this.post('/tokens/estimate-gas', request)
  }

  // Transaction history (requires authentication)
  async getUserTransactions(
    userId: string,
    limit: number = 50
  ): Promise<{ success: boolean; transactions: any[]; count: number }> {
    return this.get(`/tokens/transactions/${userId}?limit=${limit}`)
  }

  async getTransactionStatus(
    txHash: string
  ): Promise<{ success: boolean; status: string; blockNumber?: number; gasUsed?: string }> {
    return this.get(`/tokens/transaction/${txHash}`)
  }

  // Portfolio endpoints - uses wallet/info
  async getPortfolio(): Promise<{
    success: boolean
    data: {
      holdings: Array<{
        tokenAddress: string
        symbol: string
        name: string
        balance: string
        averageCost: number
        currentPrice: number
        trades: number
      }>
    }
  }> {
    // Use wallet/info to get token balances
    const walletInfo = await this.getWalletInfo() as any
    const tokenBalances = walletInfo?.data?.tokenBalances || walletInfo?.tokenBalances || []

    // Map token balances to portfolio holdings
    const holdings = tokenBalances.map((token: any) => ({
      tokenAddress: token.token || token.address,
      symbol: token.symbol,
      name: token.symbol,
      balance: token.balance,
      averageCost: 0,
      currentPrice: token.value || 0,
      trades: 0
    }))

    return {
      success: true,
      data: { holdings }
    }
  }

  async getPnLHistory(days: number): Promise<{
    success: boolean
    data: Array<{
      timestamp: number
      value: number
      pnl: number
    }>
  }> {
    // PnL history not available, return empty array
    return {
      success: true,
      data: []
    }
  }

  async getTokenPrice(tokenAddress: string): Promise<{
    success: boolean
    data: {
      price: number
    }
  }> {
    const result = await this.getTokenInfo(tokenAddress)
    return {
      success: result.success,
      data: {
        price: parseFloat(result.token?.currentPrice || '0')
      }
    }
  }

  // Wallet endpoints
  async getWalletInfo(): Promise<any> {
    return this.get('/wallet/info') as any
  }

  async getWalletBalance(address?: string): Promise<{
    success: boolean
    balance: string
    coreBalance: string
    data?: {
      balance: {
        core: string
      }
    }
  }> {
    // Use wallet/info endpoint instead of non-existent balance endpoint
    const walletInfo = await this.getWalletInfo() as any
    const coreBalance = walletInfo?.data?.coreBalance || walletInfo?.coreBalance || '0'
    return {
      success: true,
      balance: coreBalance,
      coreBalance: coreBalance,
      data: {
        balance: {
          core: coreBalance
        }
      }
    }
  }

  async getTokenBalance(
    tokenAddress: string,
    walletAddress?: string
  ): Promise<{ success: boolean; balance: string; symbol: string }> {
    const endpoint = walletAddress
      ? `/wallet/token/${tokenAddress}/${walletAddress}`
      : `/wallet/token/${tokenAddress}`
    return this.get(endpoint)
  }

  // Auth endpoints
  async authenticateCallback(params: {
    code?: string
    token: string
    signature: string
    address: string
    username: string
    telegramId: string
  }): Promise<{
    success: boolean
    accessToken?: string
    refreshToken?: string
    user?: any
  }> {
    return this.post('/auth/callback', params)
  }

  // Staking endpoints
  async getStakingStatus(walletAddress: string): Promise<{
    success: boolean
    data?: {
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
  }> {
    return this.get(`/staking/status/${walletAddress}`)
  }

  async getStakingHistory(walletAddress: string, limit: number = 50): Promise<{
    success: boolean
    data?: Array<{
      type: 'stake' | 'unstake' | 'claim'
      amount: string
      txHash: string
      timestamp: Date
    }>
  }> {
    // Staking history endpoint doesn't exist, return empty array
    return {
      success: true,
      data: []
    }
  }

  async getStakingTiers(): Promise<{
    success: boolean
    data?: Array<{
      name: string
      minStake: number
      feeDiscount: number
      maxAlerts: number
      copyTradeSlots: number
      apiAccess: boolean
      apy: number
      benefits: string[]
    }>
  }> {
    return this.get('/staking/tiers')
  }

  async getStakingStats(): Promise<{
    success: boolean
    data?: {
      totalStaked: string
      totalStakers: number
      totalRewardsPaid: string
      averageApy: number
      platformToken: string
      tierDistribution: Record<string, number>
    }
  }> {
    return this.get('/staking/stats')
  }

  async getStakingLeaderboard(limit: number = 100): Promise<{
    success: boolean
    data?: Array<{
      address: string
      amount: string
      tier: string
      rank: number
    }>
  }> {
    return this.get(`/staking/leaderboard?limit=${limit}`)
  }

  async stake(amount: string): Promise<{
    success: boolean
    txHash?: string
    error?: string
  }> {
    return this.post('/staking/stake', { amount })
  }

  async unstake(amount: string): Promise<{
    success: boolean
    txHash?: string
    error?: string
  }> {
    return this.post('/staking/unstake', { amount })
  }

  async claimRewards(): Promise<{
    success: boolean
    txHash?: string
    amount?: string
    error?: string
  }> {
    return this.post('/staking/claim')
  }

  // Treasury endpoints - Not available in backend
  async getTreasuryStats(): Promise<{
    success: boolean
    data?: {
      totalCollected: string
      totalDistributed: string
      pendingDistribution: string
      lastDistribution: Date
      nextDistribution: Date
      platformBalance: string
      distributions: Array<{
        amount: string
        recipients: number
        timestamp: Date
        txHash: string
      }>
    }
  }> {
    // Treasury not implemented in backend
    return {
      success: false,
      data: undefined
    }
  }

  async getTreasuryHistory(limit: number = 50): Promise<{
    success: boolean
    data?: Array<{
      type: 'collection' | 'distribution'
      amount: string
      source?: string
      recipients?: number
      txHash: string
      timestamp: Date
    }>
  }> {
    // Treasury not implemented in backend
    return {
      success: false,
      data: []
    }
  }

  async claimTreasuryRewards(walletAddress: string): Promise<{
    success: boolean
    txHash?: string
    amount?: string
    error?: string
  }> {
    // Treasury not implemented in backend
    return {
      success: false,
      error: 'Treasury features not available'
    }
  }

  // Subscription endpoints
  async getSubscriptionStatus(walletAddress: string): Promise<{
    success: boolean
    data?: {
      isActive: boolean
      tier: string
      tierName: string
      expiresAt?: Date
      features: {
        maxAlerts: number
        copyTradeSlots: number
        apiAccess: boolean
        feeDiscount: number
        prioritySupport: boolean
      }
    }
  }> {
    // Route migrated to staking service
    return this.get(`/staking/status/${walletAddress}`)
  }

  async getSubscriptionTiers(): Promise<{
    success: boolean
    data?: Array<{
      id: string
      name: string
      price: number
      duration: number
      features: Record<string, any>
    }>
  }> {
    // Route migrated to staking service
    return this.get('/staking/tiers')
  }

  // Analytics endpoints - uses /api/stats
  async getAnalytics(): Promise<{
    success: boolean
    data?: {
      totalTokensCreated: number
      totalVolume24h: string
      totalLiquidity: string
      totalUsers: number
      activeUsers24h: number
      topTokens: Array<{
        address: string
        name: string
        symbol: string
        volume24h: string
        holders: number
      }>
      recentActivity: Array<{
        type: string
        user: string
        token: string
        amount: string
        timestamp: Date
      }>
    }
  }> {
    // Use /api/stats endpoint and map the response
    const statsResponse = await this.get<{
      success: boolean
      stats?: {
        totalVolume: string
        tokensCreated: number
        totalHolders: number
        graduated: number
        totalMarketCap: string
        tokensCreated24h: number
        volumeChange24h: number
        tokensChange24h: number
        holdersChange24h: number
        graduatedChange24h: number
      }
    }>('/stats')
    
    if (!statsResponse.success || !statsResponse.stats) {
      return { success: false }
    }
    
    return {
      success: true,
      data: {
        totalTokensCreated: statsResponse.stats.tokensCreated,
        totalVolume24h: statsResponse.stats.totalVolume,
        totalLiquidity: statsResponse.stats.totalMarketCap,
        totalUsers: statsResponse.stats.totalHolders,
        activeUsers24h: statsResponse.stats.totalHolders, // Use total as approximation
        topTokens: [], // Stats endpoint doesn't provide this
        recentActivity: [] // Stats endpoint doesn't provide this
      }
    }
  }

  // Direct stats endpoint call
  async getStats(): Promise<{
    success: boolean
    data?: {
      stats: {
        totalVolume: string
        tokensCreated: number
        totalHolders: number
        graduated: number
        totalMarketCap: string
        tokensCreated24h: number
        volumeChange24h: number
        tokensChange24h: number
        holdersChange24h: number
        graduatedChange24h: number
      }
    }
  }> {
    const response = await this.get<{
      success: boolean
      stats?: {
        totalVolume: string
        tokensCreated: number
        totalHolders: number
        graduated: number
        totalMarketCap: string
        tokensCreated24h: number
        volumeChange24h: number
        tokensChange24h: number
        holdersChange24h: number
        graduatedChange24h: number
      }
    }>('/stats')
    
    // Transform response to match expected format
    return {
      success: response.success,
      data: response.stats ? { stats: response.stats } : undefined
    }
  }

  async getTrendingTokens(limit: number = 10): Promise<{
    success: boolean
    data?: Array<{
      address: string
      name: string
      symbol: string
      volume24h: string
      priceChange24h: number
      holders: number
    }>
  }> {
    // Use trending endpoint from stats if available, otherwise return empty
    try {
      const response = await this.get<{
        success: boolean
        tokens?: Array<any>
      }>('/stats/trending?limit=' + limit)
      
      if (response.success && response.tokens) {
        return {
          success: true,
          data: response.tokens.map(t => ({
            address: t.address,
            name: t.name,
            symbol: t.symbol,
            volume24h: t.volume24h || '0',
            priceChange24h: t.priceChange24h || 0,
            holders: t.holders || 0
          }))
        }
      }
    } catch (error) {
      // Fallback to empty array if trending endpoint doesn't exist
    }
    
    return {
      success: true,
      data: []
    }
  }

  async getTokenAnalytics(tokenAddress: string): Promise<{
    success: boolean
    data?: {
      holders: number
      transactions24h: number
      volume24h: string
      liquidityChanges: Array<{
        timestamp: Date
        liquidity: string
      }>
      priceHistory: Array<{
        timestamp: Date
        price: string
      }>
      topHolders: Array<{
        address: string
        balance: string
        percentage: number
      }>
    }
  }> {
    return this.get(`/analytics/token/${tokenAddress}`)
  }
}

// Export singleton instance
export const apiClient = new EnhancedApiClient()

// Helper functions for data transformation
export function formatTokenAmount(amount: string, decimals: number = 18): string {
  const value = parseFloat(amount)
  if (value < 0.0001) {
    return value.toExponential(2)
  } else if (value < 1) {
    return value.toFixed(6)
  } else if (value < 1000) {
    return value.toFixed(4)
  } else if (value < 1000000) {
    return `${(value / 1000).toFixed(2)}K`
  } else if (value < 1000000000) {
    return `${(value / 1000000).toFixed(2)}M`
  } else {
    return `${(value / 1000000000).toFixed(2)}B`
  }
}

export function formatCoreAmount(amount: string): string {
  const value = parseFloat(amount)
  if (value < 0.01) {
    return value.toFixed(6)
  } else if (value < 1) {
    return value.toFixed(4)
  } else if (value < 1000) {
    return value.toFixed(2)
  } else {
    return formatTokenAmount(amount)
  }
}

export function formatUSD(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`
  } else if (amount < 1) {
    return `$${amount.toFixed(3)}`
  } else if (amount < 1000) {
    return `$${amount.toFixed(2)}`
  } else if (amount < 1000000) {
    return `$${(amount / 1000).toFixed(1)}K`
  } else if (amount < 1000000000) {
    return `$${(amount / 1000000).toFixed(1)}M`
  } else {
    return `$${(amount / 1000000000).toFixed(1)}B`
  }
}

export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function shortenAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}