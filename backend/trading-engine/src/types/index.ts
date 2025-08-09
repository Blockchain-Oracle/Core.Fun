import { z } from 'zod';
import Decimal from 'decimal.js';

// Trade Types
export enum TradeType {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum TradingPhase {
  BONDING_CURVE = 'BONDING_CURVE',
  DEX = 'DEX',
}

export enum RouteType {
  BONDING_CURVE = 'BONDING_CURVE',
  DEX_V2 = 'DEX_V2',
  DEX_V3 = 'DEX_V3',
  MULTI_HOP = 'MULTI_HOP',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Token State
export interface TokenState {
  address: string;
  phase: TradingPhase;
  isOurToken: boolean;
  isLaunched: boolean;
  isOpen: boolean;
  sold?: string;
  raised?: string;
  totalSupply?: string;
  canSell: boolean;
  currentPrice?: string;
  marketCap?: string;
  liquidity?: string;
  bondingCurveProgress?: number; // Percentage to launch
}

// Trade Parameters
export const TradeParamsSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  type: z.nativeEnum(TradeType),
  amount: z.string(), // Amount in wei
  slippageTolerance: z.number().min(0).max(50).default(2), // Percentage
  deadline: z.number().optional(), // Unix timestamp
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  minAmountOut: z.string().optional(), // Minimum tokens to receive
  maxAmountIn: z.string().optional(), // Maximum tokens to spend
  priorityFee: z.string().optional(), // For MEV protection
  usePrivateMempool: z.boolean().default(false),
});

export type TradeParams = z.infer<typeof TradeParamsSchema>;

// Route Information
export interface Route {
  type: RouteType;
  path: string[]; // Token addresses in order
  pools?: string[]; // Pool addresses for multi-hop
  dex?: string; // DEX name
  estimatedGas: string;
  priceImpact: number; // Percentage
  executionPrice: string; // Actual price per token
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  fee: string; // Total fees in wei
}

// Bonding Curve Specific
export interface BondingCurveQuote {
  tokensOut: string;
  costInWei: string;
  pricePerToken: string;
  currentSupply: string;
  targetSupply: string;
  progressPercent: number;
  nextPriceIncrement: string;
  willTriggerLaunch: boolean;
}

// DEX Quote
export interface DexQuote {
  dex: string;
  poolAddress: string;
  reserveIn: string;
  reserveOut: string;
  amountOut: string;
  priceImpact: number;
  executionPrice: string;
  fee: string;
  path: string[];
}

// Transaction Details
export interface TransactionDetails {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  gasPrice: string;
  gasLimit: string;
  nonce: number;
  chainId: number;
  status: TransactionStatus;
  blockNumber?: number;
  blockHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  timestamp?: number;
  error?: string;
}

// Trade Result
export interface TradeResult {
  success: boolean;
  transactionHash?: string;
  tokenAddress: string;
  type: TradeType;
  phase: TradingPhase;
  amountIn: string;
  amountOut: string;
  executionPrice: string;
  priceImpact: number;
  route: Route;
  gasUsed?: string;
  gasCost?: string;
  timestamp: number;
  error?: string;
  retries?: number;
}

// MEV Protection
export interface MEVProtectionConfig {
  enabled: boolean;
  useFlashbots: boolean;
  privateMempool: boolean;
  maxPriorityFee: string; // wei
  bundleTimeout: number; // milliseconds
  frontRunProtection: boolean;
  backRunProtection: boolean;
}

// Trading Config
export interface TradingConfig {
  network: 'mainnet' | 'testnet';
  rpcUrl: string;
  wsUrl?: string;
  memeFactoryAddress?: string;
  dexRouters: {
    [key: string]: {
      address: string;
      factory: string;
      initCodeHash: string;
    };
  };
  wcoreAddress: string;
  maxSlippage: number;
  defaultDeadline: number; // seconds
  maxGasPrice: string; // wei
  mevProtection: MEVProtectionConfig;
  retryConfig: {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
  };
}

// Price and Liquidity
export interface PriceInfo {
  tokenAddress: string;
  priceInCore: string;
  priceInUSD: string;
  liquidity: string;
  volume24h: string;
  priceChange24h: number;
  source: 'BONDING_CURVE' | 'DEX' | 'AGGREGATED';
}

// Analytics
export interface TradeAnalytics {
  totalTrades: number;
  successRate: number;
  totalVolume: string;
  totalGasUsed: string;
  averageSlippage: number;
  profitLoss: string;
  bestTrade?: TradeResult;
  worstTrade?: TradeResult;
}

// Error Types
export enum TradingError {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  EXCESSIVE_SLIPPAGE = 'EXCESSIVE_SLIPPAGE',
  PRICE_IMPACT_TOO_HIGH = 'PRICE_IMPACT_TOO_HIGH',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  TOKEN_NOT_TRADEABLE = 'TOKEN_NOT_TRADEABLE',
  DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
  GAS_PRICE_TOO_HIGH = 'GAS_PRICE_TOO_HIGH',
  MEV_ATTACK_DETECTED = 'MEV_ATTACK_DETECTED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class TradingEngineError extends Error {
  constructor(
    public code: TradingError,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TradingEngineError';
  }
}

// Event Types
export interface TradingEvents {
  'trade:initiated': TradeParams;
  'trade:routed': Route;
  'trade:submitted': TransactionDetails;
  'trade:confirmed': TradeResult;
  'trade:failed': { params: TradeParams; error: TradingEngineError };
  'price:updated': PriceInfo;
  'mev:detected': { transaction: TransactionDetails; threat: string };
  'slippage:warning': { expected: number; actual: number };
}