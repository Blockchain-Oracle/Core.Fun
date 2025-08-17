import { ethers } from 'ethers';
import { EventMonitor } from './EventMonitor';
import { createLogger } from '@core-meme/shared';
import { DatabaseService } from '@core-meme/shared';
import { RedisService } from '../services/RedisService';
import { WebSocketService } from '../services/WebSocketService';
import { BlockRange } from '../types';
const MemeTokenABI = require('@core-meme/shared/src/abis/MemeToken.json');

interface TransferEvent {
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: number;
}

interface HolderBalance {
  address: string;
  tokenAddress: string;
  balance: string;
  lastUpdated: number;
}

export class TransferMonitor extends EventMonitor {
  private readonly customLogger = createLogger({ service: 'transfer-monitor' });
  private readonly db: DatabaseService;
  private readonly redis: RedisService;
  private readonly ws: WebSocketService;
  private tokenContracts: Map<string, ethers.Contract> = new Map();
  private processingQueue: TransferEvent[] = [];
  private holderCache: Map<string, Set<string>> = new Map(); // tokenAddress -> Set of holder addresses

  constructor(
    config: any,
    db: DatabaseService,
    redis: RedisService,
    ws: WebSocketService
  ) {
    super(config);
    this.db = db;
    this.redis = redis;
    this.ws = ws;
  }

  protected getEventName(): string {
    return 'Transfer';
  }

  protected getContractAddress(): string {
    // We'll listen to multiple contracts, return empty for now
    return '';
  }

  protected getContractABI(): any[] {
    return MemeTokenABI;
  }

  async initialize(tokenAddresses: string[]): Promise<void> {
    this.customLogger.info(`Initializing TransferMonitor for ${tokenAddresses.length} tokens`);
    
    // Create contract instances for each token
    for (const address of tokenAddresses) {
      const contract = new ethers.Contract(
        address,
        MemeTokenABI,
        this.wsProvider || this.provider
      );
      this.tokenContracts.set(address.toLowerCase(), contract);
      
      // Initialize holder cache for this token
      await this.loadExistingHolders(address);
    }

    // Set up event listeners for each contract
    if (this.wsProvider) {
      await this.setupWebSocketListeners();
    } else {
      await this.setupPollingListeners();
    }
    
    this.customLogger.info('TransferMonitor initialized successfully');
  }

  private async setupWebSocketListeners(): Promise<void> {
    for (const [address, contract] of this.tokenContracts) {
      try {
        // Listen to Transfer events
        contract.on('Transfer', async (from: string, to: string, value: bigint, event: any) => {
          await this.handleTransferEvent({
            from,
            to,
            value: value.toString(),
            tokenAddress: address,
            blockNumber: event.log.blockNumber,
            transactionHash: event.log.transactionHash,
            logIndex: event.log.index,
            timestamp: Date.now()
          });
        });
        
        this.customLogger.info(`WebSocket listener attached for token ${address}`);
      } catch (error) {
        this.customLogger.error(`Failed to attach WebSocket listener for ${address}:`, error);
      }
    }
  }

  private async setupPollingListeners(): Promise<void> {
    // Poll for events every 15 seconds
    setInterval(async () => {
      await this.pollForEvents();
    }, 15000);
  }

  private async pollForEvents(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100); // Check last 100 blocks
      
      for (const [address, contract] of this.tokenContracts) {
        const filter = contract.filters.Transfer();
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);
        
