import { createLogger } from '@core-meme/shared';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

interface StakingStatus {
  wallet: string;
  stakedAmount: string;
  cmpBalance?: string;  // New field for balance-based tiers
  tier: string;
  rewards: string;
  apy: number;
  lockEndTime: number;
  canUnstake: boolean;
  feeDiscount: number;
  maxAlerts: number;
  copyTradeSlots: number;
  hasApiAccess: boolean;
  lastClaimTime: number;
}

interface StakingTier {
  name: string;
  requiredAmount: string;
  feeDiscount: number;
  maxAlerts: number;
  copyTradeSlots: number;
  apiAccess: boolean;
  apy: number;
  benefits: string[];
}

interface TokenPrice {
  tokenAddress: string;
  priceInCore: number;
  priceInUsd: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  holders: number;
  marketCap: number;
}

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  creator: string;
  description?: string;
  imageUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  raised: number;
  sold: number;
  isGraduated: boolean;
  graduationPercentage: number;
  tradingEnabled: boolean;
  maxWallet?: string;
  maxTransaction?: string;
}

interface WalletInfo {
  address: string;
  balance: {
    core: string;
    usd: number;
  };
  tokens: Array<{
    address: string;
    symbol: string;
    balance: string;
    value: number;
  }>;
  transactions: number;
  created: Date;
}

interface TradeRequest {
  tokenAddress: string;
  amount: string;
  slippage?: number;
}

interface TradeResponse {
  success: boolean;
  txHash?: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  fee: string;
  error?: string;
}

export class ApiService {
  private baseUrl: string;
  private logger = createLogger({ service: 'api-service' });
  private authToken?: string;
  private telegramId?: number;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.API_URL || 'http://localhost:3001';
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  setTelegramId(telegramId: number) {
    this.telegramId = telegramId;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      };

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      if (this.telegramId) {
        headers['X-Telegram-Id'] = String(this.telegramId);
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json() as ApiResponse<T>;

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      this.logger.error(`API request failed for ${endpoint}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==================== STAKING & SUBSCRIPTION ====================

  async getStakingStatus(walletAddress: string): Promise<ApiResponse<StakingStatus>> {
    return this.request<StakingStatus>(`/api/staking/status/${walletAddress}`);
  }

  async getStakingTiers(): Promise<ApiResponse<StakingTier[]>> {
    // Use staking tiers endpoint (subscription routes deprecated)
    return this.request<StakingTier[]>('/api/staking/tiers');
  }

  async stake(amount: string): Promise<ApiResponse<{ txHash: string }>> {
    return this.request('/api/staking/stake', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async unstake(amount: string): Promise<ApiResponse<{ txHash: string }>> {
    return this.request('/api/staking/unstake', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async claimRewards(): Promise<ApiResponse<{ txHash: string; amount: string }>> {
    return this.request('/api/staking/claim', {
      method: 'POST',
    });
  }

  async claimAirdrop(): Promise<ApiResponse<{
    txHash: string;
    amount: string;
    newBalance: string;
    newTier: string;
    message: string;
  }>> {
    return this.request('/api/staking/airdrop', {
      method: 'POST',
    });
  }

  // ==================== TRADING ====================

  async buyToken(params: TradeRequest): Promise<ApiResponse<TradeResponse>> {
    return this.request<TradeResponse>('/api/trading/buy', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async sellToken(params: TradeRequest): Promise<ApiResponse<TradeResponse>> {
    return this.request<TradeResponse>('/api/trading/sell', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getTradingHistory(walletAddress: string): Promise<ApiResponse<any[]>> {
    return this.request(`/api/trading/history/${walletAddress}`);
  }

  async getPortfolio(walletAddress: string): Promise<ApiResponse<any>> {
    return this.request(`/api/trading/portfolio/${walletAddress}`);
  }

  // ==================== TOKEN INFO ====================

  async getTokenInfo(tokenAddress: string): Promise<ApiResponse<TokenInfo>> {
    return this.request<TokenInfo>(`/api/tokens/${tokenAddress}`);
  }

  async getTokenPrice(tokenAddress: string): Promise<ApiResponse<TokenPrice>> {
    return this.request<TokenPrice>(`/api/tokens/${tokenAddress}/price`);
  }

  async getTrendingTokens(limit = 10): Promise<ApiResponse<TokenInfo[]>> {
    return this.request<TokenInfo[]>(`/api/tokens/trending?limit=${limit}`);
  }

  async getNewTokens(limit = 10): Promise<ApiResponse<TokenInfo[]>> {
    return this.request<TokenInfo[]>(`/api/tokens/new?limit=${limit}`);
  }

  async searchTokens(query: string): Promise<ApiResponse<TokenInfo[]>> {
    return this.request<TokenInfo[]>(`/api/tokens/search?q=${encodeURIComponent(query)}`);
  }

  // ==================== WALLET ====================

  async getWalletInfo(walletAddress: string): Promise<ApiResponse<WalletInfo>> {
    return this.request<WalletInfo>(`/api/wallet/info/${walletAddress}`);
  }

  async getWalletBalance(walletAddress: string): Promise<ApiResponse<any>> {
    return this.request(`/api/wallet/balance/${walletAddress}`);
  }

  async exportWallet(): Promise<ApiResponse<{ privateKey: string }>> {
    return this.request('/api/wallet/export', {
      method: 'POST',
    });
  }

  async withdraw(
    toAddress: string,
    amount: string
  ): Promise<ApiResponse<{ txHash: string }>> {
    return this.request('/api/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ toAddress, amount }),
    });
  }

  // ==================== ALERTS ====================

  async getAlerts(walletAddress: string): Promise<ApiResponse<any[]>> {
    return this.request(`/api/alerts/${walletAddress}`);
  }

  async createAlert(alert: any): Promise<ApiResponse<{ id: string }>> {
    return this.request('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
  }

  async deleteAlert(alertId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/alerts/${alertId}`, {
      method: 'DELETE',
    });
  }

