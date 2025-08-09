import { ethers } from 'ethers';
import { EventMonitor } from './EventMonitor';
import { MonitorConfig, Pair, Trade, LiquidityEvent, EventType, BlockRange, DexConfig } from '../types';
import { TradeProcessor } from '../processors/TradeProcessor';
import { LiquidityProcessor } from '../processors/LiquidityProcessor';

// Standard Uniswap V2 Factory ABI
const FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
];

// Standard Uniswap V2 Pair ABI
const PAIR_ABI = [
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  'event Mint(address indexed sender, uint amount0, uint amount1)',
  'event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
];

export class DexMonitor extends EventMonitor {
  private dexConfig: DexConfig;
  private factoryContract: ethers.Contract;
  private tradeProcessor: TradeProcessor;
  private liquidityProcessor: LiquidityProcessor;
  private pairContracts: Map<string, ethers.Contract> = new Map();
  private watchedPairs: Set<string> = new Set();

  constructor(
    config: MonitorConfig,
    dexConfig: DexConfig,
    tradeProcessor: TradeProcessor,
    liquidityProcessor: LiquidityProcessor
  ) {
    super(config);
    this.dexConfig = dexConfig;
    this.tradeProcessor = tradeProcessor;
    this.liquidityProcessor = liquidityProcessor;
    
    // Initialize factory contract
    this.factoryContract = new ethers.Contract(
      dexConfig.factoryAddress,
      FACTORY_ABI,
      this.wsProvider || this.provider
    );
    
    this.setupFactoryListeners();
  }

  private setupFactoryListeners(): void {
    if (!this.wsProvider) return;
    
    // Listen for PairCreated events
    this.factoryContract.on('PairCreated', async (
      token0: string,
      token1: string,
      pair: string,
      index: bigint,
      event: ethers.EventLog
    ) => {
      this.logger.info(`New pair created on ${this.dexConfig.name}: ${pair}`);
      
      const pairData: Pair = {
        address: pair.toLowerCase(),
        token0: token0.toLowerCase(),
        token1: token1.toLowerCase(),
        reserve0: '0',
        reserve1: '0',
        totalSupply: '0',
        dex: this.dexConfig.name,
        createdAt: Date.now(),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      };
      
      // Start monitoring this pair
      await this.addPairToWatch(pair);
      
      // Process the new pair
      await this.liquidityProcessor.processNewPair(pairData);
      
      this.emit(EventType.PAIR_CREATED, pairData);
    });
  }

  public async addPairToWatch(pairAddress: string): Promise<void> {
    const address = pairAddress.toLowerCase();
    
    if (this.watchedPairs.has(address)) {
      return;
    }
    
    this.watchedPairs.add(address);
    
    // Create pair contract instance
    const pairContract = new ethers.Contract(
      address,
      PAIR_ABI,
      this.wsProvider || this.provider
    );
    
    this.pairContracts.set(address, pairContract);
    
    if (this.wsProvider) {
      this.setupPairListeners(pairContract, address);
    }
    
    this.logger.info(`Added pair to watch: ${address}`);
  }

