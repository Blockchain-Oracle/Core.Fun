import { ethers } from 'ethers';
import { createLogger } from '@core-meme/shared';
import { EventEmitter } from 'events';

const STAKING_CONTRACT = '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa';

const STAKING_ABI = [
  'event Staked(address indexed user, uint256 amount, uint256 timestamp)',
  'event Unstaked(address indexed user, uint256 amount, uint256 timestamp)',
  'event RewardsClaimed(address indexed user, uint256 amount)',
  'event RevenueDistributed(uint256 amount, uint256 timestamp)',
  'event TierUpdated(address indexed user, uint256 tierLevel)',
  'function getStakingStats(address _user) external view returns (uint256 stakedAmount, uint256 pendingRewardAmount, uint256 totalEarnedAmount, uint256 userTier, bool isPremium)',
  'function pool() external view returns (uint256 totalStaked, uint256 accRewardPerShare, uint256 lastRewardTime, uint256 rewardRate)'
];

interface StakingEventHandlers {
  onStaked?: (event: any) => void;
  onUnstaked?: (event: any) => void;
  onRewardsClaimed?: (event: any) => void;
  onRevenueDistributed?: (event: any) => void;
  onTierUpdated?: (event: any) => void;
}

export class StakingService extends EventEmitter {
  private provider: ethers.JsonRpcProvider;
  private wsProvider?: ethers.WebSocketProvider;
  private stakingContract: ethers.Contract;
  private logger = createLogger({ service: 'staking-service' });

