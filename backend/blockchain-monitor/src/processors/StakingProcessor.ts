import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { DatabaseService } from '../services/DatabaseService';
import Redis from 'ioredis';
import winston from 'winston';

// Staking contract ABI - Events only
const STAKING_ABI = [
  'event Staked(address indexed user, uint256 amount, uint256 timestamp)',
  'event Unstaked(address indexed user, uint256 amount, uint256 timestamp)',
  'event RewardsClaimed(address indexed user, uint256 amount)',
  'event TierUpdated(address indexed user, uint256 tierLevel)',
  'event RevenueDistributed(uint256 amount, uint256 timestamp)',
  // View functions for getting user data
  'function stakes(address user) view returns (uint256 amount, uint256 rewardDebt, uint256 lastStakeTime, uint256 totalEarned, bool isPremium)',
  'function getUserTier(address user) view returns (uint256)',
  'function getUserFeeDiscount(address user) view returns (uint256)',
  'function pendingReward(address user) view returns (uint256)',
  'function getStakingStats(address user) view returns (uint256 stakedAmount, uint256 pendingRewardAmount, uint256 totalEarnedAmount, uint256 userTier, bool isPremium)'
];

// Tier mapping
const TIER_NAMES = ['free', 'bronze', 'silver', 'gold', 'platinum'];
const TIER_THRESHOLDS = [0, 1000, 5000, 10000, 50000];

export class StakingProcessor extends EventEmitter {
  private provider: ethers.JsonRpcProvider;
  private stakingContract: ethers.Contract;
  private db: DatabaseService;
  private redis: Redis;
  private logger: winston.Logger;
  private lastProcessedBlock: number = 0;
  
  // Contract addresses
  private readonly STAKING_ADDRESS: string;
  private readonly PLATFORM_TOKEN_ADDRESS: string;
  
  constructor(
    provider: ethers.JsonRpcProvider,
    db: DatabaseService,
    redis: Redis,
    logger: winston.Logger
  ) {
    super();
    this.provider = provider;
    this.db = db;
    this.redis = redis;
    this.logger = logger;
    
    // Get addresses from environment
    this.STAKING_ADDRESS = process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa';
    this.PLATFORM_TOKEN_ADDRESS = process.env.PLATFORM_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
    
    // Initialize staking contract
    this.stakingContract = new ethers.Contract(
      this.STAKING_ADDRESS,
      STAKING_ABI,
      this.provider
    );
    
    this.logger.info('StakingProcessor initialized', {
      stakingAddress: this.STAKING_ADDRESS,
      tokenAddress: this.PLATFORM_TOKEN_ADDRESS
    });
  }

  /**
   * Start processing staking events
   */
  async start(): Promise<void> {
    this.logger.info('Starting StakingProcessor...');
    
    // Get last processed block from database or use current block
    const lastBlock = await this.getLastProcessedBlock();
    this.lastProcessedBlock = lastBlock;
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Process historical events if needed
    await this.processHistoricalEvents(lastBlock);
    
    // Start periodic sync
    this.startPeriodicSync();
    
    this.logger.info('StakingProcessor started successfully');
  }

