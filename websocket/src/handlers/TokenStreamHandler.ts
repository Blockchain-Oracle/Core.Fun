import { ethers } from 'ethers';
import Redis from 'ioredis';
import { createLogger } from '@core-meme/shared';

interface NewToken {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  creator: string;
  pairAddress: string;
  initialLiquidity: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

// DEX Factory ABIs for monitoring new pairs
const FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
];

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Core DEX factory addresses - using IcecreamSwap V2 as primary DEX
const DEX_FACTORIES = {
  IcecreamSwap: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f', // IcecreamSwap V2 Factory
};

export class TokenStreamHandler {
  private provider: ethers.JsonRpcProvider;
  private redis: Redis;
  private subscriptions: Set<string> = new Set(); // clientIds subscribed to new tokens
  private factoryContracts: Map<string, ethers.Contract> = new Map();
  private isMonitoring = false;
  private logger = createLogger({ service: 'websocket-tokens' });

  constructor(provider: ethers.JsonRpcProvider, redis: Redis) {
    this.provider = provider;
    this.redis = redis;
    
    // Initialize factory contracts
    Object.entries(DEX_FACTORIES).forEach(([name, address]) => {
      const contract = new ethers.Contract(address, FACTORY_ABI, provider);
      this.factoryContracts.set(name, contract);
    });
  }

  async start(): Promise<void> {
    this.logger.info('Starting token stream handler');
    
    if (!this.isMonitoring) {
      this.startMonitoring();
      this.isMonitoring = true;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping token stream handler');
    
    // Remove all event listeners
    this.factoryContracts.forEach(contract => {
      contract.removeAllListeners();
    });
    
    this.isMonitoring = false;
  }

  async subscribe(clientId: string, params: any): Promise<void> {
    this.subscriptions.add(clientId);
    
    // Send recent tokens if requested
    if (params?.includeRecent) {
      const recentTokens = await this.getRecentTokens();
      if (recentTokens.length > 0) {
        this.redis.publish('websocket:new_token', JSON.stringify({
          clientId,
          tokens: recentTokens,
        }));
      }
    }
  }

  async unsubscribe(clientId: string): Promise<void> {
    this.subscriptions.delete(clientId);
  }

  private startMonitoring(): void {
    // Monitor each DEX factory for new pairs
    this.factoryContracts.forEach((contract, dexName) => {
      contract.on('PairCreated', async (token0, token1, pair, event) => {
        try {
          await this.handleNewPair(dexName, token0, token1, pair, event);
        } catch (error) {
          this.logger.error(`Error handling new pair on ${dexName}:`, error);
        }
      });
      
      this.logger.info(`Monitoring ${dexName} factory for new pairs`);
    });
  }

  private async handleNewPair(
    dexName: string,
    token0: string,
    token1: string,
    pairAddress: string,
    event: any
  ): Promise<void> {
    try {
      // Determine which token is new (not WCORE)
      const WCORE = '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f'; // Wrapped CORE
      let newTokenAddress: string;
      
      if (token0.toLowerCase() === WCORE.toLowerCase()) {
        newTokenAddress = token1;
      } else if (token1.toLowerCase() === WCORE.toLowerCase()) {
        newTokenAddress = token0;
      } else {
        // Neither token is WCORE, skip
        return;
      }
      
      // Get token details
      const tokenContract = new ethers.Contract(newTokenAddress, ERC20_ABI, this.provider);
      
      const [name, symbol, totalSupply, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.totalSupply(),
        tokenContract.decimals(),
      ]);
      
      // Get transaction details
      const tx = await event.getTransaction();
      const block = await event.getBlock();
      
      // Get initial liquidity (simplified - would need pair contract interaction)
      const initialLiquidity = '0'; // Would calculate from pair reserves
      
      const newToken: NewToken = {
        address: newTokenAddress,
        name,
        symbol,
        totalSupply: ethers.formatUnits(totalSupply, decimals),
        creator: tx.from,
        pairAddress,
        initialLiquidity,
        timestamp: block.timestamp * 1000,
        blockNumber: block.number,
        txHash: tx.hash,
      };
      
      this.logger.info(`New token detected on ${dexName}: ${symbol} (${newTokenAddress})`);
      
      // Store in database (would implement this)
      await this.storeNewToken(newToken);
      
      // Broadcast to all subscribers
      this.broadcastNewToken(newToken);
      
    } catch (error) {
      this.logger.error('Error processing new pair:', error);
    }
  }

  private async storeNewToken(token: NewToken): Promise<void> {
    // Store in database for historical data
    // This would connect to your PostgreSQL database
    // For now, just log it
    this.logger.info('Storing new token:', token);
  }

  private broadcastNewToken(token: NewToken): void {
    // Broadcast to all subscribed clients
    this.subscriptions.forEach(clientId => {
      this.redis.publish('websocket:new_token', JSON.stringify({
        clientId,
        tokens: [token],
      }));
    });
  }

  private async getRecentTokens(): Promise<NewToken[]> {
    // Query database for recent tokens
    // For now, return empty array
    return [];
  }
}