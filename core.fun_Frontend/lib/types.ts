// Type definitions for the MemeFactory platform

export interface TokenSale {
  token: string
  name: string
  symbol: string
  creator: string
  sold: string // Amount of tokens sold
  raised: string // Amount of CORE raised
  isOpen: boolean
  isLaunched: boolean
  createdAt: number
  launchedAt?: number
  progress: number // Percentage to graduation (sold/500K * 100)
  currentPrice: string // Current bonding curve price
  priceImpact?: number
  metadata?: TokenMetadata
}

export interface TokenMetadata {
  description?: string
  image?: string
  twitter?: string
  telegram?: string
  website?: string
}

// Keep Collection for backward compatibility, map from TokenSale
export interface Collection {
  id: string
  chain: 'core'
  name: string
  symbol: string
  age: string
  price: number
  change1h: number
  change24h: number
  progress: number // Progress to graduation instead of liquidity ratio
  sold: number // Tokens sold
  raised: number // CORE raised
  holders: number
  volume: number
  marketCap: number
  txs: number // Transactions count
  rank: number
  volumeSeries: number[]
  sparkline: number[]
  candles: Array<{
    o: number
    h: number
    l: number
    c: number
  }>
  isLaunched: boolean
  creator: string
}

export interface TokenCreationParams {
  name: string
  symbol: string
  description?: string
  image?: string
  twitter?: string
  telegram?: string
  website?: string
}

// Bonding curve specific types
export interface BondingCurveQuote {
  tokensOut?: string
  coreOut?: string
  pricePerToken: string
  priceImpact: number
  fee: string
  minReceived: string
  type: 'buy' | 'sell'
}

export interface StakingTier {
  name: string
  minStake: string
  feeDiscount: number // Basis points (100 = 1%)
  hasAccess: boolean
}

export interface StakingInfo {
  amount: string
  rewardDebt: string
  lastStakeTime: number
  totalEarned: string
  isPremium: boolean
  tier?: StakingTier
  pendingRewards: string
}

export interface TradeParams {
  tokenAddress: string
  amount: string
  slippage?: number
}

export interface UserTransaction {
  txHash: string
  type: 'createToken' | 'buyToken' | 'sellToken'
  params: any
  status: 'pending' | 'success' | 'failed'
  blockNumber?: number
  gasUsed?: string
  effectiveGasPrice?: string
  timestamp: number
}

export interface WalletBalance {
  address: string
  coreBalance: string
  tokenBalances: Array<{
    token: string
    symbol: string
    balance: string
    value: number
  }>
  totalValue: number
}

export interface ChartData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderBook {
  bids: Array<{ price: number; amount: number }>
  asks: Array<{ price: number; amount: number }>
  spread: number
  midPrice: number
}

export interface TokenStats {
  price: number
  priceChange24h: number
  volume24h: number
  marketCap: number
  liquidity: number
  holders: number
  transactions24h: number
  circulatingSupply: string
  totalSupply: string
  fullyDilutedValue: number
}

export interface Alert {
  id: string
  userId: string
  tokenAddress: string
  type: 'price_above' | 'price_below' | 'volume_above' | 'new_trade' | 'large_trade'
  threshold: number
  active: boolean
  createdAt: number
  triggeredAt?: number
}

export interface Portfolio {
  totalValue: number
  totalCost: number
  totalProfit: number
  profitPercentage: number
  positions: Array<{
    tokenAddress: string
    symbol: string
    balance: string
    averageCost: number
    currentValue: number
    profit: number
    profitPercentage: number
  }>
}

export interface LeaderboardEntry {
  rank: number
  address: string
  username?: string
  profit: number
  profitPercentage: number
  trades: number
  winRate: number
  volume: number
}

export interface NotificationSettings {
  priceAlerts: boolean
  tradeAlerts: boolean
  newTokenAlerts: boolean
  graduationAlerts: boolean
  systemAlerts: boolean
  emailNotifications: boolean
  telegramNotifications: boolean
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system'
  language: string
  currency: 'USD' | 'EUR' | 'GBP' | 'CORE'
  slippage: number
  gasPrice: 'slow' | 'normal' | 'fast' | 'custom'
  customGasPrice?: string
  notifications: NotificationSettings
}