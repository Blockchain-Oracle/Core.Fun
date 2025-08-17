import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { createLogger } from '@core-meme/shared';
import { DatabaseService } from '@core-meme/shared';
import { AnalyticsService } from './services/AnalyticsService';
import { AlertService } from './services/AlertService';
import { TokenProcessor } from './processors/TokenProcessor';
import { TradeProcessor } from './processors/TradeProcessor';
import { StakingProcessor } from './processors/StakingProcessor';
import Redis from 'ioredis';
import { MemeFactoryMonitor } from './monitors/MemeFactoryMonitor';
import { TransferMonitor } from './monitors/TransferMonitor';
import { MonitorConfig } from './types';
import { RedisService } from './services/RedisService';
import { WebSocketService } from './services/WebSocketService';
import { 
  getPlatformContracts, 
  isMemeFactoryConfigured, 
  getMemeFactoryAddress,
  logContractConfiguration 
} from './config/contracts';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = createLogger({ 
  service: 'blockchain-monitor',
  enableFileLogging: true
});

class BlockchainMonitorService {
  private network: 'mainnet' | 'testnet';
  private rpcUrl: string;
  private wsUrl?: string;
  private provider: ethers.JsonRpcProvider;
  private wsProvider?: ethers.WebSocketProvider;
  private db: DatabaseService;
  private analytics: AnalyticsService;
  private alertService: AlertService;
  private tokenProcessor: TokenProcessor;
  private tradeProcessor: TradeProcessor;
  private stakingProcessor: StakingProcessor;
  private monitors: Map<string, any> = new Map();
  private redis: Redis;
  private redisService: RedisService;
  private wsService: WebSocketService;
  private transferMonitor?: TransferMonitor;
  private isRunning: boolean = false;

  constructor() {
    this.network = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet';
    
    // Initialize providers
    this.rpcUrl = this.network === 'mainnet'
      ? process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org'
      : process.env.CORE_TESTNET_RPC || 'https://1114.rpc.thirdweb.com';
    
    this.wsUrl = this.network === 'mainnet'
      ? process.env.CORE_MAINNET_WS
      : process.env.CORE_TESTNET_WS;
    
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    
    if (this.wsUrl) {
      this.wsProvider = new ethers.WebSocketProvider(this.wsUrl);
      logger.info('WebSocket provider initialized');
    } else {
      logger.warn('No WebSocket URL configured, using polling mode');
    }
    
    // Initialize services
    this.db = new DatabaseService();
    this.analytics = new AnalyticsService(this.provider, this.db);
    this.alertService = new AlertService(this.db);
    
    // Initialize processors
    this.tokenProcessor = new TokenProcessor(
      this.provider,
      this.db,
      this.analytics,
      this.alertService
    );
    
    this.tradeProcessor = new TradeProcessor(
      this.provider,
      this.db,
      this.analytics,
      this.alertService
    );
    
    // Initialize Redis for StakingProcessor
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    };
    
    this.redis = new Redis(redisConfig);
    
    // Initialize Redis and WebSocket services
    this.redisService = new RedisService(this.redis);
    this.wsService = new WebSocketService(
      parseInt(process.env.WS_PORT || '8080'),
      this.redis
    );
    
    // Initialize StakingProcessor
    this.stakingProcessor = new StakingProcessor(
      this.provider,
      this.db,
      this.redis,
      logger
    );
    
    // Listen to staking events
    this.stakingProcessor.on('staked', (data) => {
      logger.info('User staked tokens:', data);
    });
    
    this.stakingProcessor.on('unstaked', (data) => {
      logger.info('User unstaked tokens:', data);
    });
    
    this.stakingProcessor.on('rewardsClaimed', (data) => {
      logger.info('User claimed rewards:', data);
    });
    
    this.stakingProcessor.on('tierUpdated', (data) => {
      logger.info('User tier updated:', data);
    });
    
    this.stakingProcessor.on('revenueDistributed', (data) => {
      logger.info('Revenue distributed to stakers:', data);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Monitor service is already running');
      return;
    }
    
    logger.info('🚀 Starting Blockchain Monitor Service');
    logger.info(`📡 Network: ${this.network.toUpperCase()}`);
    logger.info(`🔗 RPC: ${this.rpcUrl}`);
    
    // Log platform contracts configuration
    logContractConfiguration(this.network);
    
    try {
      // Verify connection
      const blockNumber = await this.provider.getBlockNumber();
      logger.info(`✅ Connected to Core ${this.network} at block ${blockNumber}`);
      
      // Start monitors
      await this.startMonitors();
      
      // Start StakingProcessor
      logger.info('Starting StakingProcessor...');
      await this.stakingProcessor.start();
      logger.info('✅ StakingProcessor started');
      
      this.isRunning = true;
      logger.info('✅ Blockchain Monitor Service started successfully');
      
      // Setup graceful shutdown
      this.setupShutdownHandlers();
      
    } catch (error) {
      logger.error('Failed to start monitor service:', error);
      throw error;
    }
  }

