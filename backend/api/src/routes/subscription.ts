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
router.get('/status/:wallet', async (req: Request, res: Response) => {
  const walletParam = req.params.wallet
  try {
    const wallet = walletParam
    
    if (!ethers.isAddress(wallet)) {
      return res.status(400).json({
        error: 'Invalid wallet address'
      })
    }

    // Get staking data from contract
    const stakingData = await contractService.getUserStakingBenefits(wallet)
    
    // Get user from database
    const user = await db.getUserByWallet(wallet.toLowerCase())
    
    // Calculate tier from staked amount
    // Use safe conversion for BigNumber operations
    const safeUserStakeValue = safeBigNumberValue(stakingData.userStake)
    const stakedAmount = Number(ethers.formatEther(safeUserStakeValue))
    const tierIndex = Math.min(stakingData.tier || 0, TIER_NAMES.length - 1)
    const tierName = TIER_NAMES[tierIndex]
    
    // Get tier benefits
    const benefits = TIER_BENEFITS[tierName as keyof typeof TIER_BENEFITS]
    
    // Calculate progress to next tier
    let progressToNext = null
    if (tierIndex < TIER_NAMES.length - 1) {
      const nextThreshold = TIER_THRESHOLDS[tierIndex + 1]
      progressToNext = {
        currentStake: stakedAmount,
        requiredStake: nextThreshold,
        remaining: nextThreshold - stakedAmount,
        percentage: (stakedAmount / nextThreshold) * 100
      }
    }
    
    res.json({
      success: true,
      data: {
        wallet: wallet,
        stakedAmount: stakedAmount.toString(),
        tier: tierName,
        rewards: Number(ethers.formatEther(safeBigNumberValue(stakingData.pendingRewards))).toString(),
        apy: 12, // Default APY - could be calculated dynamically
        lockEndTime: 0, // No lock period in current implementation
        canUnstake: stakedAmount > 0,
        feeDiscount: stakingData.feeDiscount || 0,
        maxAlerts: benefits.alertLimit,
        copyTradeSlots: benefits.copyTradeSlots,
        hasApiAccess: benefits.prioritySupport,
        lastClaimTime: 0, // Could be tracked if needed
        
        // Keep the original structure for backward compatibility
        subscription: {
          tier: tierName,
          tierLevel: tierIndex,
          isPremium: stakingData.tier > 0,
          stakedAmount: stakedAmount,
          pendingRewards: Number(ethers.formatEther(safeBigNumberValue(stakingData.pendingRewards))),
          feeDiscount: stakingData.feeDiscount || 0,
          benefits,
          progressToNext
        },
        user: user ? {
          userId: user.id,
          username: user.username,
          createdAt: user.createdAt
        } : null
      }
    })
  } catch (error) {
    logger.error('Error fetching subscription status for wallet:', walletParam, error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription status'
    })
  }
})

/**
 * GET /subscription/tiers
 * Get all available subscription tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    const tiers = TIER_NAMES.map((name, index) => ({
      name,
      level: index,
      minStake: TIER_THRESHOLDS[index],
      benefits: TIER_BENEFITS[name as keyof typeof TIER_BENEFITS],
      features: getTierFeatures(name)
    }))
    
    res.json({ tiers })
  } catch (error) {
    logger.error('Error fetching tiers:', error)
    res.status(500).json({
      error: 'Failed to fetch subscription tiers'
    })
  }
})

/**
 * GET /subscription/stats
 * Get platform-wide subscription statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get provider and staking contract
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL)
    const stakingContract = new ethers.Contract(
      process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
      [
        'function totalStaked() view returns (uint256)',
        'function totalRewardsDistributed() view returns (uint256)',
        'function activeStakers() view returns (uint256)'
      ],
      provider
    )
    
    // Get contract stats
    const [totalStaked, totalRewards, activeStakers] = await Promise.all([
      stakingContract.totalStaked().catch(() => 0n),
      stakingContract.totalRewardsDistributed().catch(() => 0n),
      stakingContract.activeStakers().catch(() => 0n)
    ])
    
    // Get tier distribution from database
    const tierDistribution = await db.getSubscriptionTierDistribution()
    
    res.json({
      totalStaked: ethers.formatEther(totalStaked),
      totalRewardsDistributed: ethers.formatEther(totalRewards),
      activeStakers: Number(activeStakers),
      tierDistribution,
      tokenSymbol: process.env.STAKING_TOKEN_SYMBOL || 'CMP',
      stakingAddress: process.env.STAKING_ADDRESS
    })
  } catch (error) {
    logger.error('Error fetching subscription stats:', error)
    res.status(500).json({
      error: 'Failed to fetch subscription statistics'
    })
  }
})

/**
 * POST /subscription/claim/:wallet
 * Claim pending rewards for a wallet
 */
router.post('/claim/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params
    
    if (!ethers.isAddress(wallet)) {
      return res.status(400).json({
        error: 'Invalid wallet address'
      })
    }
    
    // Note: This endpoint would typically require authentication
    // and would execute the claim transaction on behalf of the user
    // For now, we just return the pending rewards
    
    const pendingRewards = await contractService.getUserStakingBenefits(wallet)
    
    res.json({
      wallet,
      pendingRewards: ethers.formatEther(pendingRewards.pendingRewards || '0'),
      message: 'Use the Telegram bot or web interface to claim rewards'
    })
  } catch (error) {
    logger.error('Error processing claim:', error)
    res.status(500).json({
      error: 'Failed to process claim request'
    })
  }
})

/**
 * GET /subscription/leaderboard
 * Get top stakers leaderboard
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)
    
    // Get top stakers from database
    const topStakers = await db.getTopStakers(limit)
    
    // Enrich with tier information
    const leaderboard = topStakers.map((staker: any, index: number) => {
      const tierIndex = getTierFromStake(staker.staked_amount)
      return {
        rank: index + 1,
        wallet: staker.wallet_address,
        username: staker.username,
        stakedAmount: staker.staked_amount,
        tier: TIER_NAMES[tierIndex],
        totalEarned: staker.total_earned || 0
      }
    })
    
    res.json({ leaderboard })
  } catch (error) {
    logger.error('Error fetching leaderboard:', error)
    res.status(500).json({
      error: 'Failed to fetch leaderboard'
    })
  }
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