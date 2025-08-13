import { ethers } from 'ethers';
import { EventMonitor } from './EventMonitor';
import { MonitorConfig, Token, EventType, BlockRange } from '../types';
import { TokenProcessor } from '../processors/TokenProcessor';

// ABI for MemeFactory events (matching our actual contract)
const MEME_FACTORY_ABI = [
  'event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 timestamp)',
  'event TokenPurchased(address indexed token, address indexed buyer, uint256 amount, uint256 cost, uint256 timestamp)',
  'event TokenSold(address indexed token, address indexed seller, uint256 amount, uint256 proceeds, uint256 timestamp)',
  'event TokenLaunched(address indexed token, uint256 liquidityAdded, uint256 timestamp)',
  'event FeesWithdrawn(address indexed to, uint256 amount)',
  'event CreationFeeUpdated(uint256 newFee)',
  'event TradingFeeUpdated(uint256 newFee)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
];

export class MemeFactoryMonitor extends EventMonitor {
  private factoryAddress: string;
  private factoryContract: ethers.Contract;
  private tokenProcessor: TokenProcessor;

  constructor(
    config: MonitorConfig,
    factoryAddress: string,
    tokenProcessor: TokenProcessor
  ) {
    super(config);
    this.factoryAddress = factoryAddress.toLowerCase();
    this.tokenProcessor = tokenProcessor;
    
    // Initialize factory contract
    this.factoryContract = new ethers.Contract(
      factoryAddress,
      MEME_FACTORY_ABI,
      this.wsProvider || this.provider
    );
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.wsProvider) return;
    
    // Listen for TokenCreated events
    this.factoryContract.on('TokenCreated', async (
      token: string,
      creator: string,
      name: string,
      symbol: string,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      this.logger.info(`New token created: ${symbol} (${token})`);
      
      const tokenData: Token = {
        address: token.toLowerCase(),
        name,
        symbol,
        decimals: 18, // Default for our tokens
        totalSupply: '1000000000000000000000000', // 1M tokens total supply
        creator: creator.toLowerCase(),
        createdAt: Number(timestamp),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        description: '', // No description in this event
      };
      
      await this.tokenProcessor.processNewToken(tokenData);
      
      this.emit(EventType.TOKEN_CREATED, tokenData);
    });
    
