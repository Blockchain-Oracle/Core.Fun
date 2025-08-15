/**
 * Central configuration for the telegram bot
 */

// Network configuration
export const NETWORK_CONFIG = {
  // Use the testnet RPC as default
  RPC_URL: process.env.CORE_RPC_URL || 'https://rpc.test.btcs.network',
  CHAIN_ID: parseInt(process.env.CHAIN_ID || '1115'), // Core testnet
  EXPLORER_URL: process.env.EXPLORER_URL || 'https://scan.test.btcs.network',
};

// Contract addresses (from deployment)
export const CONTRACT_ADDRESSES = {
  MEME_FACTORY: process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  STAKING: process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  PLATFORM_TOKEN: process.env.PLATFORM_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655',
  TREASURY: process.env.TREASURY_ADDRESS || '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a',
};

// API configuration
export const API_CONFIG = {
  BASE_URL: process.env.API_URL || 'http://localhost:3001',
  WEBSOCKET_URL: process.env.WEBSOCKET_URL || 'ws://localhost:8081',
  TIMEOUT: parseInt(process.env.API_TIMEOUT || '30000'),
};

// Token configuration
export const TOKEN_CONFIG = {
  STAKING_TOKEN_SYMBOL: process.env.STAKING_TOKEN_SYMBOL || 'CMP',
  NATIVE_TOKEN_SYMBOL: 'CORE',
  DEFAULT_SLIPPAGE: 5, // 5%
  MAX_SLIPPAGE: 20, // 20%
};

// Trading configuration
export const TRADING_CONFIG = {
  MIN_LIQUIDITY_CORE: 0.1, // Minimum liquidity for token creation
  GRADUATION_TARGET: 3, // 3 CORE to graduate
  BONDING_CURVE_LIMIT: 500000, // 500k tokens on bonding curve
  PLATFORM_FEE: 0.01, // 1% platform fee
};

// Bot configuration
export const BOT_CONFIG = {
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 30, // 30 requests per minute
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
};

// Staking tiers (fallback if API fails)
export const DEFAULT_STAKING_TIERS = [
  {
    name: 'Free',
    minStake: 0,
    feeDiscount: 0,
    maxAlerts: 5,
    copyTradeSlots: 0,
    apiAccess: false,
    apy: 0,
  },
  {
    name: 'Bronze',
    minStake: 1000,
    feeDiscount: 1,
    maxAlerts: 10,
    copyTradeSlots: 1,
    apiAccess: false,
    apy: 10,
  },
  {
    name: 'Silver',
    minStake: 5000,
    feeDiscount: 2,
    maxAlerts: 25,
    copyTradeSlots: 3,
    apiAccess: false,
    apy: 15,
  },
  {
    name: 'Gold',
    minStake: 10000,
    feeDiscount: 3,
    maxAlerts: 50,
    copyTradeSlots: 5,
    apiAccess: true,
    apy: 20,
  },
  {
    name: 'Platinum',
    minStake: 50000,
    feeDiscount: 5,
    maxAlerts: -1, // Unlimited
    copyTradeSlots: 10,
    apiAccess: true,
    apy: 25,
  },
];