  /**
   * Setup real-time event listeners
   */
  private setupEventListeners(): void {
    // Listen for Staked events
    this.stakingContract.on('Staked', async (user, amount, timestamp, event) => {
      this.logger.info('Staked event detected', {
        user,
        amount: ethers.formatEther(amount),
        timestamp: timestamp.toString(),
        block: event.blockNumber
      });
      
      await this.processStakedEvent(user, amount, timestamp, event);
    });
    
    // Listen for Unstaked events
    this.stakingContract.on('Unstaked', async (user, amount, timestamp, event) => {
      this.logger.info('Unstaked event detected', {
        user,
        amount: ethers.formatEther(amount),
        timestamp: timestamp.toString(),
        block: event.blockNumber
      });
      
      await this.processUnstakedEvent(user, amount, timestamp, event);
    });
    
    // Listen for RewardsClaimed events
    this.stakingContract.on('RewardsClaimed', async (user, amount, event) => {
      this.logger.info('RewardsClaimed event detected', {
        user,
        amount: ethers.formatEther(amount),
        block: event.blockNumber
      });
      
      await this.processRewardsClaimedEvent(user, amount, event);
    });
    
    // Listen for TierUpdated events
    this.stakingContract.on('TierUpdated', async (user, tierLevel, event) => {
      this.logger.info('TierUpdated event detected', {
        user,
        tierLevel: tierLevel.toString(),
        block: event.blockNumber
      });
      
      await this.processTierUpdatedEvent(user, tierLevel, event);
    });
    
    // Listen for RevenueDistributed events
    this.stakingContract.on('RevenueDistributed', async (amount, timestamp, event) => {
      this.logger.info('RevenueDistributed event detected', {
        amount: ethers.formatEther(amount),
        timestamp: timestamp.toString(),
        block: event.blockNumber
      });
      
      await this.processRevenueDistributedEvent(amount, timestamp, event);
    });
  }

  /**
   * Process Staked event
   */
  private async processStakedEvent(
    user: string,
    amount: bigint,
    timestamp: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    try {
      // Get user's complete staking data
      const stakingStats = await this.stakingContract.getStakingStats(user);
      const [stakedAmount, pendingRewards, totalEarned, userTier, isPremium] = stakingStats;
      
      // Get tier name
      const tierName = this.getTierName(Number(userTier));
      
      // Find user in database by wallet address
      const userRecord = await this.db.db('users')
        .where('wallet_address', user.toLowerCase())
        .first();
      
      if (userRecord) {
        // Update user's subscription tier in database
        await this.db.db('users')
          .where('id', userRecord.id)
          .update({
            subscription_tier: tierName,
            is_premium: isPremium,
            updated_at: new Date()
          });
        
        // Update or create subscription record
        await this.db.db('subscriptions')
          .insert({
            user_id: userRecord.id,
            tier: tierName,
            payment_method: 'staking',
            status: 'active',
            amount: Number(ethers.formatEther(amount)),
            currency: 'CMP',
            created_at: new Date(),
            updated_at: new Date()
          })
          .onConflict('user_id')
          .merge({
            tier: tierName,
            status: 'active',
            amount: Number(ethers.formatEther(stakedAmount)),
            updated_at: new Date()
          });
      }
      
      // Emit WebSocket event for real-time updates
      await this.redis.publish('subscription:update', JSON.stringify({
        type: 'STAKE',
        wallet: user,
        amount: ethers.formatEther(amount),
        totalStaked: ethers.formatEther(stakedAmount),
        tier: tierName,
        tierLevel: Number(userTier),
        isPremium,
        timestamp: Number(timestamp),
        txHash: event.transactionHash
      }));
      
      // Update last processed block
      await this.updateLastProcessedBlock(event.blockNumber);
      
      this.emit('staked', {
        user,
        amount: ethers.formatEther(amount),
        tier: tierName,
        txHash: event.transactionHash
      });
    } catch (error) {
      this.logger.error('Error processing Staked event:', error);
    }
  }

