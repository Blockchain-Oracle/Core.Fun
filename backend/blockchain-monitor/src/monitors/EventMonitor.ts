import { ethers } from 'ethers';
import { EventEmitter } from 'eventemitter3';
import winston from 'winston';
import { MonitorConfig, BlockRange } from '../types';
import PQueue from 'p-queue';

export abstract class EventMonitor extends EventEmitter {
  protected provider: ethers.JsonRpcProvider;
  protected wsProvider?: ethers.WebSocketProvider;
  protected config: MonitorConfig;
  protected logger: winston.Logger;
  protected lastProcessedBlock: number = 0;
  protected isRunning: boolean = false;
  protected queue: PQueue;
  protected retryQueue: Map<string, number> = new Map();

  constructor(config: MonitorConfig) {
    super();
    this.config = config;
    
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Initialize WebSocket provider if available
    if (config.wsUrl) {
      this.wsProvider = new ethers.WebSocketProvider(config.wsUrl);
      this.setupWebSocketHandlers();
    }
    
    // Initialize logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: `${this.constructor.name.toLowerCase()}.log` 
        }),
      ],
    });
    
    // Initialize processing queue
    this.queue = new PQueue({ 
      concurrency: 10,
      interval: 1000,
      intervalCap: 50 
    });
    
    this.lastProcessedBlock = config.startBlock || 0;
  }

  private setupWebSocketHandlers(): void {
    if (!this.wsProvider) return;
    
    this.wsProvider.on('block', async (blockNumber) => {
      this.logger.debug(`New block received: ${blockNumber}`);
      await this.processBlock(blockNumber);
    });
    
    this.wsProvider.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
      this.reconnectWebSocket();
    });
    
    this.wsProvider.on('network', (network) => {
      this.logger.info(`Connected to network: ${network.chainId}`);
    });
  }

  private async reconnectWebSocket(): Promise<void> {
    if (!this.config.wsUrl) return;
    
    this.logger.info('Attempting to reconnect WebSocket...');
    
    try {
      if (this.wsProvider) {
        await this.wsProvider.destroy();
      }
      
      this.wsProvider = new ethers.WebSocketProvider(this.config.wsUrl);
      this.setupWebSocketHandlers();
      
      this.logger.info('WebSocket reconnected successfully');
    } catch (error) {
      this.logger.error('Failed to reconnect WebSocket:', error);
      
      // Retry after delay
      setTimeout(() => this.reconnectWebSocket(), 30000);
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Monitor is already running');
      return;
    }
    
    this.isRunning = true;
    this.logger.info('Starting event monitor...');
    
    // Get current block if not set
    if (this.lastProcessedBlock === 0) {
      const currentBlock = await this.provider.getBlockNumber();
      this.lastProcessedBlock = this.config.startBlock || currentBlock - 1000;
    }
    
    // Start polling if no WebSocket
    if (!this.wsProvider) {
      this.startPolling();
    }
    
    // Process historical blocks
    await this.processHistoricalBlocks();
    
    this.logger.info('Event monitor started successfully');
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('Stopping event monitor...');
    
    // Clear queue
    this.queue.clear();
    await this.queue.onIdle();
    
    // Close WebSocket connection
    if (this.wsProvider) {
      await this.wsProvider.destroy();
    }
    
    this.logger.info('Event monitor stopped');
  }

  private startPolling(): void {
    const pollInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(pollInterval);
        return;
      }
      
      try {
        const currentBlock = await this.provider.getBlockNumber();
        
        if (currentBlock > this.lastProcessedBlock) {
          const fromBlock = this.lastProcessedBlock + 1;
          const toBlock = Math.min(
            fromBlock + this.config.batchSize - 1,
            currentBlock - this.config.confirmations
          );
          
          if (toBlock >= fromBlock) {
            await this.processBlockRange({ fromBlock, toBlock });
            this.lastProcessedBlock = toBlock;
          }
        }
      } catch (error) {
        this.logger.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  private async processHistoricalBlocks(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    const targetBlock = currentBlock - this.config.confirmations;
    
    while (this.lastProcessedBlock < targetBlock && this.isRunning) {
      const fromBlock = this.lastProcessedBlock + 1;
      const toBlock = Math.min(
        fromBlock + this.config.batchSize - 1,
        targetBlock
      );
      
      await this.processBlockRange({ fromBlock, toBlock });
      this.lastProcessedBlock = toBlock;
      
      // Save progress
      this.emit('progress', {
        lastProcessedBlock: this.lastProcessedBlock,
        targetBlock,
        progress: ((this.lastProcessedBlock - fromBlock) / (targetBlock - fromBlock)) * 100
      });
    }
  }

  protected async processBlock(blockNumber: number): Promise<void> {
    await this.queue.add(async () => {
      try {
        const block = await this.provider.getBlock(blockNumber, true);
        if (!block) return;
        
        await this.processBlockData(block);
        
        // Update last processed block
        if (blockNumber > this.lastProcessedBlock) {
          this.lastProcessedBlock = blockNumber;
        }
      } catch (error) {
        this.logger.error(`Error processing block ${blockNumber}:`, error);
        await this.retryBlock(blockNumber);
      }
    });
  }

  protected async processBlockRange(range: BlockRange): Promise<void> {
    this.logger.info(`Processing blocks ${range.fromBlock} to ${range.toBlock}`);
    
    try {
      const logs = await this.getLogs(range);
      await this.processLogs(logs);
    } catch (error) {
      this.logger.error(`Error processing block range:`, error);
      
      // Split range and retry
      if (range.toBlock - range.fromBlock > 0) {
        const mid = Math.floor((range.fromBlock + range.toBlock) / 2);
        await this.processBlockRange({ fromBlock: range.fromBlock, toBlock: mid });
        await this.processBlockRange({ fromBlock: mid + 1, toBlock: range.toBlock });
      }
    }
  }

  private async retryBlock(blockNumber: number): Promise<void> {
    const attempts = this.retryQueue.get(blockNumber.toString()) || 0;
    
    if (attempts >= this.config.retryAttempts) {
      this.logger.error(`Max retry attempts reached for block ${blockNumber}`);
      this.emit('error', {
        type: 'BLOCK_PROCESSING_FAILED',
        blockNumber,
        attempts
      });
      return;
    }
    
    this.retryQueue.set(blockNumber.toString(), attempts + 1);
    
    setTimeout(async () => {
      await this.processBlock(blockNumber);
    }, this.config.retryDelay * Math.pow(2, attempts));
  }

  public getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  public setLastProcessedBlock(block: number): void {
    this.lastProcessedBlock = block;
  }

  // Abstract methods to be implemented by specific monitors
  protected abstract getLogs(range: BlockRange): Promise<ethers.Log[]>;
  protected abstract processLogs(logs: ethers.Log[]): Promise<void>;
  protected abstract processBlockData(block: ethers.Block): Promise<void>;
}