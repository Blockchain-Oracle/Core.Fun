import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { createLogger, ContractDataService, createRedisClient } from '@core-meme/shared';
import { DatabaseService } from '@core-meme/shared';
import { WalletService } from '@core-meme/shared';
import { AirdropService, getAirdropService } from '@core-meme/shared';
import { authenticate } from '../middleware/auth';

const router: Router = Router();
const logger = createLogger({ service: 'staking-api' });

// Initialize services
const db = new DatabaseService();
const walletService = new WalletService(db);
const contractService = new ContractDataService(
  process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com',
  process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa'
);
const redis = createRedisClient();
const airdropService = getAirdropService(db);
// Combined auth: accept Bearer JWT or Telegram ID header from bot
async function authenticateOrTelegram(req: Request, res: Response, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authenticate(req, res, next);
    }
    const tgHeader = req.headers['x-telegram-id'];
    const telegramIdStr = Array.isArray(tgHeader) ? tgHeader[0] : tgHeader;
    if (telegramIdStr) {
      const telegramId = parseInt(telegramIdStr as string, 10);
      if (!isFinite(telegramId)) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      // Try Redis first (best-effort)
      let userData: any | null = null;
      try {
        const userDataStr = await redis.get(`user:telegram:${telegramId}`);
        userData = userDataStr ? JSON.parse(userDataStr) : null;
      } catch (e) {
        logger.warn('Redis unavailable for auth, falling back to DB');
      }
      // Fallback to DB if Redis miss/unavailable
      if (!userData) {
        try {
          const dbUser = await db.getUserByTelegramId(telegramId);
          if (!dbUser) {
            return res.status(401).json({ error: 'Authentication required' });
          }
          userData = {
            id: dbUser.id,
            telegramId: dbUser.telegramId,
            username: dbUser.username,
            walletAddress: dbUser.walletAddress,
          };
        } catch (e) {
          logger.error('DB lookup failed during auth:', e);
          return res.status(401).json({ error: 'Authentication required' });
        }
      }
      (req as any).user = {
        id: userData.id,
        telegramId: userData.telegramId,
        username: userData.username,
        walletAddress: userData.walletAddress,
      };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    logger.error('Auth resolution failed:', error);
    return res.status(401).json({ error: 'Authentication required' });
  }
}

// Staking contract ABI for direct calls
const STAKING_ABI = [
  'function stake(uint256 amount) external',
  'function unstake(uint256 amount) external',
  'function claimRewards() external',
  'function getStakingStats(address user) view returns (uint256 stakedAmount, uint256 pendingRewardAmount, uint256 totalEarnedAmount, uint256 userTier, bool isPremium)',
];

// Platform token ABI for approvals
const TOKEN_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

/**
 * GET /staking/status/:wallet
 * Get staking status for a wallet address
 */
router.get('/status/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    
    if (!ethers.isAddress(wallet)) {
      return res.status(400).json({
        error: 'Invalid wallet address'
      });
    }

    // Get user's CMP balance
    const cmpBalance = await airdropService.checkCMPBalance(wallet);
    const balanceNum = parseFloat(cmpBalance);
    
    // Get user from database
    const user = await db.getUserByWallet(wallet.toLowerCase());
    
    // Calculate tier from CMP balance (not staked amount)
    const tierData = airdropService.getTierFromBalance(balanceNum);
    const tierName = tierData.tier;
    const tierIndex = tierData.tierLevel;
    
    // Get tier benefits
    const benefits = getTierBenefits(tierName);
    
    // Calculate progress to next tier
    let progressToNext = null;
    if (tierIndex < 4) { // 4 is Platinum, the highest tier
      const tierThresholds = [0, 1000, 5000, 10000, 50000];
      const nextThreshold = tierThresholds[tierIndex + 1];
      progressToNext = {
        currentBalance: balanceNum,
        requiredBalance: nextThreshold,
        remaining: Math.max(0, nextThreshold - balanceNum),
        percentage: Math.min(100, (balanceNum / nextThreshold) * 100)
      };
    }
    
    res.json({
      wallet,
      subscription: {
        tier: tierName,
        tierLevel: tierIndex,
        isPremium: tierIndex > 0,
        cmpBalance: balanceNum,
        feeDiscount: tierData.feeDiscount,
        benefits: tierData.benefits,
        progressToNext
      },
      user: user ? {
        userId: user.id,
        username: user.username,
        createdAt: user.createdAt
      } : null
    });
  } catch (error) {
    logger.error('Error fetching staking status:', error);
    res.status(500).json({
      error: 'Failed to fetch staking status'
    });
  }
});

