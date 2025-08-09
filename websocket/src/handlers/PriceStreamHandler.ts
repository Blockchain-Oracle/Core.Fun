import { ethers } from 'ethers';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

interface PriceUpdate {
  tokenAddress: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  timestamp: number;
}

export class PriceStreamHandler {
  private provider: ethers.JsonRpcProvider;
  private redis: Redis;
  private subscriptions: Map<string, Set<string>> = new Map(); // clientId -> token addresses
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private tokenPrices: Map<string, PriceUpdate> = new Map();

  constructor(provider: ethers.JsonRpcProvider, redis: Redis) {
    this.provider = provider;
    this.redis = redis;
  }

  async start(): Promise<void> {
    logger.info('Starting price stream handler');
    
    // Start price update loop
    this.startPriceUpdates();
  }

  async stop(): Promise<void> {
    logger.info('Stopping price stream handler');
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
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
      
      // Add token to monitoring if not already
      if (!this.tokenPrices.has(token.toLowerCase())) {
        this.addTokenToMonitoring(token.toLowerCase());
      }
    });
    
    // Send initial prices
    const initialPrices: PriceUpdate[] = [];
    tokens.forEach((token: string) => {
      const price = this.tokenPrices.get(token.toLowerCase());
      if (price) {
        initialPrices.push(price);
      }
    });
    
    if (initialPrices.length > 0) {
      this.redis.publish('price-updates', JSON.stringify({
        clientId,
        prices: initialPrices,
      }));
    }
  }

  async unsubscribe(clientId: string): Promise<void> {
    this.subscriptions.delete(clientId);
  }

  private startPriceUpdates(): void {
    // Update prices every 5 seconds
    this.priceUpdateInterval = setInterval(async () => {
      try {
        await this.updateAllPrices();
      } catch (error) {
        logger.error('Error updating prices:', error);
      }
    }, 5000);
  }

  private async addTokenToMonitoring(tokenAddress: string): Promise<void> {
    try {
      // Get initial price data
      const priceData = await this.fetchTokenPrice(tokenAddress);
      this.tokenPrices.set(tokenAddress, priceData);
    } catch (error) {
      logger.error(`Failed to add token ${tokenAddress} to monitoring:`, error);
    }
  }

  private async updateAllPrices(): Promise<void> {
    const updates: Map<string, PriceUpdate[]> = new Map();
    
    // Update all monitored tokens
    for (const [tokenAddress] of this.tokenPrices) {
      try {
        const priceData = await this.fetchTokenPrice(tokenAddress);
        const oldPrice = this.tokenPrices.get(tokenAddress);
        
        // Check if price changed
        if (!oldPrice || oldPrice.price !== priceData.price) {
          this.tokenPrices.set(tokenAddress, priceData);
          
          // Find all clients subscribed to this token
          this.subscriptions.forEach((tokens, clientId) => {
            if (tokens.has(tokenAddress)) {
              if (!updates.has(clientId)) {
                updates.set(clientId, []);
              }
              updates.get(clientId)!.push(priceData);
            }
          });
        }
      } catch (error) {
        logger.error(`Failed to update price for ${tokenAddress}:`, error);
      }
    }
    
    // Broadcast updates
    updates.forEach((prices, clientId) => {
      this.redis.publish('price-updates', JSON.stringify({
        clientId,
        prices,
      }));
    });
  }

  private async fetchTokenPrice(tokenAddress: string): Promise<PriceUpdate> {
    // This would integrate with your DEX contracts
    // For now, returning mock data
    // In production, this would query actual DEX pairs
    
    try {
      // Example: Query Uniswap V2 style pair
      // const pairAddress = await this.getPairAddress(tokenAddress);
      // const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      // const reserves = await pair.getReserves();
      // Calculate price from reserves...
      
      // Mock implementation
      const basePrice = this.tokenPrices.get(tokenAddress)?.price || Math.random() * 10;
      const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
      
      return {
        tokenAddress,
        price: basePrice * (1 + variation),
        priceChange24h: (Math.random() - 0.5) * 20, // -10% to +10%
        volume24h: Math.random() * 1000000,
        liquidity: Math.random() * 5000000,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(`Failed to fetch price for ${tokenAddress}: ${error}`);
    }
  }
}