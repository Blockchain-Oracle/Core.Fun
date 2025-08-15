import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { createLogger, ContractDataService } from '@core-meme/shared';
import { DatabaseService } from '../services/DatabaseService';
import { WalletService } from '../../services/WalletService';
import { authenticate } from '../middleware/auth';

const router = Router();
const logger = createLogger({ service: 'staking-api' });

// Initialize services
const db = new DatabaseService();
const walletService = new WalletService();
const contractService = new ContractDataService(
  process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network',
  process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa'
);

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

    // Get staking data from contract
    const stakingData = await contractService.getUserStakingBenefits(wallet);
    
    // Get user from database
    const user = await db.getUserByWallet(wallet.toLowerCase());
    
    // Calculate tier from staked amount
    const stakedAmount = Number(stakingData.userStake);
    const tierIndex = stakingData.tier;
    const tierNames = ['Free', 'Bronze', 'Silver', 'Gold', 'Platinum'];
    const tierName = tierNames[tierIndex] || 'Free';
    
    // Get tier benefits
    const benefits = getTierBenefits(tierName);
    
    // Calculate progress to next tier
    let progressToNext = null;
    if (tierIndex < 4) { // 4 is Platinum, the highest tier
      const tierThresholds = [0, 1000, 5000, 10000, 50000];
      const nextThreshold = tierThresholds[tierIndex + 1];
      progressToNext = {
        currentStake: stakedAmount,
        requiredStake: nextThreshold,
        remaining: Math.max(0, nextThreshold - stakedAmount),
        percentage: Math.min(100, (stakedAmount / nextThreshold) * 100)
      };
    }
    
    res.json({
      wallet,
      subscription: {
        tier: tierName,
        tierLevel: tierIndex,
        isPremium: stakingData.isPremium,
        stakedAmount: stakedAmount,
        pendingRewards: Number(stakingData.pendingRewards),
        feeDiscount: stakingData.feeDiscount,
        benefits,
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
 * POST /staking/stake
 * Stake tokens
 */
router.post('/stake', authenticate, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const user = (req as any).user;
    
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: 'Invalid amount'
      });
    }
    
    // Get user's wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        error: 'User wallet not found'
      });
    }
    
    // Decrypt private key
    const privateKey = await walletService.decryptPrivateKey(
      userWallet.encryptedPrivateKey,
      user.telegramId
    );
    
    if (!privateKey) {
      return res.status(500).json({
        error: 'Failed to decrypt wallet'
      });
    }
    
    // Create wallet instance
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Create contract instances
    const stakingAddress = process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa';
    const tokenAddress = process.env.STAKING_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
    
    const stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, wallet);
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, wallet);
    
    // Convert amount to wei
    const amountWei = ethers.parseEther(amount);
    
    // Check token balance
    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance < amountWei) {
      return res.status(400).json({
        error: 'Insufficient token balance'
      });
    }
    
    // Check allowance
    const allowance = await tokenContract.allowance(wallet.address, stakingAddress);
    
    // If allowance is insufficient, approve first
    if (allowance < amountWei) {
      logger.info(`Approving ${amount} tokens for staking`);
      const approveTx = await tokenContract.approve(stakingAddress, amountWei);
      await approveTx.wait();
      logger.info(`Approval successful: ${approveTx.hash}`);
    }
    
    // Stake tokens
    logger.info(`Staking ${amount} tokens`);
    const tx = await stakingContract.stake(amountWei);
    const receipt = await tx.wait();
    
    logger.info(`Staking successful: ${tx.hash}`);
    
    // Update user subscription tier in database
    const stakingData = await contractService.getUserStakingBenefits(wallet.address);
    const tierIndex = stakingData.tier;
    const tierNames = ['free', 'bronze', 'silver', 'gold', 'platinum'];
    const tierName = tierNames[tierIndex] || 'free';
    
    // Update user subscription tier
    await db.updateUserSubscription(user.id, tierName);
    
    res.json({
      success: true,
      transaction: {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        amount
      },
      newStakingData: stakingData
    });
  } catch (error: any) {
    logger.error('Error staking tokens:', error);
    res.status(500).json({
      error: error.message || 'Failed to stake tokens'
    });
  }
});

