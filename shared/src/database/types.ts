// Shared database types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
}

// User-related types (from telegram-bot)
export interface User extends BaseEntity {
  telegramId: number;
  username: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  subscriptionTier?: string;
  portfolioValue?: number;
}

export interface Wallet extends BaseEntity {
  userId: string;
  name: string;
  address: string;
  type: 'primary' | 'trading' | 'withdraw';
  encryptedPrivateKey?: string;
  network: string;
}

// Trading-related types
export interface Trade extends BaseEntity {
  userId: string;
  walletAddress: string;
  tokenAddress: string;
  tokenSymbol?: string;
  type: 'buy' | 'sell';
  amountCore: number;
  amountToken: number;
  price: number;
  txHash: string;
  pnl?: number;
  pnlPercentage?: number;
  status: string;
}

// Token-related types (from blockchain-monitor)
export interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  creator: string;
  createdAt: number;
  blockNumber: number;
  transactionHash: string;
  isVerified?: boolean;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  status?: string;
  ownershipRenounced?: boolean;
}

export interface Pair {
  address: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  dex: string;
  blockNumber: number;
  createdAt: number;
}

export interface TokenAnalytics {
  tokenAddress: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  holders: number;
  updatedAt: number;
}

export interface Alert {
  id: string;
  userId: string;
  tokenAddress: string;
  type: 'price_above' | 'price_below' | 'volume_spike' | 'new_token' | 'rug_warning';
  condition: any;
  triggered: boolean;
  createdAt: Date;
  triggeredAt?: Date;
}