import { ethers } from 'ethers';
import { TokenState, TradingPhase, TradingConfig } from '../types';
import { logger } from '../utils/logger';

const MEMEFACTORY_ABI = [
  'function tokenSales(address) external view returns (uint256 sold, uint256 raised, bool launched, bool isOpen, uint256 launchTimestamp)',
  'function TARGET_SUPPLY() external view returns (uint256)',
  'function INITIAL_PRICE() external view returns (uint256)',
  'function FINAL_PRICE() external view returns (uint256)'
];

const ERC20_ABI = [
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)'
];

const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint256)'
];

export class TokenAnalyzer {
  private provider: ethers.Provider;
  private config: TradingConfig;
  private factoryContract?: ethers.Contract;
  private tokenCache: Map<string, { state: TokenState; timestamp: number }> = new Map();
  private CACHE_TTL = 10000; // 10 seconds

  constructor(provider: ethers.Provider, config: TradingConfig) {
    this.provider = provider;
    this.config = config;
    
    if (config.memeFactoryAddress) {
      this.factoryContract = new ethers.Contract(
        config.memeFactoryAddress,
        MEMEFACTORY_ABI,
        provider
      );
    }
  }

  async analyzeToken(address: string): Promise<TokenState | null> {
    try {
      // Check cache
      const cached = this.tokenCache.get(address.toLowerCase());
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.state;
      }

      // First check if it's our token (from MemeFactory)
      const isOurToken = await this.isOurToken(address);
      
      if (isOurToken && this.factoryContract) {
        return this.analyzeOurToken(address);
      } else {
        return this.analyzeExternalToken(address);
      }
    } catch (error) {
      logger.error('Failed to analyze token', { address, error });
      return null;
    }
  }

  private async isOurToken(address: string): Promise<boolean> {
    if (!this.factoryContract) return false;
    
    try {
      const sale = await this.factoryContract.tokenSales(address);
      // If sold > 0 or raised > 0, it's our token
      return sale.sold > 0n || sale.raised > 0n;
    } catch {
      return false;
    }
  }

  private async analyzeOurToken(address: string): Promise<TokenState> {
    if (!this.factoryContract) {
      throw new Error('Factory contract not configured');
    }

    const sale = await this.factoryContract.tokenSales(address);
    const targetSupply = await this.factoryContract.TARGET_SUPPLY();
    const initialPrice = await this.factoryContract.INITIAL_PRICE();
    const finalPrice = await this.factoryContract.FINAL_PRICE();
    
    // Calculate current price based on bonding curve
    const currentPrice = this.calculateCurrentPrice(
      sale.sold,
      targetSupply,
      initialPrice,
      finalPrice
    );

    // Calculate market cap
    const marketCap = this.calculateMarketCap(
      sale.sold.toString(),
      currentPrice.toString()
    );

    // Determine phase
    const phase = sale.launched ? TradingPhase.DEX : TradingPhase.BONDING_CURVE;
    
    // Get liquidity if launched
    let liquidity = '0';
    if (sale.launched) {
      liquidity = await this.getTokenLiquidity(address);
    }

    const state: TokenState = {
      address,
      phase,
      isOurToken: true,
      isLaunched: sale.launched,
      isOpen: sale.isOpen,
      sold: sale.sold.toString(),
      raised: sale.raised.toString(),
      totalSupply: targetSupply.toString(),
      canSell: phase === TradingPhase.DEX, // Only allow selling after launch
      currentPrice: currentPrice.toString(),
      marketCap: marketCap.toString(),
      liquidity,
      bondingCurveProgress: (Number(sale.sold) / Number(targetSupply)) * 100
    };

    // Cache the result
    this.tokenCache.set(address.toLowerCase(), {
      state,
      timestamp: Date.now()
    });

    return state;
  }

  private async analyzeExternalToken(address: string): Promise<TokenState> {
    // Get token contract
    const token = new ethers.Contract(address, ERC20_ABI, this.provider);
    
    // Get basic token info
    const [totalSupply, decimals] = await Promise.all([
      token.totalSupply(),
      token.decimals()
    ]);

    // Get liquidity from DEX pools
    const liquidity = await this.getTokenLiquidity(address);
    
    // Calculate price from DEX
    const currentPrice = await this.getTokenPrice(address);

    // Calculate market cap
    const marketCap = (BigInt(totalSupply) * BigInt(currentPrice)) / (10n ** BigInt(decimals));

    const state: TokenState = {
      address,
      phase: TradingPhase.DEX,
      isOurToken: false,
      isLaunched: true,
      isOpen: true,
      totalSupply: totalSupply.toString(),
      canSell: true,
      currentPrice: currentPrice.toString(),
      marketCap: marketCap.toString(),
      liquidity
    };

    // Cache the result
    this.tokenCache.set(address.toLowerCase(), {
      state,
      timestamp: Date.now()
    });

    return state;
  }

  private calculateCurrentPrice(
    sold: bigint,
    targetSupply: bigint,
    initialPrice: bigint,
    finalPrice: bigint
  ): bigint {
    if (sold === 0n) return initialPrice;
    if (sold >= targetSupply) return finalPrice;
    
    // Linear bonding curve
    const priceRange = finalPrice - initialPrice;
    const progress = (sold * 10000n) / targetSupply;
    const priceIncrease = (priceRange * progress) / 10000n;
    
    return initialPrice + priceIncrease;
  }

  private calculateMarketCap(sold: string, price: string): string {
    return (BigInt(sold) * BigInt(price)).toString();
  }

  private async getTokenLiquidity(address: string): Promise<string> {
    let totalLiquidity = 0n;
    
    // Check liquidity across all configured DEXes
    for (const dexConfig of Object.values(this.config.dexRouters)) {
      try {
        const factory = new ethers.Contract(
          dexConfig.factory,
          ['function getPair(address, address) view returns (address)'],
          this.provider
        );
        
        const pairAddress = await factory.getPair(address, this.config.wcoreAddress);
        if (pairAddress === ethers.ZeroAddress) continue;
        
        const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
        const [reserve0, reserve1] = await pair.getReserves();
        const token0 = await pair.token0();
        
        const coreReserve = token0.toLowerCase() === this.config.wcoreAddress.toLowerCase() 
          ? reserve0 
          : reserve1;
        
        totalLiquidity += coreReserve;
      } catch (error) {
        logger.debug('Failed to get liquidity from DEX', { dex: dexConfig.address, error });
      }
    }
    
    return totalLiquidity.toString();
  }

  private async getTokenPrice(address: string): Promise<string> {
    // Get price from the first available DEX pool
    for (const dexConfig of Object.values(this.config.dexRouters)) {
      try {
        const factory = new ethers.Contract(
          dexConfig.factory,
          ['function getPair(address, address) view returns (address)'],
          this.provider
        );
        
        const pairAddress = await factory.getPair(address, this.config.wcoreAddress);
        if (pairAddress === ethers.ZeroAddress) continue;
        
        const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
        const [reserve0, reserve1] = await pair.getReserves();
        const token0 = await pair.token0();
        
        const tokenReserve = token0.toLowerCase() === address.toLowerCase() 
          ? reserve0 
          : reserve1;
        const coreReserve = token0.toLowerCase() === address.toLowerCase() 
          ? reserve1 
          : reserve0;
        
        if (tokenReserve > 0n) {
          // Price in CORE per token
          return ((coreReserve * 10n ** 18n) / tokenReserve).toString();
        }
      } catch (error) {
        logger.debug('Failed to get price from DEX', { dex: dexConfig.address, error });
      }
    }
    
    return '0';
  }

  clearCache(): void {
    this.tokenCache.clear();
  }
}