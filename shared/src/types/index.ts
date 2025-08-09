// Token types
export interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  creator: string;
  createdAt: Date;
  isOurToken: boolean;
}

export interface TokenSale {
  token: string;
  name: string;
  symbol: string;
  creator: string;
  sold: string;
  raised: string;
  isOpen: boolean;
  isLaunched: boolean;
  createdAt: Date;
  launchedAt?: Date;
}

export interface TokenMetadata {
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  maxWallet?: string;
  maxTransaction?: string;
  tradingEnabled?: boolean;
}

export interface TokenAnalysis {
  isHoneypot: boolean;
  honeypotReason?: string;
  rugScore: number;
  contractVerified: boolean;
  hasMintFunction: boolean;
  hasBlacklist: boolean;
  buyTax?: number;
  sellTax?: number;
  warnings: string[];
  liquidity: number;
  holders: number;
  ownershipConcentration: number;
}

// Trading types
export interface TradeRequest {
  userId: number;
  action: 'buy' | 'sell' | 'snipe';
  tokenAddress: string;
  amount: string;
  slippage?: number;
  deadline?: number;
  dexName?: string;
}

export interface TradeResult {
  success: boolean;
  transactionHash?: string;
  tokensBought?: string;
  coreReceived?: string;
  gasUsed?: string;
  error?: string;
  explorerUrl?: string;
}

// User types
export interface User {
  id: number;
  telegramId: number;
  username?: string;
  walletAddress?: string;
  subscription: 'free' | 'premium' | 'pro';
  subscriptionExpiry?: Date;
  createdAt: Date;
  settings: UserSettings;
}

export interface UserSettings {
  slippage: number;
  gasPrice: 'standard' | 'fast' | 'instant';
  maxGasPrice: string;
  autoSnipe: boolean;
  copyTrading: boolean;
  alerts: AlertSettings;
}

export interface AlertSettings {
  newTokens: boolean;
  safeTokens: boolean;
  highLiquidity: boolean;
  whaleTrades: boolean;
  pumps: boolean;
  rugs: boolean;
  minLiquidity?: number;
  maxRugScore?: number;
  minPriceChange?: number;
}

// Market data types
export interface MarketData {
  tokenAddress: string;
  price: number;
  priceChange24h: number;
  volume24h: string;
  liquidity: string;
  marketCap: string;
  holders: number;
  trades24h: number;
}

export interface PricePoint {
  timestamp: Date;
  price: number;
  volume: string;
}

// Alert types
export interface Alert {
  id: string;
  type: 'new_token' | 'safe_token' | 'liquidity_add' | 'whale_trade' | 'pump' | 'rug';
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  data: any;
  timestamp: Date;
}

// Subscription types
export interface Subscription {
  userId: number;
  tier: 'free' | 'premium' | 'pro';
  startDate: Date;
  endDate: Date;
  paymentMethod?: string;
  autoRenew: boolean;
  features: string[];
}

// DEX types
export interface DEXPool {
  address: string;
  dex: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  liquidity: string;
  fee: number;
}

export interface Route {
  path: string[];
  pools: DEXPool[];
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  gasEstimate: string;
}

// Platform statistics
export interface PlatformStats {
  totalTokensCreated: number;
  totalVolume: string;
  totalUsers: number;
  totalFeesCollected: string;
  topTokensByVolume: Token[];
  recentLaunches: Token[];
  trending: Token[];
}