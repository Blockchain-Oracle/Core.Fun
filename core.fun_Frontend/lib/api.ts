// Re-export everything from api-client for backward compatibility
export * from './api-client';
export { apiClient as default } from './api-client';

// Export type definitions
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Alias for backwards compatibility
export type TokenData = TokenInfo;

export interface TokenInfo {
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
  price?: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidity?: number;
  marketCap?: number;
  holders?: number;
}

export interface Trade {
  id: string;
  userId: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  totalValue: number;
  txHash: string;
  gasUsed?: number;
  gasPrice?: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
}

export interface PriceUpdate {
  tokenAddress: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  timestamp: Date;
}

export interface TokenCreatedEvent {
  tokenAddress: string;
  name: string;
  symbol: string;
  creator: string;
  initialSupply: string;
  timestamp: Date;
}

export interface StakingInfo {
  stakedAmount: string;
  tier: string;
  tierName: string;
  pendingRewards: string;
  totalClaimed: string;
  apy: number;
  feeDiscount: number;
  lastStakedAt: Date;
  lastClaimedAt: Date;
  canUnstake: boolean;
  cooldownEnd?: Date;
}

export interface TreasuryStats {
  totalCollected: string;
  totalDistributed: string;
  pendingDistribution: string;
  lastDistribution: number;
  nextDistribution: number;
  feeBreakdown: {
    creation: string;
    trading: string;
    graduation: string;
  };
}

export interface AnalyticsData {
  totalVolume24h: number;
  totalTrades24h: number;
  totalUsers: number;
  totalTokens: number;
  topGainers: TokenInfo[];
  topLosers: TokenInfo[];
  trendingTokens: TokenInfo[];
  newTokens: TokenInfo[];
}

// WebSocket client exports - use the real WebSocket store
import { useWebSocket } from './websocket';

// Export WebSocket client functions
export const wsClient = {
  connect: () => useWebSocket.getState().connect(),
  disconnect: () => useWebSocket.getState().disconnect(),
  subscribe: (channel: string) => useWebSocket.getState().subscribe(channel),
  unsubscribe: (channel: string) => useWebSocket.getState().unsubscribe(channel),
  on: (event: string, callback: (data: any) => void) => {
    // Map events to the appropriate handler
    const state = useWebSocket.getState();
    switch(event) {
      case 'price:update':
        return state.onPriceUpdate(callback);
      case 'token:created':
        return state.onTokenCreated(callback);
      case 'token:traded':
        return state.onTokenTraded(callback);
      case 'token:graduated':
        return state.onTokenGraduated(callback);
      case 'alert':
        return state.onAlert(callback);
      default:
        console.warn(`Unknown WebSocket event: ${event}`);
        return () => {};
    }
  },
  emit: (event: string, data: any) => useWebSocket.getState().emit(event, data),
};