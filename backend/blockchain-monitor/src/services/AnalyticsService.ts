import { ethers } from 'ethers';
import winston from 'winston';
import { TokenAnalytics } from '../types';
import { DatabaseService } from './DatabaseService';

export class AnalyticsService {
  private provider: ethers.JsonRpcProvider;
  private db: DatabaseService;
  private logger: winston.Logger;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute

  constructor(provider: ethers.JsonRpcProvider, db: DatabaseService) {
    this.provider = provider;
    this.db = db;
    
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
          filename: 'analytics.log' 
        }),
      ],
    });
  }

  async analyzeToken(tokenAddress: string): Promise<TokenAnalytics> {
    try {
      const address = tokenAddress.toLowerCase();
      
      // Get basic token info
      const tokenContract = new ethers.Contract(
        address,
        [
          'function totalSupply() view returns (uint256)',
          'function balanceOf(address) view returns (uint256)',
          'function owner() view returns (address)',
          'function decimals() view returns (uint8)',
        ],
        this.provider
      );

      const [totalSupply, decimals] = await Promise.all([
        tokenContract.totalSupply().catch(() => ethers.toBigInt(0)),
        tokenContract.decimals().catch(() => 18),
      ]);

      // Check for honeypot characteristics
      const isHoneypot = await this.checkHoneypot(address);
      
      // Calculate rug score
      const rugScore = await this.calculateRugScore(address);
      
      // Get ownership concentration
      const ownershipConcentration = await this.calculateOwnershipConcentration(address, totalSupply);
      
      // Get liquidity info
      const liquidityInfo = await this.getLiquidityInfo(address);
      
      // Get trading restrictions
      const restrictions = await this.getTradingRestrictions(address);
      
      // Get price and market data
      const priceData = await this.getPriceData(address);
      
      // Check if ownership is renounced
      const isRenounced = await this.checkOwnershipRenounced(address);
      
      // Check liquidity lock
      const liquidityLockInfo = await this.checkLiquidityLock(address);

      const analytics: TokenAnalytics = {
        address,
        rugScore,
        isHoneypot,
        ownershipConcentration,
        liquidityUSD: liquidityInfo.liquidityUSD,
        volume24h: priceData.volume24h,
        holders: await this.getHolderCount(address),
        transactions24h: await this.getTransactionCount24h(address),
        priceUSD: priceData.price,
        priceChange24h: priceData.priceChange24h,
        marketCapUSD: priceData.price * Number(ethers.formatUnits(totalSupply, decimals)),
        circulatingSupply: totalSupply.toString(),
        maxWalletPercent: restrictions.maxWalletPercent,
        maxTransactionPercent: restrictions.maxTransactionPercent,
        buyTax: restrictions.buyTax,
        sellTax: restrictions.sellTax,
        isRenounced,
        liquidityLocked: liquidityLockInfo.isLocked,
        liquidityLockExpiry: liquidityLockInfo.expiryTime,
      };

      return analytics;
    } catch (error) {
      this.logger.error(`Error analyzing token ${tokenAddress}:`, error);
      throw error;
    }
  }

  private async checkHoneypot(tokenAddress: string): Promise<boolean> {
    try {
      // Check for common honeypot patterns
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function approve(address spender, uint256 amount) returns (bool)',
          'function transferFrom(address from, address to, uint256 amount) returns (bool)',
        ],
        this.provider
      );

      // Try to simulate a transfer
      const testAddress = '0x0000000000000000000000000000000000000001';
      
      try {
        // Check if transfers can be disabled
        const canTransfer = await tokenContract.transfer.staticCall(
          testAddress,
          ethers.parseEther('0.0001')
        );
        
        if (!canTransfer) {
          return true; // Likely honeypot if transfers fail
        }
      } catch (error: any) {
        // If the call reverts with specific messages, it might be a honeypot
        if (error.message?.includes('transfer')) {
          return true;
        }
      }

      // Check for hidden fees or taxes > 50%
      const restrictions = await this.getTradingRestrictions(tokenAddress);
      if (restrictions.buyTax > 50 || restrictions.sellTax > 50) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking honeypot for ${tokenAddress}:`, error);
      return false;
    }
  }

  private async calculateRugScore(tokenAddress: string): Promise<number> {
    let score = 0;
    
    try {
      // Check contract verification (-20 points if verified)
      const code = await this.provider.getCode(tokenAddress);
      if (code && code !== '0x') {
        // Has contract code, check if verified
        // This would normally check with Core Scan API
        score += 20; // Assume unverified for now
      }

      // Check ownership (+30 points if not renounced)
      const isRenounced = await this.checkOwnershipRenounced(tokenAddress);
      if (!isRenounced) {
        score += 30;
      }

      // Check liquidity lock (-20 points if locked)
      const lockInfo = await this.checkLiquidityLock(tokenAddress);
      if (!lockInfo.isLocked) {
        score += 20;
      }

      // Check holder distribution
      const concentration = await this.calculateOwnershipConcentration(tokenAddress, ethers.toBigInt(0));
      if (concentration > 50) {
        score += 30; // High concentration is risky
      } else if (concentration > 30) {
        score += 15;
      }

      // Check for high taxes
      const restrictions = await this.getTradingRestrictions(tokenAddress);
      if (restrictions.buyTax > 10 || restrictions.sellTax > 10) {
        score += 20;
      }

      // Cap score at 100
      return Math.min(score, 100);
    } catch (error) {
      this.logger.error(`Error calculating rug score for ${tokenAddress}:`, error);
      return 50; // Default medium risk
    }
  }

  private async calculateOwnershipConcentration(
    tokenAddress: string,
    totalSupply: bigint
  ): Promise<number> {
    try {
      // Get top holders
      // This would normally query the blockchain for Transfer events
      // For now, return a default value
      return 15; // 15% concentration
    } catch (error) {
      this.logger.error(`Error calculating ownership concentration:`, error);
      return 0;
    }
  }

  private async getLiquidityInfo(tokenAddress: string): Promise<{
    liquidityUSD: number;
    pairs: string[];
  }> {
    try {
      let totalLiquidityUSD = 0;
      const pairs: string[] = [];
      
      // IcecreamSwap V2 Factory contract address for Core chain
      const icecreamFactoryAddress = '0x9E6d21E759A7A288b80eef94E4737D313D31c13f'; // IcecreamSwap V2 Factory
      const factoryContract = new ethers.Contract(
        icecreamFactoryAddress,
        [
          'function getPair(address tokenA, address tokenB) view returns (address)',
          'function allPairsLength() view returns (uint256)'
        ],
        this.provider
      );
      
      // WCORE address on Core chain
      const wcoreAddress = '0x191e94fa59739e188dce837f7f6978d84727ad01'; // WCORE
      
      // Get pair address for token/WCORE
      const pairAddress = await factoryContract.getPair(tokenAddress, wcoreAddress);
      
      if (pairAddress && pairAddress !== ethers.ZeroAddress) {
        const pairContract = new ethers.Contract(
          pairAddress,
          [
            'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
            'function token0() view returns (address)',
            'function token1() view returns (address)',
            'function totalSupply() view returns (uint256)'
          ],
          this.provider
        );
        
        const [reserves, token0, token1] = await Promise.all([
          pairContract.getReserves(),
          pairContract.token0(),
          pairContract.token1()
        ]);
        
        // Determine which reserve is CORE
        const isCoreToken0 = token0.toLowerCase() === wcoreAddress.toLowerCase();
        const coreReserve = isCoreToken0 ? reserves.reserve0 : reserves.reserve1;
        const tokenReserve = isCoreToken0 ? reserves.reserve1 : reserves.reserve0;
        
        if (coreReserve > 0 && tokenReserve > 0) {
          // Get CORE price in USD from CoinGecko
          let corePrice = 0.50; // Default fallback price
          try {
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd');
            const data = await response.json();
            corePrice = data.coredaoorg?.usd || 0.50;
          } catch (error) {
            this.logger.warn('Failed to fetch CORE price from CoinGecko:', error);
          }
          
          // Calculate liquidity in USD (CORE reserve * 2 * CORE price)
          const coreReserveFormatted = parseFloat(ethers.formatEther(coreReserve));
          const liquidityUSD = coreReserveFormatted * 2 * corePrice;
          
          totalLiquidityUSD += liquidityUSD;
          pairs.push(pairAddress);
          
          this.logger.debug(`Found liquidity for ${tokenAddress}: $${liquidityUSD.toFixed(2)} on IcecreamSwap`);
        }
      }
      
      // Also check for pairs with USDT if available
      const usdtAddress = '0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1'; // USDT on Core (if available)
      try {
        const usdtPairAddress = await factoryContract.getPair(tokenAddress, usdtAddress);
        
        if (usdtPairAddress && usdtPairAddress !== ethers.ZeroAddress && !pairs.includes(usdtPairAddress)) {
          const pairContract = new ethers.Contract(
            usdtPairAddress,
            [
              'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
              'function token0() view returns (address)',
              'function token1() view returns (address)'
            ],
            this.provider
          );
          
          const [reserves, token0] = await Promise.all([
            pairContract.getReserves(),
            pairContract.token0()
          ]);
          
          const isUsdtToken0 = token0.toLowerCase() === usdtAddress.toLowerCase();
          const usdtReserve = isUsdtToken0 ? reserves.reserve0 : reserves.reserve1;
          
          if (usdtReserve > 0) {
            // Assuming USDT has 6 decimals
            const usdtReserveFormatted = parseFloat(ethers.formatUnits(usdtReserve, 6));
            const liquidityUSD = usdtReserveFormatted * 2; // USDT ≈ $1
            
            totalLiquidityUSD += liquidityUSD;
            pairs.push(usdtPairAddress);
            
            this.logger.debug(`Found additional USDT liquidity for ${tokenAddress}: $${liquidityUSD.toFixed(2)}`);
          }
        }
      } catch (error) {
        // USDT pair may not exist, which is fine
        this.logger.debug(`No USDT pair found for ${tokenAddress}`);
      }
      
      return {
        liquidityUSD: totalLiquidityUSD,
        pairs,
      };
    } catch (error) {
      this.logger.error(`Error getting liquidity info for ${tokenAddress}:`, error);
      return { liquidityUSD: 0, pairs: [] };
    }
  }

  private async getTradingRestrictions(tokenAddress: string): Promise<{
    maxWalletPercent: number;
    maxTransactionPercent: number;
    buyTax: number;
    sellTax: number;
  }> {
    try {
      // Try to read common restriction functions
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function maxWallet() view returns (uint256)',
          'function maxTransaction() view returns (uint256)',
          'function buyTax() view returns (uint256)',
          'function sellTax() view returns (uint256)',
          'function totalSupply() view returns (uint256)',
        ],
        this.provider
      );

      const [maxWallet, maxTransaction, buyTax, sellTax, totalSupply] = await Promise.allSettled([
        tokenContract.maxWallet(),
        tokenContract.maxTransaction(),
        tokenContract.buyTax(),
        tokenContract.sellTax(),
        tokenContract.totalSupply(),
      ]);

      const total = totalSupply.status === 'fulfilled' ? totalSupply.value : ethers.toBigInt(1);
      
      return {
        maxWalletPercent: maxWallet.status === 'fulfilled' 
          ? Number((maxWallet.value * ethers.toBigInt(100)) / total) 
          : 100,
        maxTransactionPercent: maxTransaction.status === 'fulfilled'
          ? Number((maxTransaction.value * ethers.toBigInt(100)) / total)
          : 100,
        buyTax: buyTax.status === 'fulfilled' ? Number(buyTax.value) : 0,
        sellTax: sellTax.status === 'fulfilled' ? Number(sellTax.value) : 0,
      };
    } catch (error) {
      return {
        maxWalletPercent: 100,
        maxTransactionPercent: 100,
        buyTax: 0,
        sellTax: 0,
      };
    }
  }

  private async getPriceData(tokenAddress: string): Promise<{
    price: number;
    volume24h: number;
    priceChange24h: number;
  }> {
    try {
      // Check cache first
      const cached = this.priceCache.get(tokenAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return {
          price: cached.price,
          volume24h: 0,
          priceChange24h: 0,
        };
      }

      // This would normally query DEX prices
      // For now, return default values
      const price = 0;
      
      // Update cache
      this.priceCache.set(tokenAddress, {
        price,
        timestamp: Date.now(),
      });

      return {
        price,
        volume24h: 0,
        priceChange24h: 0,
      };
    } catch (error) {
      this.logger.error(`Error getting price data:`, error);
      return { price: 0, volume24h: 0, priceChange24h: 0 };
    }
  }

  private async checkOwnershipRenounced(tokenAddress: string): Promise<boolean> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function owner() view returns (address)'],
        this.provider
      );

      const owner = await tokenContract.owner().catch(() => null);
      
      // Check if owner is zero address (renounced)
      return owner === ethers.ZeroAddress;
    } catch (error) {
      return false;
    }
  }

  private async checkLiquidityLock(tokenAddress: string): Promise<{
    isLocked: boolean;
    expiryTime?: number;
  }> {
    try {
      // This would check popular lock contracts
      // For now, return not locked
      return { isLocked: false };
    } catch (error) {
      return { isLocked: false };
    }
  }

  private async getHolderCount(tokenAddress: string): Promise<number> {
    try {
      // This would query Transfer events to count unique holders
      // For now, return default
      return 0;
    } catch (error) {
      return 0;
    }
  }

  private async getTransactionCount24h(tokenAddress: string): Promise<number> {
    try {
      // Query recent trades from database
      const trades = await this.db.getRecentTrades(tokenAddress, 1000);
      const oneDayAgo = Date.now() - 86400000;
      
      return trades.filter(t => t.timestamp > oneDayAgo).length;
    } catch (error) {
      return 0;
    }
  }

  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    try {
      const priceData = await this.getPriceData(tokenAddress);
      return priceData.price;
    } catch (error) {
      this.logger.error(`Error getting token price:`, error);
      return null;
    }
  }

  async getPriceChange24h(tokenAddress: string): Promise<number> {
    try {
      // Get price data and calculate 24h change
      const priceData = await this.getPriceData(tokenAddress);
      return priceData.priceChange24h || 0;
    } catch (error) {
      this.logger.error(`Error getting price change 24h:`, error);
      return 0;
    }
  }

  async getVolume24h(tokenAddress: string): Promise<number> {
    try {
      // Get volume from recent trades
      const trades = await this.db.getRecentTrades(tokenAddress, 1000);
      const oneDayAgo = Date.now() - 86400000;
      
      const dayTrades = trades.filter(t => t.timestamp > oneDayAgo);
      const volume = dayTrades.reduce((sum, trade) => {
        const amount = parseFloat(ethers.formatEther(trade.amountIn || '0'));
        return sum + amount;
      }, 0);
      
      return volume;
    } catch (error) {
      this.logger.error(`Error getting volume 24h:`, error);
      return 0;
    }
  }

  async getTokenMetrics(tokenAddress: string): Promise<any> {
    try {
      const [priceData, volume24h, liquidity] = await Promise.all([
        this.getPriceData(tokenAddress),
        this.getVolume24h(tokenAddress),
        this.getLiquidityInfo(tokenAddress)
      ]);

      return {
        price: priceData.price,
        priceChange24h: priceData.priceChange24h || 0,
        volume24h,
        liquidity: liquidity?.liquidityUSD || 0
      };
    } catch (error) {
      this.logger.error(`Error getting token metrics:`, error);
      return {
        price: 0,
        priceChange24h: 0,
        volume24h: 0,
        liquidity: '0'
      };
    }
  }

  async analyzeTokenSecurity(tokenAddress: string): Promise<any> {
    const analytics = await this.analyzeToken(tokenAddress);
    return {
      score: 100 - analytics.rugScore,
      isHoneypot: analytics.isHoneypot,
      isRenounced: analytics.isRenounced,
      hasLockedLiquidity: analytics.liquidityLocked,
      buyTax: analytics.buyTax,
      sellTax: analytics.sellTax
    };
  }
}