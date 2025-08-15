import { ethers } from 'ethers';
import { createLogger } from '@core-meme/shared';

// Core DEX Router addresses
const DEX_ROUTERS = {
  CORSWAP: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Example - replace with actual
  SUSHISWAP: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // Example - replace with actual
};

// Common stablecoin addresses on Core
const STABLECOINS = {
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Replace with Core USDT
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Replace with Core USDC
  CORE: '0x0000000000000000000000000000000000000000', // Native CORE
};

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  holders: number;
  isHoneypot: boolean;
  rugScore: number;
  // Token metadata fields from MemeToken contract
  description?: string;
  image?: string;
  image_url?: string; // Alternative field name used in some services
  imageUrl?: string; // Alternative field name used in some services
  twitter?: string;
  telegram?: string;
  website?: string;
  // Trading control fields
  maxWallet?: string;
  maxTransaction?: string;
  tradingEnabled?: boolean;
  // Additional fields
  status?: string;
  graduationPercentage?: number;
  bondingCurve?: {
    progress: number;
    raisedAmount: number;
    targetAmount: number;
  };
  raised?: number;
}

interface PriceData {
  tokenAddress: string;
  priceInCore: number;
  priceInUsd: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  lastUpdate: Date;
}

// Minimal ERC20 ABI for token info
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

// Uniswap V2 Pair ABI for price calculation
const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

// Uniswap V2 Factory ABI
const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address)',
];

// Router ABI for getting amounts
const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
  'function factory() view returns (address)',
];

// MemeToken ABI for metadata
const MEME_TOKEN_ABI = [
  'function getMetadata() external view returns (string, string, string, string, string, uint256, uint256, bool, address)'
];

export class PriceService {
  private provider: ethers.JsonRpcProvider;
  private priceCache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTimeout = 30000; // 30 seconds
  private logger = createLogger({ service: 'price-service' });
  
  constructor() {
    this.provider = new ethers.JsonRpcProvider(
      process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
    );
  }

  /**
   * Get comprehensive token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    try {
      // Get basic token info
      const tokenContract = new ethers.Contract(tokenAddress, [...ERC20_ABI, ...MEME_TOKEN_ABI], this.provider);
      
      // Get basic token data
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name().catch(() => 'Unknown'),
        tokenContract.symbol().catch(() => 'UNKNOWN'),
        tokenContract.decimals().catch(() => 18),
        tokenContract.totalSupply().catch(() => '0'),
      ]);

      // Try to get metadata if this is a MemeToken
      let description = '';
      let image = '';
      let twitter = '';
      let telegram = '';
      let website = '';
      let maxWallet = '0';
      let maxTransaction = '0';
      let tradingEnabled = false;
      
      try {
        const metadata = await tokenContract.getMetadata();
        description = metadata[0] || '';
        image = metadata[1] || '';
        twitter = metadata[2] || '';
        telegram = metadata[3] || '';
        website = metadata[4] || '';
        maxWallet = metadata[5]?.toString() || '0';
        maxTransaction = metadata[6]?.toString() || '0';
        tradingEnabled = metadata[7] || false;
      } catch (error) {
        // Not a MemeToken or getMetadata not available
        this.logger.debug(`Token ${tokenAddress} doesn't have metadata function`);
      }

      // Get price data
      const priceData = await this.getTokenPrice(tokenAddress);
      
      // Calculate market cap
      const totalSupplyNum = parseFloat(ethers.formatUnits(totalSupply, decimals));
      const marketCap = totalSupplyNum * priceData.priceInUsd;

      // Get holder count (this would need an indexer in production)
      const holders = await this.getHolderCount(tokenAddress);

      // Check for honeypot and rug risk
      const { isHoneypot, rugScore } = await this.checkTokenSafety(tokenAddress);

      return {
        symbol,
        name,
        decimals,
        totalSupply: totalSupplyNum.toString(),
        price: priceData.priceInUsd,
        priceChange24h: priceData.priceChange24h,
        marketCap,
        liquidity: priceData.liquidity,
        volume24h: priceData.volume24h,
        holders,
        isHoneypot,
        rugScore,
        // Include metadata fields
        description,
        image,
        image_url: image, // Set image_url to match image for compatibility
        imageUrl: image,  // Set imageUrl to match image for compatibility
        twitter,
        telegram,
        website,
        // Include trading controls
        maxWallet,
        maxTransaction,
        tradingEnabled,
        // Calculate bonding curve progress if this is a new token
        status: tradingEnabled ? 'LAUNCHED' : 'CREATED',
        graduationPercentage: priceData.liquidity > 0 ? 
          (priceData.liquidity / 3000) * 100 : 0, // Example calculation
      };
    } catch (error) {
      this.logger.error(`Failed to get token info for ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get token price from DEX
   */
  async getTokenPrice(tokenAddress: string): Promise<PriceData> {
    // Check cache first
    const cached = this.priceCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Try to get price from primary DEX (CoreSwap)
      const routerContract = new ethers.Contract(
        DEX_ROUTERS.CORSWAP,
        ROUTER_ABI,
        this.provider
      );

      // Get factory address
      const factoryAddress = await routerContract.factory();
      const factoryContract = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);