/**
 * POST /staking/unstake
 * Unstake tokens
 */
router.post('/unstake', authenticate, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const user = (req as any).user;
    
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: 'Invalid amount'
      });
    }
    
    // Get user's wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        error: 'User wallet not found'
      });
    }
    
    // Decrypt private key
    const privateKey = await walletService.decryptPrivateKey(
      userWallet.encryptedPrivateKey,
      user.telegramId
    );
    
    if (!privateKey) {
      return res.status(500).json({
        error: 'Failed to decrypt wallet'
      });
    }
    
    // Create wallet instance
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Create staking contract instance
    const stakingAddress = process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa';
    const stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, wallet);
    
    // Convert amount to wei
    const amountWei = ethers.parseEther(amount);
    
    // Get current staking stats
    const stakingData = await contractService.getUserStakingBenefits(wallet.address);
    const stakedAmount = ethers.parseEther(stakingData.userStake);
    
    // Check if user has enough staked
    if (stakedAmount < amountWei) {
      return res.status(400).json({
        error: 'Insufficient staked amount'
      });
    }
    
    // Unstake tokens
    logger.info(`Unstaking ${amount} tokens`);
    const tx = await stakingContract.unstake(amountWei);
    const receipt = await tx.wait();
    
    logger.info(`Unstaking successful: ${tx.hash}`);
    
    // Update user subscription tier in database
    const newStakingData = await contractService.getUserStakingBenefits(wallet.address);
    const tierIndex = newStakingData.tier;
    const tierNames = ['free', 'bronze', 'silver', 'gold', 'platinum'];
    const tierName = tierNames[tierIndex] || 'free';
    
    // Update user subscription tier
    await db.updateUserSubscription(user.id, tierName);
    
    res.json({
      success: true,
      transaction: {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        amount
      },
      newStakingData
    });
  } catch (error: any) {
    logger.error('Error unstaking tokens:', error);
    res.status(500).json({
      error: error.message || 'Failed to unstake tokens'
    });
  }
});

/**
 * POST /staking/claim
 * Claim staking rewards
 */
router.post('/claim', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get user's wallet
    const userWallet = await db.getUserWallet(user.id);
    if (!userWallet) {
      return res.status(400).json({
        error: 'User wallet not found'
      });
    }
    
    // Decrypt private key
    const privateKey = await walletService.decryptPrivateKey(
      userWallet.encryptedPrivateKey,
      user.telegramId
    );
    
    if (!privateKey) {
      return res.status(500).json({
        error: 'Failed to decrypt wallet'
      });
    }
    
    // Create wallet instance
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Create staking contract instance
    const stakingAddress = process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa';
    const stakingContract = new ethers.Contract(stakingAddress, STAKING_ABI, wallet);
    
    // Get current staking stats
    const stakingData = await contractService.getUserStakingBenefits(wallet.address);
    
    // Check if user has pending rewards
    if (parseFloat(stakingData.pendingRewards) <= 0) {
      return res.status(400).json({
        error: 'No rewards to claim'
      });
    }
    
    // Claim rewards
    logger.info(`Claiming rewards for ${wallet.address}`);
    const tx = await stakingContract.claimRewards();
    const receipt = await tx.wait();
    
    logger.info(`Claiming rewards successful: ${tx.hash}`);
    
    // Get updated staking data
    const newStakingData = await contractService.getUserStakingBenefits(wallet.address);
    
    res.json({
      success: true,
      transaction: {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        amount: stakingData.pendingRewards
      },
      newStakingData
    });
  } catch (error: any) {
    logger.error('Error claiming rewards:', error);
    res.status(500).json({
      error: error.message || 'Failed to claim rewards'
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

export default router;
