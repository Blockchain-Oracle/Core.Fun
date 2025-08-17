import { Router, Request, Response } from 'express'
import { ethers } from 'ethers'
import { createLogger } from '@core-meme/shared'
import { ContractDataService } from '@core-meme/shared'
import { DatabaseService } from '@core-meme/shared'

const router: Router = Router()
const logger = createLogger({ service: 'subscription-api' })

// Initialize services
const db = new DatabaseService()
const contractService = new ContractDataService(
  process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com',
  process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa'
)

// Staking contract ABI for direct calls
const STAKING_ABI = [
  'function getStakingStats(address user) view returns (uint256 stakedAmount, uint256 pendingRewardAmount, uint256 totalEarnedAmount, uint256 userTier, bool isPremium)',
  'function getUserTier(address user) view returns (uint256)',
  'function getUserFeeDiscount(address user) view returns (uint256)',
  'function pendingReward(address user) view returns (uint256)',
  'function stakes(address user) view returns (uint256 amount, uint256 rewardDebt, uint256 lastStakeTime, uint256 totalEarned, bool isPremium)'
]

// Utility function to safely convert values for ethers.formatEther()
function safeBigNumberValue(value: any): string {
  if (value === null || value === undefined) return '0'
  if (typeof value === 'string') {
    // Handle problematic string values
    if (value === '0.0' || value === '') return '0'
    // Remove any non-numeric characters except decimal point
    const cleaned = value.replace(/[^0-9.]/g, '')
    return cleaned || '0'
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  // For BigInt or other types, convert to string
  return value.toString()
}

// Tier mapping
const TIER_NAMES = ['free', 'bronze', 'silver', 'gold', 'platinum']
const TIER_THRESHOLDS = [0, 1000, 5000, 10000, 50000]
const TIER_BENEFITS = {
  free: {
    feeDiscount: 0,
    copyTradeSlots: 0,
    alertLimit: 5,
    prioritySupport: false,
    revenueShare: false
  },
  bronze: {
    feeDiscount: 1,
    copyTradeSlots: 3,
    alertLimit: 10,
    prioritySupport: false,
    revenueShare: true
  },
  silver: {
    feeDiscount: 2,
    copyTradeSlots: 5,
    alertLimit: 25,
    prioritySupport: false,
    revenueShare: true
  },
  gold: {
    feeDiscount: 3,
    copyTradeSlots: 10,
    alertLimit: 50,
    prioritySupport: true,
    revenueShare: true
  },
  platinum: {
    feeDiscount: 5,
    copyTradeSlots: 20,
    alertLimit: 100,
    prioritySupport: true,
    revenueShare: true
  }
}

/**
 * GET /subscription/status/:wallet
 * Get subscription status for a wallet address
 */
// Deprecated: inform clients to use /api/staking/status/:wallet
router.get('/status/:wallet', async (req: Request, res: Response) => {
  try {
    return res.status(410).json({
      success: false,
      error: 'Deprecated. Use /api/staking/status/:wallet instead.'
    })
  } catch {
    return res.status(410).json({ success: false, error: 'Deprecated endpoint' })
  }
})

/**
 * GET /subscription/tiers
 * Get all available subscription tiers
 */
// Deprecated: inform clients to use /api/staking/tiers
router.get('/tiers', async (_req: Request, res: Response) => {
  return res.status(410).json({ success: false, error: 'Deprecated. Use /api/staking/tiers instead.' })
})

/**
 * GET /subscription/stats
 * Get platform-wide subscription statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  return res.status(410).json({ success: false, error: 'Deprecated. Use /api/staking/stats instead.' })
})

/**
 * POST /subscription/claim/:wallet
 * Claim pending rewards for a wallet
 */
router.post('/claim/:wallet', async (_req: Request, res: Response) => {
  return res.status(410).json({ success: false, error: 'Deprecated. Use /api/staking/claim instead.' })
})

/**
 * GET /subscription/leaderboard
 * Get top stakers leaderboard
 */
router.get('/leaderboard', async (_req: Request, res: Response) => {
  return res.status(410).json({ success: false, error: 'Deprecated. Use /api/staking/leaderboard instead.' })
})

/**
 * Helper function to get tier features
 */
function getTierFeatures(tier: string): string[] {
  const features = {
    free: [
      'Basic trading features',
      'Limited alerts (5)',
      'Standard fee rates'
    ],
    bronze: [
      '1% fee discount',
      '3 copy trade slots',
      '10 price alerts',
      'Revenue sharing',
      'Bronze badge'
    ],
    silver: [
      '2% fee discount',
      '5 copy trade slots',
      '25 price alerts',
      'Revenue sharing',
      'Silver badge',
      'Advanced analytics'
    ],
    gold: [
      '3% fee discount',
      '10 copy trade slots',
      '50 price alerts',
      'Revenue sharing',
      'Gold badge',
      'Priority support',
      'Early access features'
    ],
    platinum: [
      '5% fee discount',
      '20 copy trade slots',
      'Unlimited alerts',
      'Revenue sharing',
      'Platinum badge',
      'Priority support',
      'Early access features',
      'Governance voting rights',
      'Exclusive events'
    ]
  }
  
  return features[tier as keyof typeof features] || features.free
}

/**
 * Helper function to get tier from stake amount
 */
function getTierFromStake(stakeAmount: number): number {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (stakeAmount >= TIER_THRESHOLDS[i]) {
      return i
    }
  }
  return 0
}

export default router