  async updateAlert(alertId: string, updates: any): Promise<ApiResponse<void>> {
    return this.request(`/api/alerts/${alertId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // ==================== COPY TRADING ====================

  async getCopyTraders(): Promise<ApiResponse<any[]>> {
    return this.request('/api/copy-trading/traders');
  }

  async followTrader(traderId: string): Promise<ApiResponse<void>> {
    return this.request('/api/copy-trading/follow', {
      method: 'POST',
      body: JSON.stringify({ traderId }),
    });
  }

  async unfollowTrader(traderId: string): Promise<ApiResponse<void>> {
    return this.request('/api/copy-trading/unfollow', {
      method: 'POST',
      body: JSON.stringify({ traderId }),
    });
  }

  async getCopyTradingStats(): Promise<ApiResponse<any>> {
    return this.request('/api/copy-trading/stats');
  }

  // ==================== ANALYTICS ====================

  async getPlatformStats(): Promise<ApiResponse<any>> {
    return this.request('/api/analytics/platform');
  }

  async getTokenAnalytics(tokenAddress: string): Promise<ApiResponse<any>> {
    return this.request(`/api/analytics/token/${tokenAddress}`);
  }

  async getMarketOverview(): Promise<ApiResponse<any>> {
    return this.request('/api/analytics/market');
  }

  // ==================== AUTHENTICATION ====================

  async authenticate(telegramId: string, walletAddress: string): Promise<ApiResponse<{ token: string }>> {
    return this.request('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ telegramId, walletAddress }),
    });
  }

  async verifyToken(): Promise<ApiResponse<{ valid: boolean }>> {
    return this.request('/api/auth/verify', {
      method: 'GET',
    });
  }

  // ==================== UTILITY ====================

  async getGasPrice(): Promise<ApiResponse<{ standard: string; fast: string; instant: string }>> {
    return this.request('/api/utils/gas-price');
  }

  async estimateGas(
    method: string,
    params: any
  ): Promise<ApiResponse<{ gasLimit: string; gasPrice: string; totalCost: string }>> {
    return this.request('/api/utils/estimate-gas', {
      method: 'POST',
      body: JSON.stringify({ method, params }),
    });
  }

  async getSystemStatus(): Promise<ApiResponse<any>> {
    return this.request('/api/health');
  }
}