    // Listen for TokenPurchased events (bonding curve purchases)
    this.factoryContract.on('TokenPurchased', async (
      token: string,
      buyer: string,
      amount: bigint,
      cost: bigint,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      this.logger.info(`Token purchased: ${ethers.formatEther(amount)} tokens for ${ethers.formatEther(cost)} CORE`);
      
      // Process as a trade for analytics
      const _trade = {
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: Number(timestamp) * 1000,
        pair: this.factoryAddress, // Factory acts as the "pair" for bonding curve
        trader: buyer.toLowerCase(),
        tokenIn: '0x0000000000000000000000000000000000000000', // CORE (native)
        tokenOut: token.toLowerCase(),
        amountIn: cost.toString(),
        amountOut: amount.toString(),
        gasUsed: '0',
        gasPrice: '0',
      };
      
      // Could process this through TradeProcessor if needed
      this.emit('TOKEN_PURCHASED', {
        token: token.toLowerCase(),
        buyer: buyer.toLowerCase(),
        amount: amount.toString(),
        cost: cost.toString(),
        timestamp: Number(timestamp),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    });
    
    // Listen for TokenSold events (selling tokens back to bonding curve)
    this.factoryContract.on('TokenSold', async (
      token: string,
      seller: string,
      amount: bigint,
      proceeds: bigint,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      this.logger.info(`Token sold: ${ethers.formatEther(amount)} tokens for ${ethers.formatEther(proceeds)} CORE`);
      
      // Process as a sell trade for analytics
      this.emit('TOKEN_SOLD', {
        token: token.toLowerCase(),
        seller: seller.toLowerCase(),
        amount: amount.toString(),
        proceeds: proceeds.toString(),
        timestamp: Number(timestamp),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    });
    
    // Listen for TokenLaunched events
    this.factoryContract.on('TokenLaunched', async (
      token: string,
      liquidityAdded: bigint,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      this.logger.info(`Token launched: ${token} with ${ethers.formatEther(liquidityAdded)} CORE liquidity`);
      
      await this.tokenProcessor.processTokenLaunch({
        token: token.toLowerCase(),
        liquidityAdded: liquidityAdded.toString(),
        timestamp: Number(timestamp),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    });
    
    // Listen for fee-related events (optional monitoring)
    this.factoryContract.on('FeesWithdrawn', async (
      to: string,
      amount: bigint,
      event: ethers.EventLog
    ) => {
      this.logger.info(`Platform fees withdrawn: ${ethers.formatEther(amount)} CORE to ${to}`);
      
      this.emit('FEES_WITHDRAWN', {
        to: to.toLowerCase(),
        amount: amount.toString(),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    });
  }

  protected async getLogs(range: BlockRange): Promise<ethers.Log[]> {
    const filter = {
      address: this.factoryAddress,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
    };
    
    try {
      return await this.provider.getLogs(filter);
    } catch (error) {
      this.logger.error('Error fetching logs:', error);
      throw error;
    }
  }

  protected async processLogs(logs: ethers.Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const parsedLog = this.factoryContract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
        
        if (!parsedLog) continue;
        
        switch (parsedLog.name) {
          case 'TokenCreated':
            await this.handleTokenCreated(parsedLog, log);
            break;
          case 'TokenPurchased':
            await this.handleTokenPurchased(parsedLog, log);
            break;
          case 'TokenSold':
            await this.handleTokenSold(parsedLog, log);
            break;
          case 'TokenLaunched':
            await this.handleTokenLaunched(parsedLog, log);
            break;
          case 'FeesWithdrawn':
            await this.handleFeesWithdrawn(parsedLog, log);
            break;
          case 'CreationFeeUpdated':
          case 'TradingFeeUpdated':
            // Log fee updates but don't need special processing
            this.logger.info(`Fee updated: ${parsedLog.name}`);
            break;
        }
      } catch (error) {
        this.logger.error('Error processing log:', error);
      }
    }
  }

  protected async processBlockData(block: ethers.Block): Promise<void> {
    // Process transactions in the block that interact with factory
    const transactions = block.prefetchedTransactions || [];
    
    for (const tx of transactions) {
      if (typeof tx === 'string') continue;
      
      // Check if transaction is to factory
      if ('to' in tx && tx.to?.toLowerCase() === this.factoryAddress) {
        await this.processFactoryTransaction(tx as ethers.TransactionResponse);
      }
    }
  }

  private async handleTokenCreated(
    parsedLog: ethers.LogDescription,
    log: ethers.Log
  ): Promise<void> {
    const [token, creator, name, symbol, timestamp] = parsedLog.args;
    
    const tokenData: Token = {
      address: token.toLowerCase(),
      name,
      symbol,
      decimals: 18,
      totalSupply: '1000000000000000000000000', // 1M tokens
      creator: creator.toLowerCase(),
      createdAt: Number(timestamp),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      description: '', // No description in event
    };
    
    await this.tokenProcessor.processNewToken(tokenData);
    this.emit(EventType.TOKEN_CREATED, tokenData);
  }

  private async handleTokenPurchased(
    parsedLog: ethers.LogDescription,
    log: ethers.Log
  ): Promise<void> {
    const [token, buyer, amount, cost, timestamp] = parsedLog.args;
    
    // Emit purchase event for analytics
    this.emit('TOKEN_PURCHASED', {
      token: token.toLowerCase(),
      buyer: buyer.toLowerCase(),
      amount: amount.toString(),
      cost: cost.toString(),
      timestamp: Number(timestamp),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
    
    // Track volume metrics
    this.logger.debug(`Token purchase: ${ethers.formatEther(amount)} tokens for ${ethers.formatEther(cost)} CORE`);
  }

  private async handleTokenSold(
    parsedLog: ethers.LogDescription,
    log: ethers.Log
  ): Promise<void> {
    const [token, seller, amount, proceeds, timestamp] = parsedLog.args;
    
    // Emit sell event for analytics
    this.emit('TOKEN_SOLD', {
      token: token.toLowerCase(),
      seller: seller.toLowerCase(),
      amount: amount.toString(),
      proceeds: proceeds.toString(),
      timestamp: Number(timestamp),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
    
    // Track volume metrics
    this.logger.debug(`Token sell: ${ethers.formatEther(amount)} tokens for ${ethers.formatEther(proceeds)} CORE`);
  }

  private async handleTokenLaunched(
    parsedLog: ethers.LogDescription,
    log: ethers.Log
  ): Promise<void> {
    const [token, liquidityAdded, timestamp] = parsedLog.args;
    
    await this.tokenProcessor.processTokenLaunch({
      token: token.toLowerCase(),
      liquidityAdded: liquidityAdded.toString(),
      timestamp: Number(timestamp),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
  }

  private async handleFeesWithdrawn(
    parsedLog: ethers.LogDescription,
    log: ethers.Log
  ): Promise<void> {
    const [to, amount] = parsedLog.args;
    
    this.emit('FEES_WITHDRAWN', {
      to: to.toLowerCase(),
      amount: amount.toString(),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    });
    
    this.logger.info(`Platform fees withdrawn: ${ethers.formatEther(amount)} CORE to ${to}`);
  }

  private async processFactoryTransaction(
    tx: ethers.TransactionResponse
  ): Promise<void> {
    try {
      const receipt = await tx.wait();
      if (!receipt) return;
      
      // Process receipt logs
      for (const log of receipt.logs) {
        const parsedLog = this.factoryContract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
        
        if (parsedLog && parsedLog.name === 'TokenCreated') {
          // Additional processing if needed
          this.logger.debug(`Token created in tx: ${tx.hash}`);
        }
      }
    } catch (error) {
      this.logger.error('Error processing factory transaction:', error);
    }
  }
}