  private setupPairListeners(pairContract: ethers.Contract, pairAddress: string): void {
    // Listen for Swap events
    pairContract.on('Swap', async (
      sender: string,
      amount0In: bigint,
      amount1In: bigint,
      amount0Out: bigint,
      amount1Out: bigint,
      to: string,
      event: ethers.EventLog
    ) => {
      try {
        const [token0, token1] = await Promise.all([
          pairContract.token0(),
          pairContract.token1(),
        ]);
        
        const trade: Trade = {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: Date.now(),
          pair: pairAddress,
          trader: to.toLowerCase(),
          tokenIn: amount0In > 0n ? token0.toLowerCase() : token1.toLowerCase(),
          tokenOut: amount0Out > 0n ? token0.toLowerCase() : token1.toLowerCase(),
          amountIn: amount0In > 0n ? amount0In.toString() : amount1In.toString(),
          amountOut: amount0Out > 0n ? amount0Out.toString() : amount1Out.toString(),
          gasUsed: '0', // Will be updated from receipt
          gasPrice: '0', // Will be updated from receipt
        };
        
        await this.tradeProcessor.processTrade(trade);
        this.emit(EventType.SWAP, trade);
      } catch (error) {
        this.logger.error(`Error processing swap event:`, error);
      }
    });
    
    // Listen for Mint events (liquidity added)
    pairContract.on('Mint', async (
      sender: string,
      amount0: bigint,
      amount1: bigint,
      event: ethers.EventLog
    ) => {
      try {
        const liquidityEvent: LiquidityEvent = {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: Date.now(),
          pair: pairAddress,
          provider: sender.toLowerCase(),
          token0Amount: amount0.toString(),
          token1Amount: amount1.toString(),
          liquidity: '0', // Will be calculated
          type: 'ADD',
        };
        
        await this.liquidityProcessor.processLiquidityEvent(liquidityEvent);
        this.emit(EventType.LIQUIDITY_ADDED, liquidityEvent);
      } catch (error) {
        this.logger.error(`Error processing mint event:`, error);
      }
    });
    
    // Listen for Burn events (liquidity removed)
    pairContract.on('Burn', async (
      sender: string,
      amount0: bigint,
      amount1: bigint,
      to: string,
      event: ethers.EventLog
    ) => {
      try {
        const liquidityEvent: LiquidityEvent = {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: Date.now(),
          pair: pairAddress,
          provider: to.toLowerCase(),
          token0Amount: amount0.toString(),
          token1Amount: amount1.toString(),
          liquidity: '0', // Will be calculated
          type: 'REMOVE',
        };
        
        await this.liquidityProcessor.processLiquidityEvent(liquidityEvent);
        this.emit(EventType.LIQUIDITY_REMOVED, liquidityEvent);
      } catch (error) {
        this.logger.error(`Error processing burn event:`, error);
      }
    });
    
    // Listen for Sync events (reserve updates)
    pairContract.on('Sync', async (
      reserve0: bigint,
      reserve1: bigint,
      event: ethers.EventLog
    ) => {
      try {
        await this.liquidityProcessor.updateReserves(
          pairAddress,
          reserve0.toString(),
          reserve1.toString()
        );
      } catch (error) {
        this.logger.error(`Error processing sync event:`, error);
      }
    });
  }