/**
 * GET /staking/tiers
 * Get all available staking tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    const tierNames = ['Free', 'Bronze', 'Silver', 'Gold', 'Platinum'];
    const tierThresholds = [0, 1000, 5000, 10000, 50000];
    
    const tiers = tierNames.map((name, index) => ({
      name,
      level: index,
      minStake: tierThresholds[index],
      benefits: getTierBenefits(name),
      features: getTierFeatures(name)
    }));
    
    res.json({ tiers });
  } catch (error) {
    logger.error('Error fetching tiers:', error);
    res.status(500).json({
      error: 'Failed to fetch staking tiers'
    });
  }
});

/**
 * GET /staking/stats
 * Get platform-wide staking statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get provider and staking contract
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
    const stakingContract = new ethers.Contract(
      process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
      [
        'function totalStaked() view returns (uint256)',
        'function totalRewardsDistributed() view returns (uint256)',
        'function pool() view returns (uint256 totalStaked, uint256 accRewardPerShare, uint256 lastRewardTime, uint256 rewardRate)'
      ],
      provider
    );
    
    // Get contract stats
    const [totalStaked, totalRewards, pool] = await Promise.all([
      stakingContract.totalStaked().catch(() => 0n),
      stakingContract.totalRewardsDistributed().catch(() => 0n),
      stakingContract.pool().catch(() => [0n, 0n, 0n, 0n])
    ]);
    
    // Get tier distribution from database
    const tierDistribution = await db.getSubscriptionTierDistribution();
    
    // Get top stakers
    const topStakers = await db.getTopStakers(10);
    
    res.json({
      totalStaked: ethers.formatEther(totalStaked),
      totalRewardsDistributed: ethers.formatEther(totalRewards),
      rewardRate: ethers.formatEther(pool[3]),
      tierDistribution,
      topStakers,
      tokenSymbol: process.env.STAKING_TOKEN_SYMBOL || 'CMP',
      stakingAddress: process.env.STAKING_ADDRESS
    });
  } catch (error) {
    logger.error('Error fetching staking stats:', error);
    res.status(500).json({
      error: 'Failed to fetch staking statistics'
    });
  }
});

/**
 * GET /staking/leaderboard
 * Get top stakers leaderboard
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    
    // Get top stakers from database
    const topStakers = await db.getTopStakers(limit);
    
    res.json({ leaderboard: topStakers });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({
      error: 'Failed to fetch leaderboard'
    });
  }
});

/**
 * POST /staking/airdrop
 * Claim initial 1000 CMP tokens
 */
router.post('/airdrop', authenticateOrTelegram, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Check if user has a wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'No wallet found. Please create a wallet first.'
      });
    }
    
    // Check if already claimed
    const hasClaimed = await db.hasClaimedAirdrop(user.id);
    if (hasClaimed) {
      return res.status(400).json({
        success: false,
        error: 'You have already claimed your initial CMP tokens'
      });
    }
    
    // Send the airdrop
    const result = await airdropService.sendInitialAirdrop(user.id, userWallet.address);
    
    if (result.success) {
      // Get updated balance
      const newBalance = await airdropService.checkCMPBalance(userWallet.address);
      const tierData = airdropService.getTierFromBalance(parseFloat(newBalance));
      
      res.json({
        success: true,
        data: {
          txHash: result.txHash,
          amount: result.amount,
          newBalance: newBalance,
          newTier: tierData.tier,
          message: `Successfully claimed ${result.amount} CMP! You are now ${tierData.tier} tier.`
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to send airdrop'
      });
    }
  } catch (error: any) {
    logger.error('Airdrop endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process airdrop'
    });
  }
});

/**
 * POST /staking/stake
 * Legacy endpoint - now returns message about balance-based system
 */
router.post('/stake', authenticateOrTelegram, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get user's wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'No wallet found'
      });
    }
    
    // Check current balance
    const cmpBalance = await airdropService.checkCMPBalance(userWallet.address);
    const tierData = airdropService.getTierFromBalance(parseFloat(cmpBalance));
    
    res.json({
      success: true,
      message: 'Staking is now automatic! Your tier is based on your CMP token balance.',
      data: {
        currentBalance: cmpBalance,
        currentTier: tierData.tier,
        feeDiscount: tierData.feeDiscount,
        info: 'Just hold CMP tokens in your wallet to enjoy tier benefits. No staking required!'
      }
    });
  } catch (error: any) {
    logger.error('Error in stake endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check balance'
    });
  }
});

/**
 * POST /staking/unstake
 * Legacy endpoint - now returns message about balance-based system
 */
router.post('/unstake', authenticateOrTelegram, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get user's wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'No wallet found'
      });
    }
    
    // Check current balance
    const cmpBalance = await airdropService.checkCMPBalance(userWallet.address);
    const tierData = airdropService.getTierFromBalance(parseFloat(cmpBalance));
    
    res.json({
      success: true,
      message: 'No unstaking needed! Your tier is automatically based on your CMP balance.',
      data: {
        currentBalance: cmpBalance,
        currentTier: tierData.tier,
        info: 'You can transfer or sell your CMP tokens anytime. Your tier adjusts automatically based on your balance.'
      }
    });
  } catch (error: any) {
    logger.error('Error in unstake endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check balance'
    });
  }
});