  constructor() {
    super();
    
    // Initialize providers
    const rpcUrl = process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Try to initialize WebSocket provider
    const wsUrl = process.env.CORE_WS_URL;
    if (wsUrl) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(wsUrl);
        this.logger.info('WebSocket provider initialized for staking');
      } catch (error) {
        this.logger.warn('WebSocket not available for staking, using polling');
      }
    }
    
    // Initialize contract
    this.stakingContract = new ethers.Contract(
      STAKING_CONTRACT,
      STAKING_ABI,
      this.wsProvider || this.provider
    );
  }

  /**
   * Setup event listeners for staking contract
   */
  setupEventListeners(handlers: StakingEventHandlers) {
    if (!this.wsProvider) {
      this.logger.warn('WebSocket not available, staking events will use polling');
      this.setupPollingListeners(handlers);
      return;
    }

    // Listen for Staked events
    if (handlers.onStaked) {
      this.stakingContract.on('Staked', async (user, amount, timestamp, event) => {
        this.logger.info(`User staked: ${user} - ${ethers.formatEther(amount)} tokens`);
        
        // Get updated user stats
        const stats = await this.getUserStats(user);
        
        handlers.onStaked!({
          user: user.toLowerCase(),
          amount: ethers.formatEther(amount),
          timestamp: Number(timestamp),
          stats,
          transactionHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber
        });
      });
    }

    // Listen for Unstaked events
    if (handlers.onUnstaked) {
      this.stakingContract.on('Unstaked', async (user, amount, timestamp, event) => {
        this.logger.info(`User unstaked: ${user} - ${ethers.formatEther(amount)} tokens`);
        
        // Get updated user stats
        const stats = await this.getUserStats(user);
        
        handlers.onUnstaked!({
          user: user.toLowerCase(),
          amount: ethers.formatEther(amount),
          timestamp: Number(timestamp),
          stats,
          transactionHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber
        });
      });
    }

    // Listen for RewardsClaimed events
    if (handlers.onRewardsClaimed) {
      this.stakingContract.on('RewardsClaimed', async (user, amount, event) => {
        this.logger.info(`User claimed rewards: ${user} - ${ethers.formatEther(amount)} tokens`);
        
        handlers.onRewardsClaimed!({
          user: user.toLowerCase(),
          amount: ethers.formatEther(amount),
          transactionHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber
        });
      });
    }

    // Listen for RevenueDistributed events
    if (handlers.onRevenueDistributed) {
      this.stakingContract.on('RevenueDistributed', async (amount, timestamp, event) => {
        this.logger.info(`Revenue distributed: ${ethers.formatEther(amount)} CORE`);
        
        // Get updated pool info
        const poolInfo = await this.getPoolInfo();
        
        handlers.onRevenueDistributed!({
          amount: ethers.formatEther(amount),
          timestamp: Number(timestamp),
          poolInfo,
          transactionHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber
        });
      });
    }

    // Listen for TierUpdated events
    if (handlers.onTierUpdated) {
      this.stakingContract.on('TierUpdated', async (user, tierLevel, event) => {
        this.logger.info(`User tier updated: ${user} - Tier ${tierLevel}`);
        
        const tierNames = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];
        
        handlers.onTierUpdated!({
          user: user.toLowerCase(),
          tier: Number(tierLevel),
          tierName: tierNames[Number(tierLevel)] || 'None',
          transactionHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber
        });
      });
    }

    this.logger.info('Staking event listeners setup complete');
  }

  /**
   * Setup polling for events (fallback when WebSocket not available)
   */
  private async setupPollingListeners(handlers: StakingEventHandlers) {
    const pollInterval = 15000; // 15 seconds
    let lastBlock = await this.provider.getBlockNumber();

    setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        
        if (currentBlock > lastBlock) {
          // Query events from lastBlock to currentBlock
          const filter = {
            address: STAKING_CONTRACT,
            fromBlock: lastBlock + 1,
            toBlock: currentBlock
          };

          const logs = await this.provider.getLogs(filter);
          
          for (const log of logs) {
            try {
              const parsedLog = this.stakingContract.interface.parseLog({
                topics: log.topics as string[],
                data: log.data
              });

              if (!parsedLog) continue;

              // Handle different event types
              switch (parsedLog.name) {
                case 'Staked':
                  if (handlers.onStaked) {
                    const [user, amount, timestamp] = parsedLog.args;
                    const stats = await this.getUserStats(user);
                    handlers.onStaked({
                      user: user.toLowerCase(),
                      amount: ethers.formatEther(amount),
                      timestamp: Number(timestamp),
                      stats,
                      transactionHash: log.transactionHash,
                      blockNumber: log.blockNumber
                    });
                  }
                  break;

                case 'Unstaked':
                  if (handlers.onUnstaked) {
                    const [user, amount, timestamp] = parsedLog.args;
                    const stats = await this.getUserStats(user);
                    handlers.onUnstaked({
                      user: user.toLowerCase(),
                      amount: ethers.formatEther(amount),
                      timestamp: Number(timestamp),
                      stats,
                      transactionHash: log.transactionHash,
                      blockNumber: log.blockNumber
                    });
                  }
                  break;

                case 'RewardsClaimed':
                  if (handlers.onRewardsClaimed) {
                    const [user, amount] = parsedLog.args;
                    handlers.onRewardsClaimed({
                      user: user.toLowerCase(),
                      amount: ethers.formatEther(amount),
                      transactionHash: log.transactionHash,
                      blockNumber: log.blockNumber
                    });
                  }
                  break;

                case 'RevenueDistributed':
                  if (handlers.onRevenueDistributed) {
                    const [amount, timestamp] = parsedLog.args;
                    const poolInfo = await this.getPoolInfo();
                    handlers.onRevenueDistributed({
                      amount: ethers.formatEther(amount),
                      timestamp: Number(timestamp),
                      poolInfo,
                      transactionHash: log.transactionHash,
                      blockNumber: log.blockNumber
                    });
                  }
                  break;

                case 'TierUpdated':
                  if (handlers.onTierUpdated) {
                    const [user, tierLevel] = parsedLog.args;
                    const tierNames = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];
                    handlers.onTierUpdated({
                      user: user.toLowerCase(),
                      tier: Number(tierLevel),
                      tierName: tierNames[Number(tierLevel)] || 'None',
                      transactionHash: log.transactionHash,
                      blockNumber: log.blockNumber
                    });
                  }
                  break;
              }
            } catch (error) {
              this.logger.error('Error processing staking log:', error);
            }
          }

          lastBlock = currentBlock;
        }
      } catch (error) {
        this.logger.error('Error polling staking events:', error);
      }
    }, pollInterval);
  }

  /**
   * Get user staking statistics
   */
  async getUserStats(userAddress: string): Promise<any> {
    try {
      const stats = await this.stakingContract.getStakingStats(userAddress);
      const tierNames = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];
      
      return {
        stakedAmount: ethers.formatEther(stats[0]),
        pendingRewards: ethers.formatEther(stats[1]),
        totalEarned: ethers.formatEther(stats[2]),
        tier: Number(stats[3]),
        tierName: tierNames[Number(stats[3])] || 'None',
        isPremium: stats[4]
      };
    } catch (error) {
      this.logger.error('Failed to get user stats:', error);
      return null;
    }
  }

  /**
   * Get staking pool information
   */
  async getPoolInfo(): Promise<any> {
    try {
      const pool = await this.stakingContract.pool();
      
      return {
        totalStaked: ethers.formatEther(pool[0]),
        accRewardPerShare: pool[1].toString(),
        lastRewardTime: Number(pool[2]),
        rewardRate: ethers.formatEther(pool[3])
      };
    } catch (error) {
      this.logger.error('Failed to get pool info:', error);
      return null;
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    this.stakingContract.removeAllListeners();
    super.removeAllListeners();
    this.logger.info('All staking event listeners removed');
    return this;
  }
}