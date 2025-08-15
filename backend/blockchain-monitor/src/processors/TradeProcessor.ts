import { ethers } from 'ethers';
import winston from 'winston';
import { Trade } from '../types';
import { DatabaseService } from '@core-meme/shared';
import { AnalyticsService } from '../services/AnalyticsService';
import { AlertService } from '../services/AlertService';
import { createClient, RedisClientType } from 'redis';

export class TradeProcessor {
  private logger: winston.Logger;
  private provider: ethers.JsonRpcProvider;
  private db: DatabaseService;
  private analytics: AnalyticsService;
  private alertService: AlertService;
  private redis: RedisClientType;
  
  // Thresholds for alerts (adjusted for meme tokens)
  private readonly LARGE_TRADE_USD = 100; // $100+ USD
  private readonly WHALE_TRADE_USD = 500; // $500+ USD
  private readonly PRICE_IMPACT_THRESHOLD = 10; // 10% for bonding curve

  constructor(
    provider: ethers.JsonRpcProvider,
    db: DatabaseService,
    analytics: AnalyticsService,
    alertService: AlertService
  ) {
    this.provider = provider;
    this.db = db;
    this.analytics = analytics;
    this.alertService = alertService;
    
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
          filename: 'trade-processor.log' 
        }),
      ],
    });
    
    // Initialize Redis
    this.redis = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });
    
    this.redis.connect().catch(err => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async processTrade(trade: Trade): Promise<void> {
    try {
      this.logger.debug(`Processing trade: ${trade.transactionHash}`);
      
      // Get transaction receipt for gas info
      const receipt = await this.provider.getTransactionReceipt(trade.transactionHash);
      if (receipt) {
        trade.gasUsed = receipt.gasUsed.toString();
        trade.gasPrice = receipt.gasPrice?.toString() || '0';
      }
      
      // Calculate price impact if not provided
      if (!trade.priceImpact) {
        trade.priceImpact = await this.calculatePriceImpact(trade);
      }
      
      // Save trade to database
      await this.db.saveTrade(trade);
      
      // Update token analytics
      await this.updateTokenAnalytics(trade);
      
      // Check for significant trades
      await this.checkSignificantTrade(trade);
      
      // Update trader profile
      await this.updateTraderProfile(trade);
      
      // Cache recent trades
      await this.cacheRecentTrade(trade);
      
      // Publish to WebSocket
      await this.publishTradeEvent(trade);
      
      // Update volume metrics
      await this.updateVolumeMetrics(trade);
      
    } catch (error) {
      this.logger.error(`Error processing trade ${trade.transactionHash}:`, error);
      throw error;
    }
  }

  private async calculatePriceImpact(trade: Trade): Promise<number> {
    try {
      // Get pair reserves
      const pairAbi = [
        'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() view returns (address)',
        'function token1() view returns (address)',
      ];
      
      const pairContract = new ethers.Contract(trade.pair, pairAbi, this.provider);
      const [reserves, token0, _token1] = await Promise.all([
        pairContract.getReserves(),
        pairContract.token0(),
        pairContract.token1(),
      ]);
      
      const isToken0In = trade.tokenIn.toLowerCase() === token0.toLowerCase();
      const reserveIn = isToken0In ? reserves[0] : reserves[1];
      const reserveOut = isToken0In ? reserves[1] : reserves[0];
      
      // Calculate price impact using constant product formula
      const amountIn = BigInt(trade.amountIn);
      const amountOut = BigInt(trade.amountOut);
      
      const expectedPrice = (reserveOut * BigInt(1e18)) / reserveIn;
      const actualPrice = (amountOut * BigInt(1e18)) / amountIn;
      
      const priceImpact = Number(
        ((expectedPrice - actualPrice) * BigInt(10000)) / expectedPrice
      ) / 100;
      
      return Math.abs(priceImpact);
    } catch (error) {
      this.logger.error('Error calculating price impact:', error);
      return 0;
    }
  }

  private async checkSignificantTrade(trade: Trade): Promise<void> {
    // Get token prices
    const tokenInPrice = await this.analytics.getTokenPrice(trade.tokenIn);
    const tokenOutPrice = await this.analytics.getTokenPrice(trade.tokenOut);
    
    if (!tokenInPrice || !tokenOutPrice) return;
    
    // Calculate trade value in USD
    const amountInFormatted = parseFloat(ethers.formatEther(trade.amountIn));
    const amountOutFormatted = parseFloat(ethers.formatEther(trade.amountOut));
    
    const tradeValueUSD = Math.max(
      amountInFormatted * tokenInPrice,
      amountOutFormatted * tokenOutPrice
    );
    
    // Check for large trades
    if (tradeValueUSD >= this.WHALE_TRADE_USD) {
      await this.alertService.sendAlert({
        id: `whale-trade-${trade.transactionHash}`,
        type: 'WHALE_ACTIVITY',
        severity: 'HIGH',
        tokenAddress: trade.tokenIn,
        message: `🐋 Whale trade detected: $${tradeValueUSD.toFixed(2)}`,
        data: {
          trade,
          valueUSD: tradeValueUSD,
          priceImpact: trade.priceImpact,
        },
        timestamp: Date.now(),
      });
    } else if (tradeValueUSD >= this.LARGE_TRADE_USD) {
      const isBuy = await this.isCorePair(trade.pair) && 
                   trade.tokenOut.toLowerCase() !== await this.getCoreAddress();
      
      await this.alertService.sendAlert({
        id: `large-trade-${trade.transactionHash}`,
        type: isBuy ? 'LARGE_BUY' : 'LARGE_SELL',
        severity: 'MEDIUM',
        tokenAddress: isBuy ? trade.tokenOut : trade.tokenIn,
        message: `💰 Large ${isBuy ? 'buy' : 'sell'}: $${tradeValueUSD.toFixed(2)}`,
        data: {
          trade,
          valueUSD: tradeValueUSD,
          priceImpact: trade.priceImpact,
        },
        timestamp: Date.now(),
      });
    }
    
    // Check for high price impact
    if (trade.priceImpact && trade.priceImpact > this.PRICE_IMPACT_THRESHOLD) {
      await this.alertService.sendAlert({
        id: `high-impact-${trade.transactionHash}`,
        type: 'WHALE_ACTIVITY',
        severity: 'MEDIUM',
        tokenAddress: trade.tokenOut,
        message: `⚠️ High price impact trade: ${trade.priceImpact.toFixed(2)}%`,
        data: {
          trade,
          priceImpact: trade.priceImpact,
        },
        timestamp: Date.now(),
      });
    }
  }

  private async updateTokenAnalytics(trade: Trade): Promise<void> {
    // Update analytics for both tokens
    const tokens = [trade.tokenIn, trade.tokenOut];
    
    for (const token of tokens) {
      try {
        // Skip if it's CORE or WCORE
        if (await this.isCoreToken(token)) continue;
        
        // Update 24h volume
        await this.db.incrementTokenVolume(token, trade);
        
        // Update transaction count
        await this.db.incrementTokenTransactions(token);
        
        // Recalculate analytics
        const analytics = await this.analytics.analyzeToken(token);
        await this.db.saveTokenAnalytics(analytics);
      } catch (error) {
        this.logger.error(`Error updating analytics for ${token}:`, error);
      }
    }
  }

  private async updateTraderProfile(trade: Trade): Promise<void> {
    try {
      // Get or create trader profile
      let profile = await this.db.getTraderProfile(trade.trader);
      
      if (!profile) {
        profile = {
          address: trade.trader,
          totalTrades: 0,
          totalVolumeUSD: 0,
          profitLoss: 0,
          winRate: 0,
          avgTradeSize: 0,
          firstTrade: trade.timestamp,
          lastTrade: trade.timestamp,
          favoriteTokens: [],
        };
      }
      
      // Update profile metrics
      profile.totalTrades++;
      profile.lastTrade = trade.timestamp;
      
      // Calculate trade value
      const tokenPrice = await this.analytics.getTokenPrice(trade.tokenIn);
      if (tokenPrice) {
        const tradeValue = parseFloat(ethers.formatEther(trade.amountIn)) * tokenPrice;
        profile.totalVolumeUSD += tradeValue;
        profile.avgTradeSize = profile.totalVolumeUSD / profile.totalTrades;
      }
      
      // Update favorite tokens
      const tokenCounts = new Map<string, number>();
      for (const token of [trade.tokenIn, trade.tokenOut]) {
        if (!await this.isCoreToken(token)) {
          tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
        }
      }
      
      // Save updated profile
      await this.db.saveTraderProfile(profile);
      
      // Check if this is a notable trader
      if (profile.totalVolumeUSD > 100000) { // $100k+ volume
        await this.db.markAsWhale(trade.trader);
      }
      
    } catch (error) {
      this.logger.error(`Error updating trader profile ${trade.trader}:`, error);
    }
  }

  private async cacheRecentTrade(trade: Trade): Promise<void> {
    try {
      // Cache in Redis for real-time access
      const key = `trades:recent:${trade.pair}`;
      const tradeData = JSON.stringify(trade);
      
      // Add to list (keep last 100 trades)
      await this.redis.lPush(key, tradeData);
      await this.redis.lTrim(key, 0, 99);
      
      // Set expiry
      await this.redis.expire(key, 3600); // 1 hour
      
      // Also cache by token
      for (const token of [trade.tokenIn, trade.tokenOut]) {
        if (!await this.isCoreToken(token)) {
          const tokenKey = `trades:token:${token}`;
          await this.redis.lPush(tokenKey, tradeData);
          await this.redis.lTrim(tokenKey, 0, 49);
          await this.redis.expire(tokenKey, 3600);
        }
      }
      
      // Update volume tracking
      const volumeKey = `volume:${trade.pair}:${Math.floor(Date.now() / 3600000)}`;
      await this.redis.incrByFloat(volumeKey, parseFloat(ethers.formatEther(trade.amountIn)));
      await this.redis.expire(volumeKey, 86400); // 24 hours
      
    } catch (error) {
      this.logger.error('Error caching trade:', error);
    }
  }

  private async updateVolumeMetrics(trade: Trade): Promise<void> {
    try {
      const hour = Math.floor(trade.timestamp / 3600000);
      const day = Math.floor(trade.timestamp / 86400000);
      
      // Update hourly volume
      await this.db.updateHourlyVolume(trade.pair, hour, trade);
      
      // Update daily volume
      await this.db.updateDailyVolume(trade.pair, day, trade);
      
      // Update token volumes
      for (const token of [trade.tokenIn, trade.tokenOut]) {
        if (!await this.isCoreToken(token)) {
          await this.db.updateTokenHourlyVolume(token, hour, trade);
          await this.db.updateTokenDailyVolume(token, day, trade);
        }
      }
    } catch (error) {
      this.logger.error('Error updating volume metrics:', error);
    }
  }

  private async publishTradeEvent(trade: Trade): Promise<void> {
    try {
      const eventData = {
        event: 'NEW_TRADE',
        data: trade,
        timestamp: Date.now(),
      };
      
      // Publish to both channels for backward compatibility
      await Promise.all([
        this.redis.publish('trade-events', JSON.stringify(eventData)),
        this.redis.publish('websocket:trade', JSON.stringify({
          ...trade,
          tokenAddress: trade.tokenOut, // Add tokenAddress for WebSocket filtering
        })),
      ]);
      
      // Also publish price update if significant
      const tokenPrice = await this.analytics.getTokenPrice(trade.tokenOut);
      if (tokenPrice) {
        await this.redis.publish('websocket:price_update', JSON.stringify({
          tokenAddress: trade.tokenOut,
          price: tokenPrice,
          priceChange24h: await this.analytics.getPriceChange24h(trade.tokenOut),
          volume24h: await this.analytics.getVolume24h(trade.tokenOut),
          timestamp: Date.now(),
        }));
      }
    } catch (error) {
      this.logger.error('Error publishing trade event:', error);
    }
  }

  private async isCorePair(pairAddress: string): Promise<boolean> {
    try {
      const pairAbi = ['function token0() view returns (address)', 'function token1() view returns (address)'];
      const pairContract = new ethers.Contract(pairAddress, pairAbi, this.provider);
      const [token0, token1] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
      ]);
      
      const coreAddress = await this.getCoreAddress();
      return token0.toLowerCase() === coreAddress || token1.toLowerCase() === coreAddress;
    } catch (error) {
      return false;
    }
  }

  private async isCoreToken(address: string): Promise<boolean> {
    const coreAddress = await this.getCoreAddress();
    const wcoreAddress = await this.getWCoreAddress();
    const lowerAddress = address.toLowerCase();
    return lowerAddress === coreAddress || lowerAddress === wcoreAddress;
  }

  private async getCoreAddress(): Promise<string> {
    // Core native token address (placeholder)
    return '0x0000000000000000000000000000000000000000';
  }

  private async getWCoreAddress(): Promise<string> {
    // Wrapped Core address
    const network = process.env.NETWORK || 'mainnet';
    return network === 'mainnet' 
      ? '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f'.toLowerCase()
      : '0x0000000000000000000000000000000000000000'; // Testnet WCORE
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}