  /**
   * Process Unstaked event
   */
  private async processUnstakedEvent(
    user: string,
    amount: bigint,
    timestamp: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    try {
      // Get updated staking data
      const stakingStats = await this.stakingContract.getStakingStats(user);
      const [stakedAmount, pendingRewards, totalEarned, userTier, isPremium] = stakingStats;
      
      const tierName = this.getTierName(Number(userTier));
      const isActive = Number(stakedAmount) > 0;
      
      // Find user in database
      const userRecord = await this.db.db('users')
        .where('wallet_address', user.toLowerCase())
        .first();
      
      if (userRecord) {
        // Update user's subscription tier
        await this.db.db('users')
          .where('id', userRecord.id)
          .update({
            subscription_tier: isActive ? tierName : 'free',
            is_premium: isActive && isPremium,
            updated_at: new Date()
          });
        
        // Update subscription record
        await this.db.db('subscriptions')
          .where('user_id', userRecord.id)
          .update({
            tier: isActive ? tierName : 'free',
            status: isActive ? 'active' : 'inactive',
            amount: Number(ethers.formatEther(stakedAmount)),
            updated_at: new Date()
          });
      }
      
      // Emit WebSocket event
      await this.redis.publish('subscription:update', JSON.stringify({
        type: 'UNSTAKE',
        wallet: user,
        amount: ethers.formatEther(amount),
        totalStaked: ethers.formatEther(stakedAmount),
        tier: tierName,
        tierLevel: Number(userTier),
        isPremium: isActive && isPremium,
        timestamp: Number(timestamp),
        txHash: event.transactionHash
      }));
      
      await this.updateLastProcessedBlock(event.blockNumber);
      
      this.emit('unstaked', {
        user,
        amount: ethers.formatEther(amount),
        remainingStake: ethers.formatEther(stakedAmount),
        tier: tierName,
        txHash: event.transactionHash
      });
    } catch (error) {
      this.logger.error('Error processing Unstaked event:', error);
    }
  }

  /**
   * Process RewardsClaimed event
   */
  private async processRewardsClaimedEvent(
    user: string,
    amount: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    try {
      // Emit WebSocket event for notification
      await this.redis.publish('staking:rewards', JSON.stringify({
        type: 'REWARDS_CLAIMED',
        wallet: user,
        amount: ethers.formatEther(amount),
        txHash: event.transactionHash,
        timestamp: Date.now()
      }));
      
      await this.updateLastProcessedBlock(event.blockNumber);
      
      this.emit('rewardsClaimed', {
        user,
        amount: ethers.formatEther(amount),
        txHash: event.transactionHash
      });
    } catch (error) {
      this.logger.error('Error processing RewardsClaimed event:', error);
    }
  }

  /**
   * Process TierUpdated event
   */
  private async processTierUpdatedEvent(
    user: string,
    tierLevel: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    try {
      const tierName = this.getTierName(Number(tierLevel));
      const feeDiscount = await this.stakingContract.getUserFeeDiscount(user);
      
      // Find user and update tier
      const userRecord = await this.db.db('users')
        .where('wallet_address', user.toLowerCase())
        .first();
      
      if (userRecord) {
        await this.db.db('users')
          .where('id', userRecord.id)
          .update({
            subscription_tier: tierName,
            updated_at: new Date()
          });
      }
      
      // Emit WebSocket event
      await this.redis.publish('subscription:tier', JSON.stringify({
        type: 'TIER_UPDATED',
        wallet: user,
        tierLevel: Number(tierLevel),
        tierName,
        feeDiscount: Number(feeDiscount),
        txHash: event.transactionHash,
        timestamp: Date.now()
      }));
      
      await this.updateLastProcessedBlock(event.blockNumber);
      
      this.emit('tierUpdated', {
        user,
        tierLevel: Number(tierLevel),
        tierName,
        txHash: event.transactionHash
      });
    } catch (error) {
      this.logger.error('Error processing TierUpdated event:', error);
    }
  }

  /**
   * Process RevenueDistributed event
   */
  private async processRevenueDistributedEvent(
    amount: bigint,
    timestamp: bigint,
    event: ethers.EventLog
  ): Promise<void> {
    try {
      // Track revenue distribution
      await this.db.db('platform_metrics')
        .insert({
          metric_type: 'revenue_distributed',
          value: Number(ethers.formatEther(amount)),
          timestamp: new Date(Number(timestamp) * 1000),
          metadata: {
            txHash: event.transactionHash,
            blockNumber: event.blockNumber
          }
        });
      
      // Emit WebSocket event for all stakers
      await this.redis.publish('staking:revenue', JSON.stringify({
        type: 'REVENUE_DISTRIBUTED',
        amount: ethers.formatEther(amount),
        timestamp: Number(timestamp),
        txHash: event.transactionHash
      }));
      
      await this.updateLastProcessedBlock(event.blockNumber);
      
      this.emit('revenueDistributed', {
        amount: ethers.formatEther(amount),
        timestamp: Number(timestamp),
        txHash: event.transactionHash
      });
    } catch (error) {
      this.logger.error('Error processing RevenueDistributed event:', error);
    }
  }

