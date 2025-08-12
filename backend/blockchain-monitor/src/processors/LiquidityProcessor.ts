import { ethers } from 'ethers';
import winston from 'winston';
import { Pair, LiquidityEvent } from '../types';
import { DatabaseService } from '../services/DatabaseService';
import { AlertService } from '../services/AlertService';
import { createClient, RedisClientType } from 'redis';

export class LiquidityProcessor {
  private logger: winston.Logger;
  private provider: ethers.JsonRpcProvider;
  private db: DatabaseService;
  private alertService: AlertService;
  private redis: RedisClientType;
  
  // Thresholds
  private readonly LARGE_LIQUIDITY_USD = 50000; // $50k+
  private readonly CRITICAL_LIQUIDITY_REMOVAL = 80; // 80% of liquidity

  constructor(
    provider: ethers.JsonRpcProvider,
    db: DatabaseService,
    alertService: AlertService
  ) {
    this.provider = provider;
    this.db = db;
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
          filename: 'liquidity-processor.log' 
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

  async processNewPair(pair: Pair): Promise<void> {
    try {
      this.logger.info(`Processing new pair: ${pair.address} on ${pair.dex}`);
      
      // Save pair to database
      await this.db.savePair(pair);
      
      // Get initial reserves
      const reserves = await this.getPairReserves(pair.address);
      if (reserves) {
        pair.reserve0 = reserves.reserve0;
        pair.reserve1 = reserves.reserve1;
        await this.db.updatePairReserves(pair.address, reserves.reserve0, reserves.reserve1);
      }
      
      // Check if this is a significant pair
      await this.checkSignificantPair(pair);
      
      // Cache pair data
      await this.cachePairData(pair);
      
      // Publish to WebSocket
      await this.publishPairEvent('NEW_PAIR', pair);
      
    } catch (error) {
      this.logger.error(`Error processing new pair ${pair.address}:`, error);
      throw error;
    }
  }

  async processLiquidityEvent(event: LiquidityEvent): Promise<void> {
    try {
      this.logger.debug(`Processing liquidity event: ${event.type} for pair ${event.pair}`);
      
      // Calculate liquidity value
      const liquidityValue = await this.calculateLiquidityValue(event);
      event.liquidity = liquidityValue.toString();
      
      // Save event to database
      await this.db.saveLiquidityEvent(event);
      
      // Update pair reserves
      const reserves = await this.getPairReserves(event.pair);
      if (reserves) {
        await this.db.updatePairReserves(event.pair, reserves.reserve0, reserves.reserve1);
      }
      
      // Check for significant liquidity changes
      await this.checkSignificantLiquidityChange(event, liquidityValue);
      
      // Update cached data
      await this.updateCachedLiquidity(event);
      
      // Publish to WebSocket
      await this.publishLiquidityEvent(event);
      
    } catch (error) {
      this.logger.error(`Error processing liquidity event:`, error);
      throw error;
    }
  }

  async updateReserves(pairAddress: string, reserve0: string, reserve1: string): Promise<void> {
    try {
      // Update database
      await this.db.updatePairReserves(pairAddress, reserve0, reserve1);
      
      // Update cache
      const key = `pair:reserves:${pairAddress.toLowerCase()}`;
      await this.redis.setEx(key, 60, JSON.stringify({ reserve0, reserve1 }));
      
      // Check for critical changes
      await this.checkReserveChanges(pairAddress, reserve0, reserve1);
      
    } catch (error) {
      this.logger.error(`Error updating reserves for ${pairAddress}:`, error);
    }
  }

  private async getPairReserves(pairAddress: string): Promise<{
    reserve0: string;
    reserve1: string;
  } | null> {
    try {
      const pairContract = new ethers.Contract(
        pairAddress,
        ['function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'],
        this.provider
      );
      
      const reserves = await pairContract.getReserves();
      
      return {
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
      };
    } catch (error) {
      this.logger.error(`Error getting reserves for ${pairAddress}:`, error);
      return null;
    }
  }

  private async calculateLiquidityValue(event: LiquidityEvent): Promise<number> {
    try {
      // Get token prices
      const pairContract = new ethers.Contract(
        event.pair,
        [
          'function token0() view returns (address)',
          'function token1() view returns (address)',
        ],
        this.provider
      );
      
      const [token0, token1] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
      ]);
      
      // This would normally get actual prices from DEX or price oracle
      // For now, estimate based on CORE price
      const corePrice = await this.getCorePrice();
      
      // Check if one token is CORE/WCORE
      const coreAddress = await this.getCoreAddress();
      const isToken0Core = token0.toLowerCase() === coreAddress;
      const isToken1Core = token1.toLowerCase() === coreAddress;
      
      if (isToken0Core) {
        const amount0InCore = parseFloat(ethers.formatEther(event.token0Amount));
        return amount0InCore * corePrice * 2; // Double for total liquidity value
      } else if (isToken1Core) {
        const amount1InCore = parseFloat(ethers.formatEther(event.token1Amount));
        return amount1InCore * corePrice * 2;
      }
      
      // If neither is CORE, estimate value (would need price oracle)
      return 0;
    } catch (error) {
      this.logger.error('Error calculating liquidity value:', error);
      return 0;
    }
  }

  private async checkSignificantPair(pair: Pair): Promise<void> {
    try {
      // Get token info
      const token0Info = await this.getTokenInfo(pair.token0);
      const token1Info = await this.getTokenInfo(pair.token1);
      
      // Check if it's a CORE pair
      const coreAddress = await this.getCoreAddress();
      const isCorePair = 
        pair.token0.toLowerCase() === coreAddress ||
        pair.token1.toLowerCase() === coreAddress;
      
      if (isCorePair) {
        const nonCoreToken = pair.token0.toLowerCase() === coreAddress ? token1Info : token0Info;
        
        if (nonCoreToken) {
          await this.alertService.sendAlert({
            id: `new-pair-${pair.address}`,
            type: 'NEW_PAIR',
            severity: 'MEDIUM',
            tokenAddress: nonCoreToken.address,
            message: `New ${pair.dex} pair created for ${nonCoreToken.name} (${nonCoreToken.symbol})`,
            data: {
              pair: pair.address,
              dex: pair.dex,
              token: nonCoreToken,
            },
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error checking significant pair:', error);
    }
  }

  private async checkSignificantLiquidityChange(
    event: LiquidityEvent,
    liquidityValueUSD: number
  ): Promise<void> {
    try {
      // Check for large liquidity additions
      if (event.type === 'ADD' && liquidityValueUSD >= this.LARGE_LIQUIDITY_USD) {
        await this.alertService.sendAlert({
          id: `large-liquidity-add-${event.transactionHash}`,
          type: 'LIQUIDITY_ADDED',
          severity: 'HIGH',
          tokenAddress: event.pair,
          message: `💧 Large liquidity added: $${liquidityValueUSD.toFixed(2)}`,
          data: {
            event,
            valueUSD: liquidityValueUSD,
          },
          timestamp: Date.now(),
        });
      }
      
      // Check for significant liquidity removals
      if (event.type === 'REMOVE') {
        const reserves = await this.getPairReserves(event.pair);
        if (reserves) {
          const totalReserve0 = BigInt(reserves.reserve0);
          const totalReserve1 = BigInt(reserves.reserve1);
          const removed0 = BigInt(event.token0Amount);
          const removed1 = BigInt(event.token1Amount);
          
          const removalPercent0 = totalReserve0 > 0n 
            ? Number((removed0 * 100n) / totalReserve0)
            : 0;
          const removalPercent1 = totalReserve1 > 0n
            ? Number((removed1 * 100n) / totalReserve1)
            : 0;
          
          const maxRemovalPercent = Math.max(removalPercent0, removalPercent1);
          
          if (maxRemovalPercent >= this.CRITICAL_LIQUIDITY_REMOVAL) {
            await this.alertService.sendAlert({
              id: `critical-liquidity-removal-${event.transactionHash}`,
              type: 'LIQUIDITY_REMOVED',
              severity: 'CRITICAL',
              tokenAddress: event.pair,
              message: `🚨 CRITICAL: ${maxRemovalPercent}% liquidity removed!`,
              data: {
                event,
                removalPercent: maxRemovalPercent,
                valueUSD: liquidityValueUSD,
              },
              timestamp: Date.now(),
            });
          } else if (liquidityValueUSD >= this.LARGE_LIQUIDITY_USD) {
            await this.alertService.sendAlert({
              id: `large-liquidity-removal-${event.transactionHash}`,
              type: 'LIQUIDITY_REMOVED',
              severity: 'HIGH',
              tokenAddress: event.pair,
              message: `⚠️ Large liquidity removed: $${liquidityValueUSD.toFixed(2)}`,
              data: {
                event,
                valueUSD: liquidityValueUSD,
              },
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking significant liquidity change:', error);
    }
  }

  private async checkReserveChanges(
    pairAddress: string,
    newReserve0: string,
    newReserve1: string
  ): Promise<void> {
    try {
      // Get previous reserves from cache
      const key = `pair:reserves:prev:${pairAddress.toLowerCase()}`;
      const prevData = await this.redis.get(key);
      
      if (prevData) {
        const prev = JSON.parse(prevData);
        const prevR0 = BigInt(prev.reserve0);
        const prevR1 = BigInt(prev.reserve1);
        const newR0 = BigInt(newReserve0);
        const newR1 = BigInt(newReserve1);
        
        // Calculate percentage changes
        const change0 = prevR0 > 0n 
          ? Number(((newR0 - prevR0) * 100n) / prevR0)
          : 0;
        const change1 = prevR1 > 0n
          ? Number(((newR1 - prevR1) * 100n) / prevR1)
          : 0;
        
        // Alert on significant reserve changes (>50%)
        if (Math.abs(change0) > 50 || Math.abs(change1) > 50) {
          this.logger.warn(`Significant reserve change in pair ${pairAddress}: ${change0}%, ${change1}%`);
        }
      }
      
      // Update previous reserves
      await this.redis.setEx(key, 3600, JSON.stringify({
        reserve0: newReserve0,
        reserve1: newReserve1,
      }));
    } catch (error) {
      this.logger.error('Error checking reserve changes:', error);
    }
  }

  private async getTokenInfo(address: string): Promise<any> {
    try {
      const tokenContract = new ethers.Contract(
        address,
        [
          'function name() view returns (string)',
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)',
        ],
        this.provider
      );
      
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name().catch(() => 'Unknown'),
        tokenContract.symbol().catch(() => 'UNKNOWN'),
        tokenContract.decimals().catch(() => 18),
      ]);
      
      return { address, name, symbol, decimals };
    } catch (error) {
      return null;
    }
  }

  private async getCorePrice(): Promise<number> {
    try {
      // Fetch real CORE price from CoinGecko API
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd');
      const data = await response.json();
      const price = data.coredaoorg?.usd || 0.50;
      
      // Cache the price for 60 seconds to avoid rate limiting
      await this.redis.setEx('core:price:usd', 60, price.toString());
      
      return price;
    } catch (error) {
      this.logger.warn('Failed to fetch CORE price from CoinGecko, checking cache:', error);
      
      // Try to get from cache
      const cached = await this.redis.get('core:price:usd');
      if (cached) {
        return parseFloat(cached);
      }
      
      // Fallback to default if all else fails
      return 0.50;
    }
  }

  private async getCoreAddress(): Promise<string> {
    // Wrapped CORE address
    const network = process.env.NETWORK || 'testnet';
    return network === 'mainnet' 
      ? '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f'.toLowerCase()
      : '0x5c872990530Fe4f7322cA0c302762788e8199Ed0'.toLowerCase(); // Testnet WCORE
  }

  private async cachePairData(pair: Pair): Promise<void> {
    try {
      const key = `pair:${pair.address.toLowerCase()}`;
      await this.redis.setEx(key, 3600, JSON.stringify(pair));
      
      // Add to DEX pairs set
      await this.redis.sAdd(`pairs:${pair.dex.toLowerCase()}`, pair.address.toLowerCase());
      
      // Add to token pairs
      await this.redis.sAdd(`token:pairs:${pair.token0.toLowerCase()}`, pair.address.toLowerCase());
      await this.redis.sAdd(`token:pairs:${pair.token1.toLowerCase()}`, pair.address.toLowerCase());
    } catch (error) {
      this.logger.error('Error caching pair data:', error);
    }
  }

  private async updateCachedLiquidity(event: LiquidityEvent): Promise<void> {
    try {
      const key = `liquidity:${event.pair.toLowerCase()}`;
      
      // Add new event
      await this.redis.lPush(key, JSON.stringify(event));
      await this.redis.lTrim(key, 0, 99);
      await this.redis.expire(key, 3600);
    } catch (error) {
      this.logger.error('Error updating cached liquidity:', error);
    }
  }

  private async publishPairEvent(eventType: string, pair: Pair): Promise<void> {
    try {
      await this.redis.publish('pair-events', JSON.stringify({
        event: eventType,
        data: pair,
        timestamp: Date.now(),
      }));
    } catch (error) {
      this.logger.error('Error publishing pair event:', error);
    }
  }

  private async publishLiquidityEvent(event: LiquidityEvent): Promise<void> {
    try {
      await this.redis.publish('liquidity-events', JSON.stringify({
        event: `LIQUIDITY_${event.type}`,
        data: event,
        timestamp: Date.now(),
      }));
    } catch (error) {
      this.logger.error('Error publishing liquidity event:', error);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}