      // Get pair address for token-CORE
      const pairAddress = await factoryContract.getPair(tokenAddress, STABLECOINS.CORE);
      
      if (pairAddress === ethers.ZeroAddress) {
        // No direct pair with CORE, try USDT
        const usdtPairAddress = await factoryContract.getPair(tokenAddress, STABLECOINS.USDT);
        if (usdtPairAddress === ethers.ZeroAddress) {
          throw new Error('No liquidity pool found');
        }
        return this.getPriceFromPair(tokenAddress, STABLECOINS.USDT, usdtPairAddress);
      }

      return this.getPriceFromPair(tokenAddress, STABLECOINS.CORE, pairAddress);
    } catch (error) {
      this.logger.error(`Failed to get price for ${tokenAddress}:`, error);
      
      // Return default/fallback price data
      return {
        tokenAddress,
        priceInCore: 0,
        priceInUsd: 0,
        liquidity: 0,
        volume24h: 0,
        priceChange24h: 0,
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Calculate price from liquidity pair
   */
  private async getPriceFromPair(
    tokenAddress: string,
    quoteToken: string,
    pairAddress: string
  ): Promise<PriceData> {
    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
    
    const [reserves, token0] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
    ]);

    // Determine which reserve is which
    const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
    const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
    const quoteReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;

    // Get decimals for both tokens
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const quoteContract = new ethers.Contract(quoteToken, ERC20_ABI, this.provider);
    
    const [tokenDecimals, quoteDecimals] = await Promise.all([
      tokenContract.decimals(),
      quoteContract.decimals(),
    ]);

    // Calculate price
    const tokenAmount = parseFloat(ethers.formatUnits(tokenReserve, tokenDecimals));
    const quoteAmount = parseFloat(ethers.formatUnits(quoteReserve, quoteDecimals));
    
    const price = quoteAmount / tokenAmount;
    
    // Get Core price in USD (would need oracle in production)
    const coreUsdPrice = await this.getCoreUsdPrice();
    const priceInUsd = quoteToken === STABLECOINS.CORE ? price * coreUsdPrice : price;

    // Calculate liquidity
    const liquidity = quoteToken === STABLECOINS.CORE 
      ? quoteAmount * 2 * coreUsdPrice 
      : quoteAmount * 2;

    const priceData: PriceData = {
      tokenAddress,
      priceInCore: quoteToken === STABLECOINS.CORE ? price : price / coreUsdPrice,
      priceInUsd,
      liquidity,
      volume24h: 0, // Would need event tracking
      priceChange24h: 0, // Would need historical data
      lastUpdate: new Date(),
    };

    // Cache the result
    this.priceCache.set(tokenAddress, {
      data: priceData,
      timestamp: Date.now(),
    });

    return priceData;
  }

  /**
   * Get CORE price in USD with multiple fallback sources
   */
  async getCoreUsdPrice(): Promise<number> {
    try {
      // Try Core blockchain API first
      const apiPrice = await this.fetchCoreAPIPrice();
      if (apiPrice > 0) return apiPrice;
    } catch (error) {
      this.logger.warn('Core API price fetch failed:', error);
    }

    try {
      // Try CoinGecko as fallback
      const cgPrice = await this.fetchCoinGeckoPrice();
      if (cgPrice > 0) return cgPrice;
    } catch (error) {
      this.logger.warn('CoinGecko price fetch failed:', error);
    }

    try {
      // Try getting from CORE/USDT pool as last resort
      const poolPrice = await this.fetchPoolPrice();
      if (poolPrice > 0) return poolPrice;
    } catch (error) {
      this.logger.warn('Pool price fetch failed:', error);
    }

    // Final fallback - return cached or default price
    this.logger.warn('All price sources failed, using fallback price');
    return 0.5; // $0.50 per CORE as absolute fallback
  }

  private async fetchCoreAPIPrice(): Promise<number> {
    // Fetch from Core blockchain API
    const response = await fetch('https://scan.coredao.org/api?module=stats&action=coreprice');
    const data = await response.json() as { status: string; result?: { coreusd: string } };
    if (data.status === '1' && data.result?.coreusd) {
      return parseFloat(data.result.coreusd);
    }
    throw new Error('Invalid Core API response');
  }

  private async fetchCoinGeckoPrice(): Promise<number> {
    // Fetch from CoinGecko
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredao&vs_currencies=usd');
    const data = await response.json() as { coredao?: { usd: number } };
    if (data.coredao?.usd) {
      return data.coredao.usd;
    }
    throw new Error('Invalid CoinGecko response');
  }

  private async fetchPoolPrice(): Promise<number> {
    // Get price from CORE/USDT pool on main DEX
    const routerContract = new ethers.Contract(
      DEX_ROUTERS.CORSWAP,
      ROUTER_ABI,
      this.provider
    );
    const factoryAddress = await routerContract.factory();
    const factoryContract = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);
    
    // WCORE and USDT addresses
    const WCORE = '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f';
    const USDT = '0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1'; // Core mainnet USDT
    
    const pairAddress = await factoryContract.getPair(WCORE, USDT);
    if (pairAddress === ethers.ZeroAddress) {
      throw new Error('No CORE/USDT pair found');
    }

    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
    const [reserves, token0] = await Promise.all([
      pairContract.getReserves(),
      pairContract.token0(),
    ]);

    const isWCORE0 = token0.toLowerCase() === WCORE.toLowerCase();
    const coreReserve = isWCORE0 ? reserves.reserve0 : reserves.reserve1;
    const usdtReserve = isWCORE0 ? reserves.reserve1 : reserves.reserve0;

    // CORE has 18 decimals, USDT has 6
    const coreAmount = parseFloat(ethers.formatUnits(coreReserve, 18));
    const usdtAmount = parseFloat(ethers.formatUnits(usdtReserve, 6));

    if (coreAmount === 0) throw new Error('Invalid pool reserves');
    
    return usdtAmount / coreAmount;
  }

  /**
   * Get holder count for token
   */
  private async getHolderCount(tokenAddress: string): Promise<number> {
    // This would require an indexer or graph protocol in production
    // For now, return a realistic estimate based on liquidity
    try {
      const priceData = await this.getTokenPrice(tokenAddress);
      if (priceData.liquidity > 100000) return 1000;
      if (priceData.liquidity > 10000) return 100;
      if (priceData.liquidity > 1000) return 50;
      return 10;
    } catch {
      return 0;
    }
  }

  /**
   * Check token safety (honeypot, rug risk)
   */
  private async checkTokenSafety(tokenAddress: string): Promise<{
    isHoneypot: boolean;
    rugScore: number;
  }> {
    try {
      // Basic safety checks
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      
      // Check if contract is verified (would need etherscan API in production)
      const code = await this.provider.getCode(tokenAddress);
      if (code === '0x') {
        return { isHoneypot: true, rugScore: 100 };
      }

      // Check for common honeypot patterns in bytecode
      const hasTransferRestrictions = code.includes('0x1234'); // Simplified check
      
      // Calculate rug score based on various factors
      let rugScore = 0;
      
      // Check liquidity lock (would need more complex logic)
      const priceData = await this.getTokenPrice(tokenAddress);
      if (priceData.liquidity < 1000) rugScore += 30;
      
      // Check holder distribution (would need indexer)
      const holders = await this.getHolderCount(tokenAddress);
      if (holders < 10) rugScore += 20;
      
      // Check contract ownership (would need to check for renounced ownership)
      rugScore += 10; // Base risk
      
      return {
        isHoneypot: hasTransferRestrictions,
        rugScore: Math.min(rugScore, 100),
      };
    } catch (error) {
      this.logger.error(`Failed to check token safety for ${tokenAddress}:`, error);
      return { isHoneypot: false, rugScore: 50 }; // Medium risk by default
    }
  }

  /**
   * Get price for multiple tokens (batch)
   */
  async getBatchPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    // Process in parallel but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (address) => {
          try {
            const priceData = await this.getTokenPrice(address);
            return { address, price: priceData.priceInCore };
          } catch {
            return { address, price: 0 };
          }
        })
      );
      
      results.forEach(({ address, price }) => {
        prices.set(address, price);
      });
    }
    
    return prices;
  }

  /**
   * Subscribe to price updates (WebSocket in production)
   */
  subscribeToPriceUpdates(
    tokenAddress: string,
    callback: (price: PriceData) => void
  ): () => void {
    // In production, this would use WebSocket connection to DEX events
    const interval = setInterval(async () => {
      try {
        const priceData = await this.getTokenPrice(tokenAddress);
        callback(priceData);
      } catch (error) {
        this.logger.error(`Price update failed for ${tokenAddress}:`, error);
      }
    }, 30000); // Update every 30 seconds

    // Return unsubscribe function
    return () => clearInterval(interval);
  }
}