  /**
   * Process historical events from a starting block
   */
  private async processHistoricalEvents(fromBlock: number): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      if (fromBlock >= currentBlock) {
        return; // No historical events to process
      }
      
      this.logger.info(`Processing historical staking events from block ${fromBlock} to ${currentBlock}`);
      
      // Process in chunks to avoid RPC limits
      const chunkSize = 1000;
      for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        
        // Get all events in this chunk
        const stakedEvents = await this.stakingContract.queryFilter(
          this.stakingContract.filters.Staked(),
          startBlock,
          endBlock
        );
        
        const unstakedEvents = await this.stakingContract.queryFilter(
          this.stakingContract.filters.Unstaked(),
          startBlock,
          endBlock
        );
        
        // Process events
        for (const event of stakedEvents) {
          if (event instanceof ethers.EventLog) {
            await this.processStakedEvent(
              event.args[0],
              event.args[1],
              event.args[2],
              event
            );
          }
        }
        
        for (const event of unstakedEvents) {
          if (event instanceof ethers.EventLog) {
            await this.processUnstakedEvent(
              event.args[0],
              event.args[1],
              event.args[2],
              event
            );
          }
        }
        
        this.logger.info(`Processed blocks ${startBlock} to ${endBlock}`);
      }
    } catch (error) {
      this.logger.error('Error processing historical events:', error);
    }
  }

  /**
   * Start periodic sync to catch any missed events
   */
  private startPeriodicSync(): void {
    setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const lastProcessed = await this.getLastProcessedBlock();
        
        if (currentBlock > lastProcessed + 10) {
          // We're behind, catch up
          this.logger.warn(`Catching up from block ${lastProcessed} to ${currentBlock}`);
          await this.processHistoricalEvents(lastProcessed);
        }
      } catch (error) {
        this.logger.error('Error in periodic sync:', error);
      }
    }, 60000); // Check every minute
  }

  /**
   * Get tier name from tier level
   */
  private getTierName(tierLevel: number): string {
    if (tierLevel >= 0 && tierLevel < TIER_NAMES.length) {
      return TIER_NAMES[tierLevel];
    }
    return 'free';
  }

  /**
   * Get last processed block from database
   */
  private async getLastProcessedBlock(): Promise<number> {
    try {
      const result = await this.db.db('blockchain_state')
        .where('processor', 'staking')
        .first();
      
      if (result) {
        return result.last_block;
      }
      
      // If no record, start from current block
      const currentBlock = await this.provider.getBlockNumber();
      await this.db.db('blockchain_state')
        .insert({
          processor: 'staking',
          last_block: currentBlock,
          updated_at: new Date()
        });
      
      return currentBlock;
    } catch (error) {
      this.logger.error('Error getting last processed block:', error);
      return await this.provider.getBlockNumber();
    }
  }

  /**
   * Update last processed block in database
   */
  private async updateLastProcessedBlock(blockNumber: number): Promise<void> {
    try {
      await this.db.db('blockchain_state')
        .where('processor', 'staking')
        .update({
          last_block: blockNumber,
          updated_at: new Date()
        });
      
      this.lastProcessedBlock = blockNumber;
    } catch (error) {
      this.logger.error('Error updating last processed block:', error);
    }
  }

  /**
   * Stop the processor
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping StakingProcessor...');
    
    // Remove all listeners
    await this.stakingContract.removeAllListeners();
    
    this.logger.info('StakingProcessor stopped');
  }
}