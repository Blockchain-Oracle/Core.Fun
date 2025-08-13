import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { createLogger } from '@core-meme/shared';
import { DatabaseService } from './services/DatabaseService';
import { AnalyticsService } from './services/AnalyticsService';
import { AlertService } from './services/AlertService';
import { TokenProcessor } from './processors/TokenProcessor';
import { TradeProcessor } from './processors/TradeProcessor';
import { MemeFactoryMonitor } from './monitors/MemeFactoryMonitor';
import { MonitorConfig } from './types';
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
  private monitors: Map<string, any> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.network = (process.env.NETWORK || 'testnet') as 'mainnet' | 'testnet';
    
    // Initialize providers
    this.rpcUrl = this.network === 'mainnet'
      ? process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org'
      : process.env.CORE_TESTNET_RPC || 'https://rpc.test2.btcs.network';
    
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
      }
    } else {
      logger.warn('⚠️  MemeFactory address not configured for', this.network);
    }
    
    logger.info(`✅ All monitors started (${this.monitors.size} total)`);
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
    
    // Close services
    await this.tokenProcessor.close();
    await this.tradeProcessor.close();
    await this.alertService.close();
    await this.db.close();
    
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