  private async startMonitors(): Promise<void> {
    const monitorConfig: MonitorConfig = {
      rpcUrl: this.rpcUrl,
      wsUrl: this.wsUrl,
      startBlock: parseInt(process.env.START_BLOCK || '0') || undefined,
      confirmations: parseInt(process.env.CONFIRMATIONS || '3'),
      batchSize: parseInt(process.env.BATCH_SIZE || '100'),
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
    };
    
    // Start MemeFactory monitor if configured
    if (isMemeFactoryConfigured(this.network)) {
      const factoryAddress = getMemeFactoryAddress(this.network);
      if (factoryAddress) {
        logger.info(`Starting MemeFactory monitor for ${factoryAddress}`);
        
        const memeFactoryMonitor = new MemeFactoryMonitor(
          monitorConfig,
          factoryAddress,
          this.tokenProcessor
        );
        
        await memeFactoryMonitor.start();
        this.monitors.set('memeFactory', memeFactoryMonitor);
        
        logger.info('✅ MemeFactory monitor started');
        
        // Start TransferMonitor for holder tracking
        await this.startTransferMonitor();
      }
    } else {
      logger.warn('⚠️  MemeFactory address not configured for', this.network);
    }
    
    logger.info(`✅ All monitors started (${this.monitors.size} total)`);
  }

  private async startTransferMonitor(): Promise<void> {
    try {
      logger.info('Starting TransferMonitor for holder tracking...');
      
      // Get all token addresses from database
      const tokens = await this.db.knex('tokens')
        .select('address')
        .orderBy('created_at', 'desc')
        .limit(100); // Start with first 100 tokens
      
      const tokenAddresses = tokens.map(t => t.address);
      
      if (tokenAddresses.length === 0) {
        logger.warn('No tokens found to monitor for Transfer events');
        return;
      }
      
      logger.info(`Initializing TransferMonitor for ${tokenAddresses.length} tokens`);
      
      // Create TransferMonitor instance
      this.transferMonitor = new TransferMonitor(
        this.provider,
        this.wsProvider,
        this.db,
        this.redisService,
        this.wsService
      );
      
      // Initialize with token addresses
      await this.transferMonitor.initialize(tokenAddresses);
      
      // Start historical sync for each token if needed
      const syncFromBlock = parseInt(process.env.SYNC_HOLDERS_FROM_BLOCK || '0');
      if (syncFromBlock > 0) {
        logger.info(`Syncing historical Transfer events from block ${syncFromBlock}`);
        for (const address of tokenAddresses) {
          await this.transferMonitor.syncHistoricalEvents(address, syncFromBlock);
        }
      }
      
      this.monitors.set('transfer', this.transferMonitor);
      logger.info('✅ TransferMonitor started successfully');
      
    } catch (error) {
      logger.error('Failed to start TransferMonitor:', error);
      // Non-critical, continue without holder tracking
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`\n${signal} received, shutting down gracefully...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('Stopping Blockchain Monitor Service...');
    
    // Stop all monitors
    for (const [name, monitor] of this.monitors) {
      logger.info(`Stopping ${name} monitor...`);
      await monitor.stop();
    }
    
    // Stop TransferMonitor if running
    if (this.transferMonitor) {
      logger.info('Stopping TransferMonitor...');
      await this.transferMonitor.stop();
    }
    
    // Stop StakingProcessor
    logger.info('Stopping StakingProcessor...');
    await this.stakingProcessor.stop();
    
    // Close services
    await this.tokenProcessor.close();
    await this.tradeProcessor.close();
    await this.alertService.close();
    await this.wsService.close();
    await this.db.close();
    
    // Close Redis connection
    this.redis.disconnect();
    
    // Close providers
    if (this.wsProvider) {
      await this.wsProvider.destroy();
    }
    this.provider.destroy();
    
    this.isRunning = false;
    logger.info('✅ Blockchain Monitor Service stopped');
  }

  async getStatus(): Promise<any> {
    const blockNumber = await this.provider.getBlockNumber();
    const monitorStatuses: any = {};
    
    for (const [name, monitor] of this.monitors) {
      monitorStatuses[name] = {
        running: true,
        lastProcessedBlock: monitor.getLastProcessedBlock?.() || 0,
      };
    }
    
    return {
      network: this.network,
      running: this.isRunning,
      currentBlock: blockNumber,
      monitors: monitorStatuses,
      platformContracts: getPlatformContracts(this.network),
      stakingProcessor: {
        running: true,
        stakingAddress: process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
        tokenAddress: process.env.PLATFORM_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655'
      }
    };
  }
}

// Main execution
async function main() {
  const service = new BlockchainMonitorService();
  
  try {
    await service.start();
    
    // Log status periodically
    setInterval(async () => {
      const status = await service.getStatus();
      logger.info('Service status:', status);
    }, 60000); // Every minute
    
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

export { BlockchainMonitorService };