  protected async getLogs(range: BlockRange): Promise<ethers.Log[]> {
    const logs: ethers.Log[] = [];
    
    try {
      // Get factory logs (PairCreated events)
      const factoryLogs = await this.provider.getLogs({
        address: this.dexConfig.factoryAddress,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
      });
      logs.push(...factoryLogs);
      
      // Get logs from watched pairs
      if (this.watchedPairs.size > 0) {
        const pairAddresses = Array.from(this.watchedPairs);
        
        // Batch requests to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < pairAddresses.length; i += batchSize) {
          const batch = pairAddresses.slice(i, i + batchSize);
          
          const pairLogs = await Promise.all(
            batch.map(address =>
              this.provider.getLogs({
                address,
                fromBlock: range.fromBlock,
                toBlock: range.toBlock,
              })
            )
          );
          
          logs.push(...pairLogs.flat());
        }
      }
      
      return logs;
    } catch (error) {
      this.logger.error('Error fetching DEX logs:', error);
      throw error;
    }
  }

  protected async processLogs(logs: ethers.Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const address = log.address.toLowerCase();
        
        // Check if it's a factory event
        if (address === this.dexConfig.factoryAddress.toLowerCase()) {
          await this.processFactoryLog(log);
        }
        // Check if it's a pair event
        else if (this.watchedPairs.has(address)) {
          await this.processPairLog(log, address);
        }
      } catch (error) {
        this.logger.error('Error processing log:', error);
      }
    }
  }

  private async processFactoryLog(log: ethers.Log): Promise<void> {
    const parsedLog = this.factoryContract.interface.parseLog({
      topics: log.topics as string[],
      data: log.data
    });
    
    if (!parsedLog) return;
    
    if (parsedLog.name === 'PairCreated') {
      const [token0, token1, pair] = parsedLog.args;
      
      const pairData: Pair = {
        address: pair.toLowerCase(),
        token0: token0.toLowerCase(),
        token1: token1.toLowerCase(),
        reserve0: '0',
        reserve1: '0',
        totalSupply: '0',
        dex: this.dexConfig.name,
        createdAt: Date.now(),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
      
      await this.addPairToWatch(pair);
      await this.liquidityProcessor.processNewPair(pairData);
      this.emit(EventType.PAIR_CREATED, pairData);
    }
  }

  private async processPairLog(log: ethers.Log, pairAddress: string): Promise<void> {
    const pairContract = this.pairContracts.get(pairAddress);
    if (!pairContract) return;
    
    const parsedLog = pairContract.interface.parseLog({
      topics: log.topics as string[],
      data: log.data
    });
    
    if (!parsedLog) return;
    
    switch (parsedLog.name) {
      case 'Swap':
        await this.handleSwapLog(parsedLog, log, pairAddress);
        break;
      case 'Mint':
        await this.handleMintLog(parsedLog, log, pairAddress);
        break;
      case 'Burn':
        await this.handleBurnLog(parsedLog, log, pairAddress);
        break;
      case 'Sync':
        await this.handleSyncLog(parsedLog, pairAddress);
        break;
    }
  }

  private async handleSwapLog(
    parsedLog: ethers.LogDescription,
    log: ethers.Log,
    pairAddress: string
  ): Promise<void> {
    const [_sender, amount0In, amount1In, amount0Out, amount1Out, to] = parsedLog.args;
    const pairContract = this.pairContracts.get(pairAddress);
    
    if (!pairContract) return;
    
    const [token0, token1] = await Promise.all([
      pairContract.token0(),
      pairContract.token1(),
    ]);
    
    const trade: Trade = {
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: Date.now(),
      pair: pairAddress,
      trader: to.toLowerCase(),
      tokenIn: amount0In > 0n ? token0.toLowerCase() : token1.toLowerCase(),
      tokenOut: amount0Out > 0n ? token0.toLowerCase() : token1.toLowerCase(),
      amountIn: amount0In > 0n ? amount0In.toString() : amount1In.toString(),
      amountOut: amount0Out > 0n ? amount0Out.toString() : amount1Out.toString(),
      gasUsed: '0',
      gasPrice: '0',
    };
    
    await this.tradeProcessor.processTrade(trade);
    this.emit(EventType.SWAP, trade);
  }

  private async handleMintLog(
    parsedLog: ethers.LogDescription,
    log: ethers.Log,
    pairAddress: string
  ): Promise<void> {
    const [sender, amount0, amount1] = parsedLog.args;
    
    const liquidityEvent: LiquidityEvent = {
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: Date.now(),
      pair: pairAddress,
      provider: sender.toLowerCase(),
      token0Amount: amount0.toString(),
      token1Amount: amount1.toString(),
      liquidity: '0',
      type: 'ADD',
    };
    
    await this.liquidityProcessor.processLiquidityEvent(liquidityEvent);
    this.emit(EventType.LIQUIDITY_ADDED, liquidityEvent);
  }

  private async handleBurnLog(
    parsedLog: ethers.LogDescription,
    log: ethers.Log,
    pairAddress: string
  ): Promise<void> {
    const [_sender, amount0, amount1, to] = parsedLog.args;
    
    const liquidityEvent: LiquidityEvent = {
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: Date.now(),
      pair: pairAddress,
      provider: to.toLowerCase(),
      token0Amount: amount0.toString(),
      token1Amount: amount1.toString(),
      liquidity: '0',
      type: 'REMOVE',
    };
    
    await this.liquidityProcessor.processLiquidityEvent(liquidityEvent);
    this.emit(EventType.LIQUIDITY_REMOVED, liquidityEvent);
  }

  private async handleSyncLog(
    parsedLog: ethers.LogDescription,
    pairAddress: string
  ): Promise<void> {
    const [reserve0, reserve1] = parsedLog.args;
    
    await this.liquidityProcessor.updateReserves(
      pairAddress,
      reserve0.toString(),
      reserve1.toString()
    );
  }

  protected async processBlockData(block: ethers.Block): Promise<void> {
    // Additional block processing if needed
    this.logger.debug(`Processing block ${block.number} for DEX ${this.dexConfig.name}`);
  }

  public getWatchedPairs(): string[] {
    return Array.from(this.watchedPairs);
  }

  public getDexName(): string {
    return this.dexConfig.name;
  }
}