import { ethers } from 'ethers';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

interface Trade {
  txHash: string;
  tokenAddress: string;
  tokenSymbol: string;
  trader: string;
  type: 'buy' | 'sell';
  amountToken: string;
  amountCore: string;
  price: number;
  timestamp: number;
  blockNumber: number;
  dex: string;
}

// Router ABI for monitoring swaps
const ROUTER_ABI = [
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
];

// DEX Router addresses
const DEX_ROUTERS = {
  ShadowSwap: '0xd15CeE1DEaFBad6C0B3Fd7489677Cc102B141464',
  LFGSwap: '0x52Ada6E8d553E5EaCA196c9D975DB7a76627dc61',
  IcecreamSwap: '0xC5B19E6a5e4806A107B01f246232e65E195D9ae8',
};

export class TradeStreamHandler {
  private provider: ethers.JsonRpcProvider;
  private redis: Redis;
  private subscriptions: Map<string, Set<string>> = new Map(); // clientId -> token addresses
  private routerContracts: Map<string, ethers.Contract> = new Map();
  private isMonitoring = false;

  constructor(provider: ethers.JsonRpcProvider, redis: Redis) {
    this.provider = provider;
    this.redis = redis;
    
    // Initialize router contracts
    Object.entries(DEX_ROUTERS).forEach(([name, address]) => {
      const contract = new ethers.Contract(address, ROUTER_ABI, provider);
      this.routerContracts.set(name, contract);
    });
  }

  async start(): Promise<void> {
    logger.info('Starting trade stream handler');
    
    if (!this.isMonitoring) {
      this.startMonitoring();
      this.isMonitoring = true;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping trade stream handler');
    
    // Remove all event listeners
    this.routerContracts.forEach(contract => {
      contract.removeAllListeners();
    });
    
    this.isMonitoring = false;
  }

  async subscribe(clientId: string, params: any): Promise<void> {
    const { tokens } = params;
    
    if (!Array.isArray(tokens)) {
      throw new Error('Invalid subscription params: tokens must be an array');
    }
    
    // Store subscription
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    
    tokens.forEach((token: string) => {
      this.subscriptions.get(clientId)!.add(token.toLowerCase());
    });
  }

  async unsubscribe(clientId: string): Promise<void> {
    this.subscriptions.delete(clientId);
  }

  private startMonitoring(): void {
    // Monitor each DEX router for swaps
    this.routerContracts.forEach((contract, dexName) => {
      contract.on('Swap', async (...args) => {
        try {
          const event = args[args.length - 1];
          await this.handleSwap(dexName, event);
        } catch (error) {
          logger.error(`Error handling swap on ${dexName}:`, error);
        }
      });
      
      logger.info(`Monitoring ${dexName} router for trades`);
    });
  }

  private async handleSwap(dexName: string, event: any): Promise<void> {
    try {
      // Parse the swap event
      const tx = await event.getTransaction();
      const receipt = await event.getTransactionReceipt();
      const block = await event.getBlock();
      
      // Parse transaction to determine token and amounts
      // This is simplified - actual implementation would decode the transaction input
      const tradeData = await this.parseSwapTransaction(tx, receipt, dexName);
      
      if (!tradeData) return;
      
      const trade: Trade = {
        ...tradeData,
        timestamp: block.timestamp * 1000,
        blockNumber: block.number,
        dex: dexName,
      };
      
      // Broadcast to subscribers of this token
      this.broadcastTrade(trade);
      
    } catch (error) {
      logger.error('Error processing swap:', error);
    }
  }

  private async parseSwapTransaction(
    tx: any,
    _receipt: any,
    _dexName: string
  ): Promise<Partial<Trade> | null> {
    try {
      // This would parse the actual transaction data
      // For now, returning mock data
      // In production, would decode the router method call and extract:
      // - Token address
      // - Trade direction (buy/sell)
      // - Amounts
      // - Price
      
      return {
        txHash: tx.hash,
        tokenAddress: '0x' + '0'.repeat(40), // Mock address
        tokenSymbol: 'MOCK',
        trader: tx.from,
        type: Math.random() > 0.5 ? 'buy' : 'sell',
        amountToken: (Math.random() * 10000).toFixed(2),
        amountCore: (Math.random() * 10).toFixed(4),
        price: Math.random() * 0.01,
      };
    } catch (error) {
      logger.error('Error parsing swap transaction:', error);
      return null;
    }
  }

  private broadcastTrade(trade: Trade): void {
    // Find all clients subscribed to this token
    const interestedClients: string[] = [];
    
    this.subscriptions.forEach((tokens, clientId) => {
      if (tokens.has(trade.tokenAddress.toLowerCase()) || tokens.has('*')) {
        interestedClients.push(clientId);
      }
    });
    
    // Broadcast to interested clients
    interestedClients.forEach(clientId => {
      this.redis.publish('trades', JSON.stringify({
        clientId,
        trades: [trade],
      }));
    });
  }
}