        for (const event of events) {
          const eventLog = event as ethers.EventLog;
          if (eventLog.args) {
            await this.handleTransferEvent({
              from: eventLog.args[0],
              to: eventLog.args[1],
              value: eventLog.args[2].toString(),
              tokenAddress: address,
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.index,
              timestamp: Date.now()
            });
          }
        }
      }
    } catch (error) {
      this.customLogger.error('Error polling for Transfer events:', error);
    }
  }

  protected async processEvent(event: any): Promise<void> {
    // This is called by the base class, but we handle events directly in handleTransferEvent
    // So we can leave this empty or delegate to handleTransferEvent
  }

  protected async getLogs(range: BlockRange): Promise<ethers.Log[]> {
    const logs: ethers.Log[] = [];
    for (const [address, contract] of this.tokenContracts) {
      const filter = contract.filters.Transfer();
      const events = await contract.queryFilter(filter, range.fromBlock, range.toBlock);
      logs.push(...events);
    }
    return logs;
  }

  protected async processLogs(logs: ethers.Log[]): Promise<void> {
    for (const log of logs) {
      const event = log as ethers.EventLog;
      if (event.args) {
        await this.handleTransferEvent({
          from: event.args[0],
          to: event.args[1],
          value: event.args[2].toString(),
          tokenAddress: event.address,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.index,
          timestamp: Date.now()
        });
      }
    }
  }

  protected async processBlockData(block: ethers.Block): Promise<void> {
    // Not needed for Transfer monitoring
    return;
  }

  private async handleTransferEvent(event: TransferEvent): Promise<void> {
    try {
      this.customLogger.debug(`Processing Transfer event for token ${event.tokenAddress}`, {
        from: event.from,
        to: event.to,
        value: event.value,
        block: event.blockNumber
      });

      // Add to processing queue
      this.processingQueue.push(event);
      
      // Process in batches for efficiency
      if (this.processingQueue.length >= 10) {
        await this.processBatch();
      } else {
        // Process individual event after a short delay to allow batching
        setTimeout(() => this.processBatch(), 1000);
      }
    } catch (error) {
      this.customLogger.error('Error handling Transfer event:', error);
    }
  }

  private async processBatch(): Promise<void> {
    if (this.processingQueue.length === 0) return;
    
    const batch = [...this.processingQueue];
    this.processingQueue = [];
    
    try {
      // Process events directly without transaction
      for (const event of batch) {
        await this.updateHolderBalances(event);
      }
      
      // Update holder counts in cache
      await this.updateHolderCounts();
      
      // Publish updates via WebSocket
      await this.publishHolderUpdates(batch);
    } catch (error) {
      this.customLogger.error('Error processing batch:', error);
      // Re-add failed events to queue for retry
      this.processingQueue.push(...batch);
    }
  }

  private async updateHolderBalances(event: TransferEvent): Promise<void> {
    const { from, to, value, tokenAddress } = event;
    const tokenAddr = tokenAddress.toLowerCase();
    
    // Skip zero address (mint/burn)
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    
    // Update sender balance (if not mint)
    if (from.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
      const fromBalance = await this.getBalance(from, tokenAddr);
      const newFromBalance = BigInt(fromBalance) - BigInt(value);
      
      if (newFromBalance > 0n) {
        await this.updateBalance(from, tokenAddr, newFromBalance.toString());
      } else {
        // Remove holder if balance is 0
        await this.removeHolder(from, tokenAddr);
        this.getHolderSet(tokenAddr).delete(from.toLowerCase());
      }
    }
    
    // Update receiver balance (if not burn)
    if (to.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
      const toBalance = await this.getBalance(to, tokenAddr);
      const newToBalance = BigInt(toBalance) + BigInt(value);
      
      // Check if this is a new holder
      const wasNewHolder = toBalance === '0';
      
      await this.updateBalance(to, tokenAddr, newToBalance.toString());
      
      if (wasNewHolder) {
        this.getHolderSet(tokenAddr).add(to.toLowerCase());
      }
    }
    
    // Store the transfer event
    await this.storeTransferEvent(event);
  }

  private async getBalance(address: string, tokenAddress: string): Promise<string> {
    const result = await this.db.db.query(
      'SELECT balance FROM token_holders WHERE address = $1 AND token_address = $2',
      [address.toLowerCase(), tokenAddress.toLowerCase()]
    );
    
    return result.rows[0]?.balance || '0';
  }


  private async updateBalance(address: string, tokenAddress: string, balance: string): Promise<void> {
    await this.db.db.query(
      `INSERT INTO token_holders (address, token_address, balance, last_updated)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address, token_address)
       DO UPDATE SET balance = $3, last_updated = $4`,
      [address.toLowerCase(), tokenAddress.toLowerCase(), balance, new Date()]
    );
  }

  private async removeHolder(address: string, tokenAddress: string): Promise<void> {
    await this.db.db.query(
      'DELETE FROM token_holders WHERE address = $1 AND token_address = $2',
      [address.toLowerCase(), tokenAddress.toLowerCase()]
    );
  }

  private async storeTransferEvent(event: TransferEvent): Promise<void> {
    await this.db.db.query(
      `INSERT INTO transfer_events 
       (token_address, from_address, to_address, value, block_number, transaction_hash, log_index, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (transaction_hash, log_index) DO NOTHING`,
      [
        event.tokenAddress.toLowerCase(),
        event.from.toLowerCase(),
        event.to.toLowerCase(),
        event.value,
        event.blockNumber,
        event.transactionHash,
        event.logIndex,
        new Date(event.timestamp)
      ]
    );
  }

  private async loadExistingHolders(tokenAddress: string): Promise<void> {
    try {
      const result = await this.db.db.query(
        'SELECT address FROM token_holders WHERE token_address = $1 AND balance > $2',
        [tokenAddress.toLowerCase(), '0']
      );
      
      const holderSet = new Set(result.rows.map((h: any) => h.address.toLowerCase()));
      this.holderCache.set(tokenAddress.toLowerCase(), holderSet);
      
      this.customLogger.info(`Loaded ${holderSet.size} existing holders for token ${tokenAddress}`);
    } catch (error) {
      this.customLogger.error(`Error loading existing holders for ${tokenAddress}:`, error);
      this.holderCache.set(tokenAddress.toLowerCase(), new Set());
    }
  }

  private getHolderSet(tokenAddress: string): Set<string> {
    const addr = tokenAddress.toLowerCase();
    if (!this.holderCache.has(addr)) {
      this.holderCache.set(addr, new Set());
    }
    return this.holderCache.get(addr)!;
  }

  private async updateHolderCounts(): Promise<void> {
    for (const [tokenAddress, holderSet] of this.holderCache) {
      const count = holderSet.size;
      
      // Update database
      await this.db.db.query(
        'UPDATE tokens SET holders_count = $1 WHERE address = $2',
        [count, tokenAddress]
      );
      
      // Update Redis cache
      await this.redis.set(`holders:${tokenAddress}`, count.toString(), 300); // 5 min TTL
      
      this.customLogger.debug(`Updated holder count for ${tokenAddress}: ${count}`);
    }
  }

  private async publishHolderUpdates(events: TransferEvent[]): Promise<void> {
    // Group events by token
    const tokenUpdates = new Map<string, number>();
    
    for (const event of events) {
      const tokenAddr = event.tokenAddress.toLowerCase();
      const holderCount = this.getHolderSet(tokenAddr).size;
      tokenUpdates.set(tokenAddr, holderCount);
    }
    
    // Publish updates for each token
    for (const [tokenAddress, holderCount] of tokenUpdates) {
      await this.ws.publishTokenUpdate(tokenAddress, {
        holders: holderCount,
        timestamp: Date.now()
      });
    }
  }

  async getHolderCount(tokenAddress: string): Promise<number> {
    const addr = tokenAddress.toLowerCase();
    
    // Check cache first
    const cached = await this.redis.get(`holders:${addr}`);
    if (cached) {
      return parseInt(cached);
    }
    
    // Check memory cache
    if (this.holderCache.has(addr)) {
      return this.holderCache.get(addr)!.size;
    }
    
    // Query database
    const result = await this.db.db.query(
      'SELECT COUNT(*) as count FROM token_holders WHERE token_address = $1 AND balance > $2',
      [addr, '0']
    );
    
    return parseInt(result.rows[0]?.count || '0');
  }

  async getTopHolders(tokenAddress: string, limit: number = 10): Promise<HolderBalance[]> {
    const result = await this.db.db.query(
      'SELECT address, token_address, balance, last_updated FROM token_holders WHERE token_address = $1 AND balance > $2 ORDER BY balance DESC LIMIT $3',
      [tokenAddress.toLowerCase(), '0', limit]
    );
    
    return result.rows.map((h: any) => ({
      address: h.address,
      tokenAddress: h.token_address,
      balance: h.balance,
      lastUpdated: h.last_updated
    }));
  }

  async syncHistoricalEvents(tokenAddress: string, fromBlock: number = 0): Promise<void> {
    this.customLogger.info(`Syncing historical Transfer events for ${tokenAddress} from block ${fromBlock}`);
    
    const contract = this.tokenContracts.get(tokenAddress.toLowerCase());
    if (!contract) {
      throw new Error(`Contract not found for token ${tokenAddress}`);
    }
    
    const currentBlock = await this.provider.getBlockNumber();
    const batchSize = 1000; // Process 1000 blocks at a time
    
    for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += batchSize) {
      const endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
      
      try {
        const filter = contract.filters.Transfer();
        const events = await contract.queryFilter(filter, startBlock, endBlock);
        
        this.customLogger.info(`Found ${events.length} Transfer events in blocks ${startBlock}-${endBlock}`);
        
        for (const event of events) {
          const eventLog = event as ethers.EventLog;
          if (eventLog.args) {
            await this.handleTransferEvent({
              from: eventLog.args[0],
              to: eventLog.args[1],
              value: eventLog.args[2].toString(),
              tokenAddress: tokenAddress,
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              logIndex: event.index,
              timestamp: Date.now()
            });
          }
        }
        
        // Process any remaining events in queue
        await this.processBatch();
        
      } catch (error) {
        this.customLogger.error(`Error syncing blocks ${startBlock}-${endBlock}:`, error);
      }
    }
    
    this.customLogger.info(`Historical sync complete for ${tokenAddress}`);
  }

  async stop(): Promise<void> {
    // Process any remaining events
    await this.processBatch();
    
    // Remove all listeners
    for (const contract of this.tokenContracts.values()) {
      contract.removeAllListeners();
    }
    
    await super.stop();
  }
}