/**
 * POST /staking/claim
 * Legacy endpoint - now returns message about balance-based system
 */
router.post('/claim', authenticateOrTelegram, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get user's wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: 'No wallet found'
      });
    }
    
    // Check if they can claim initial airdrop
    const hasClaimed = await db.hasClaimedAirdrop(user.id);
    
    if (!hasClaimed) {
      res.json({
        success: true,
        message: 'No staking rewards to claim, but you can claim your initial 1000 CMP tokens!',
        data: {
          airdropAvailable: true,
          amount: '1000 CMP',
          info: 'Use /claimcmp to get your initial tokens, or call POST /staking/airdrop'
        }
      });
    } else {
      const cmpBalance = await airdropService.checkCMPBalance(userWallet.address);
      const tierData = airdropService.getTierFromBalance(parseFloat(cmpBalance));
      
      res.json({
        success: true,
        message: 'No staking rewards in the new system. Your tier benefits are automatic!',
        data: {
          currentBalance: cmpBalance,
          currentTier: tierData.tier,
          benefits: tierData.benefits,
          info: 'Hold CMP tokens to maintain your tier. Buy more on DEX to upgrade!'
        }
      });
    }
  } catch (error: any) {
    logger.error('Error in claim endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check status'
    });
  }
});

/**
 * Helper function to get tier benefits
 */
function getTierBenefits(tier: string) {
  const benefits = {
    'Free': {
      feeDiscount: 0,
      copyTradeSlots: 0,
      alertLimit: 5,
      prioritySupport: false,
      revenueShare: false
    },
    'Bronze': {
      feeDiscount: 1,
      copyTradeSlots: 3,
      alertLimit: 10,
      prioritySupport: false,
      revenueShare: true
    },
    'Silver': {
      feeDiscount: 2,
      copyTradeSlots: 5,
      alertLimit: 25,
      prioritySupport: false,
      revenueShare: true
    },
    'Gold': {
      feeDiscount: 3,
      copyTradeSlots: 10,
      alertLimit: 50,
      prioritySupport: true,
      revenueShare: true
    },
    'Platinum': {
      feeDiscount: 5,
      copyTradeSlots: 20,
      alertLimit: 100,
      prioritySupport: true,
      revenueShare: true
    }
  };
  
  return benefits[tier as keyof typeof benefits] || benefits['Free'];
}

/**
 * Helper function to get tier features
 */
function getTierFeatures(tier: string): string[] {
  const features = {
    'Free': [
      'Basic trading features',
      'Limited alerts (5)',
      'Standard fee rates'
    ],
    'Bronze': [
      '1% fee discount',
      '3 copy trade slots',
      '10 price alerts',
      'Revenue sharing',
      'Bronze badge'
    ],
    'Silver': [
      '2% fee discount',
      '5 copy trade slots',
      '25 price alerts',
      'Revenue sharing',
      'Silver badge',
      'Advanced analytics'
    ],
    'Gold': [
      '3% fee discount',
      '10 copy trade slots',
      '50 price alerts',
      'Revenue sharing',
      'Gold badge',
      'Priority support',
      'Early access features'
    ],
    'Platinum': [
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
  };
  
  return features[tier as keyof typeof features] || features['Free'];
}

/**
 * Get minimum stake required for a given tier
 */
function getMinStakeForTier(tier: number): number {
  const minStakes = [0, 1000, 10000, 50000, 100000]; // Free, Bronze, Silver, Gold, Platinum
  return minStakes[tier] || 0;
}

/**
 * GET /staking/:address
 * Get staking info for an address (frontend compatibility route)
 * This route matches what the frontend expects
 */
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address'
      });
    }

    // Get staking data from contract
    const stakingData = await contractService.getUserStakingBenefits(address);
    
    // Format response to match frontend expectations
    const tierNames = ['free', 'bronze', 'silver', 'gold', 'platinum'];
    const tierName = tierNames[stakingData.tier] || 'free';
    
    res.json({
      success: true,
      data: {
        amount: stakingData.userStake,
        rewardDebt: '0', // Not exposed by contract
        lastStakeTime: Date.now() - 86400000, // Placeholder
        totalEarned: stakingData.totalEarned || '0',
        isPremium: stakingData.isPremium,
        tier: {
          name: tierName.charAt(0).toUpperCase() + tierName.slice(1),
          minStake: getMinStakeForTier(stakingData.tier).toString(),
          feeDiscount: stakingData.feeDiscount,
          hasAccess: true
        },
        pendingRewards: stakingData.pendingRewards || '0'
      }
    });
  } catch (error: any) {
    logger.error('Error fetching staking info:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch staking info'
    });
  }
});

export default router;
