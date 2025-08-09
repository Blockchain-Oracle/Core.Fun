import { z } from 'zod';

// Event Types
export enum EventType {
  TOKEN_CREATED = 'TOKEN_CREATED',
  PAIR_CREATED = 'PAIR_CREATED',
  SWAP = 'SWAP',
  LIQUIDITY_ADDED = 'LIQUIDITY_ADDED',
  LIQUIDITY_REMOVED = 'LIQUIDITY_REMOVED',
  TRANSFER = 'TRANSFER',
  APPROVAL = 'APPROVAL',
  OWNERSHIP_TRANSFERRED = 'OWNERSHIP_TRANSFERRED',
}

// Token Schema
export const TokenSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  totalSupply: z.string(),
  creator: z.string(),
  createdAt: z.number(),
  blockNumber: z.number(),
  transactionHash: z.string(),
  isVerified: z.boolean().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
});

// Pair Schema
export const PairSchema = z.object({
  address: z.string(),
  token0: z.string(),
  token1: z.string(),
  reserve0: z.string(),
  reserve1: z.string(),
  totalSupply: z.string(),
  dex: z.string(),
  createdAt: z.number(),
  blockNumber: z.number(),
  transactionHash: z.string(),
});

// Trade Schema
export const TradeSchema = z.object({
  transactionHash: z.string(),
  blockNumber: z.number(),
  timestamp: z.number(),
  pair: z.string(),
  trader: z.string(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  amountOut: z.string(),
  priceImpact: z.number().optional(),
  gasUsed: z.string(),
  gasPrice: z.string(),
});

// Liquidity Event Schema
export const LiquidityEventSchema = z.object({
  transactionHash: z.string(),
  blockNumber: z.number(),
  timestamp: z.number(),
  pair: z.string(),
  provider: z.string(),
  token0Amount: z.string(),
  token1Amount: z.string(),
  liquidity: z.string(),
  type: z.enum(['ADD', 'REMOVE']),
});

// Token Analytics Schema
export const TokenAnalyticsSchema = z.object({
  address: z.string(),
  rugScore: z.number(), // 0-100
  isHoneypot: z.boolean(),
  ownershipConcentration: z.number(), // percentage
  liquidityUSD: z.number(),
  volume24h: z.number(),
  holders: z.number(),
  transactions24h: z.number(),
  priceUSD: z.number(),
  priceChange24h: z.number(),
  marketCapUSD: z.number(),
  circulatingSupply: z.string(),
  maxWalletPercent: z.number(),
  maxTransactionPercent: z.number(),
  buyTax: z.number(),
  sellTax: z.number(),
  isRenounced: z.boolean(),
  liquidityLocked: z.boolean(),
  liquidityLockExpiry: z.number().optional(),
});

// Alert Schema
export const AlertSchema = z.object({
  id: z.string(),
  type: z.enum([
    'NEW_TOKEN',
    'NEW_PAIR',
    'LARGE_BUY',
    'LARGE_SELL',
    'LIQUIDITY_ADDED',
    'LIQUIDITY_REMOVED',
    'RUG_WARNING',
    'HONEYPOT_DETECTED',
    'WHALE_ACTIVITY',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  tokenAddress: z.string(),
  message: z.string(),
  data: z.record(z.any()),
  timestamp: z.number(),
});

// Types
export type Token = z.infer<typeof TokenSchema>;
export type Pair = z.infer<typeof PairSchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type LiquidityEvent = z.infer<typeof LiquidityEventSchema>;
export type TokenAnalytics = z.infer<typeof TokenAnalyticsSchema>;
export type Alert = z.infer<typeof AlertSchema>;

// DEX Configuration
export interface DexConfig {
  name: string;
  factoryAddress: string;
  routerAddress: string;
  initCodeHash: string;
  feePercent: number;
}

// Monitor Configuration
export interface MonitorConfig {
  rpcUrl: string;
  wsUrl?: string;
  startBlock?: number;
  confirmations: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}

// Event Handler
export interface EventHandler<T = any> {
  handle(event: T): Promise<void>;
}

// Block Range
export interface BlockRange {
  fromBlock: number;
  toBlock: number;
}

// Queue Job
export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  attempts: number;
  createdAt: Date;
  processedAt?: Date;
  error?: string;
}