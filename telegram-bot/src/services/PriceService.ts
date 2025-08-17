import { ethers } from 'ethers';
import { createLogger } from '@core-meme/shared';
import { NETWORK_CONFIG, CONTRACT_ADDRESSES } from '../config/constants';

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
  image_url?: string;
  imageUrl?: string;
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
  sold?: number;
  isGraduated?: boolean;
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

// MemeFactory ABI aligned with deployed contract
const MEME_FACTORY_ABI = [
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) public pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) public pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
  'function tokenToSale(address) external view returns (address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt)'
];

// MemeToken ABI for metadata and trading info
const MEME_TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function getMetadata() view returns (string description, string imageUrl, string twitter, string telegram, string website, uint256 maxWallet, uint256 maxTransaction, bool tradingEnabled, address creator)',
  'function tradingEnabled() view returns (bool)',
  'function maxWallet() view returns (uint256)',
  'function maxTransaction() view returns (uint256)',
  'function creator() view returns (address)',
];

// Simple Oracle for CORE/USD price (can be replaced with real oracle)
const CORE_USD_PRICE_ABI = [
  'function latestAnswer() view returns (int256)',
  'function decimals() view returns (uint8)',
];

export class PriceService {
  private provider: ethers.JsonRpcProvider;
  private memeFactory: ethers.Contract;
  private priceCache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private tokenInfoCache: Map<string, { data: TokenInfo; timestamp: number }> = new Map();
  private cacheTimeout = 30000; // 30 seconds
  private logger = createLogger({ service: 'price-service' });
  private coreUsdPrice: number = 1.0; // Default fallback

  constructor(rpcUrl?: string) {
    const url = rpcUrl || NETWORK_CONFIG.RPC_URL;
    this.provider = new ethers.JsonRpcProvider(url);
    this.memeFactory = new ethers.Contract(CONTRACT_ADDRESSES.MEME_FACTORY, MEME_FACTORY_ABI, this.provider);
    
    // Initialize CORE/USD price fetching
    this.initializeCoreUsdPrice();
  }

  private async initializeCoreUsdPrice() {
    try {
      // Try to get CORE/USD price from an oracle or external source
      // For now, use a fixed price or fetch from an API
      this.coreUsdPrice = await this.fetchCoreUsdPrice();
      
      // Update price every 5 minutes
      setInterval(async () => {
        try {
          this.coreUsdPrice = await this.fetchCoreUsdPrice();
      } catch (error) {
          this.logger.error('Failed to update CORE/USD price:', error);
        }
      }, 5 * 60 * 1000);
    } catch (error) {
      this.logger.error('Failed to initialize CORE/USD price:', error);
    }
  }

  private async fetchCoreUsdPrice(): Promise<number> {
    try {
      // Use CoinGecko API to get real-time CORE price
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd', {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CoreMemeplatform/1.0'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data: any = await response.json();
      const price = data.coredaoorg?.usd;

      if (typeof price === 'number' && price > 0) {
        this.logger.info('Successfully fetched CORE price from CoinGecko', { price });
        return price;
      } else {
        throw new Error('Invalid price data from CoinGecko');
      }
    } catch (error) {
      this.logger.warn('Failed to fetch CORE price from CoinGecko, using fallback', { error });
      return 0.50; // Fallback price - more realistic than $2.80
    }
  }

  async getCoreUsdPrice(): Promise<number> {
    return this.coreUsdPrice;
  }

  async getTokenPrice(tokenAddress: string): Promise<PriceData> {
    // Check cache first
    const cached = this.priceCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Get token info from MemeFactory (try tokenToSale first, then getTokenInfo)
      let saleInfo: any = await this.memeFactory.tokenToSale(tokenAddress).catch(() => null);
      if (!saleInfo || saleInfo.token === ethers.ZeroAddress) {
        const info = await this.memeFactory.getTokenInfo(tokenAddress);
        if (!info || info.token === ethers.ZeroAddress) {
          throw new Error('Token not found in MemeFactory');
        }
        saleInfo = info;
      }

      const currentSold = BigInt(saleInfo.sold || 0);
      const raised = BigInt(saleInfo.raised || 0);
      
      // Calculate price from bonding curve using correct formula
      let priceInCore = 0;
      
      if (!saleInfo.isLaunched) {
        // Use on-chain formula for precise unit handling: ETH needed for 1 token
        const oneTokenWei = ethers.parseEther('1');
        const ethOutForOne = await this.memeFactory.calculateETHOut(currentSold, oneTokenWei);
        priceInCore = parseFloat(ethers.formatEther(ethOutForOne));
      } else {
        // Graduated tokens: cap at last bonding curve step price
        const oneTokenWei = ethers.parseEther('1');
        const MAX_TOKENS = ethers.parseEther('500000');
        const ethOutForOne = await this.memeFactory.calculateETHOut(MAX_TOKENS, oneTokenWei).catch(() => ethers.parseEther('0.0051'));
        priceInCore = parseFloat(ethers.formatEther(ethOutForOne));
      }

      const priceData: PriceData = {
        tokenAddress,
        priceInCore,
        priceInUsd: priceInCore * this.coreUsdPrice,
        liquidity: parseFloat(ethers.formatEther(raised)),
        volume24h: 0, // Would need event tracking to calculate
        priceChange24h: 0, // Would need historical data
        lastUpdate: new Date(),
      };

    // Cache the result
    this.priceCache.set(tokenAddress, {
      data: priceData,
      timestamp: Date.now(),
    });

    return priceData;
    } catch (error) {
      this.logger.error(`Failed to get price for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    // Check cache first
    const cached = this.tokenInfoCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Get basic info from MemeFactory (try tokenToSale then fallback)
      let factoryInfo: any = await this.memeFactory.tokenToSale(tokenAddress).catch(() => null);
      if (!factoryInfo || factoryInfo.token === ethers.ZeroAddress) {
        factoryInfo = await this.memeFactory.getTokenInfo(tokenAddress);
        if (!factoryInfo || factoryInfo.token === ethers.ZeroAddress) {
          throw new Error('Token not found in MemeFactory');
        }
      }

      // Get metadata from token contract
      const tokenContract = new ethers.Contract(tokenAddress, MEME_TOKEN_ABI, this.provider);
      
      let metadata: any = {};
      try {
        const metadataResult = await tokenContract.getMetadata();
        metadata = {
          description: metadataResult[0],
          imageUrl: metadataResult[1],
          twitter: metadataResult[2],
          telegram: metadataResult[3],
          website: metadataResult[4],
          maxWallet: metadataResult[5].toString(),
          maxTransaction: metadataResult[6].toString(),
          tradingEnabled: metadataResult[7],
          creator: metadataResult[8],
        };
      } catch (error) {
        this.logger.warn(`Failed to get metadata for ${tokenAddress}:`, error);
      }

      // Get basic token info
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply(),
      ]);

      // Get price data
      const priceData = await this.getTokenPrice(tokenAddress);

      // Calculate graduation progress
      // Graduation progress derived from raised (target assumed 3 CORE on testnet)
      const targetCore = 3; // align with dashboard assumption
      const graduationPercentage = (parseFloat(ethers.formatEther(factoryInfo.raised)) / targetCore) * 100;

      // Estimate holder count (would need indexer for real data)
      const holders = await this.estimateHolderCount(factoryInfo);

      // Calculate market cap
      const marketCap = priceData.priceInUsd * parseFloat(ethers.formatUnits(totalSupply, decimals));

      // Safety scores (simplified - would need more sophisticated checks in production)
      const { isHoneypot, rugScore } = await this.checkTokenSafety(tokenAddress, metadata, factoryInfo);

      const tokenInfo: TokenInfo = {
        symbol,
        name,
        decimals,
        totalSupply: totalSupply.toString(),
        price: priceData.priceInUsd,
        priceChange24h: priceData.priceChange24h,
        marketCap,
        liquidity: priceData.liquidity,
        volume24h: priceData.volume24h,
        holders,
        isHoneypot,
        rugScore,
        description: metadata.description || factoryInfo.description,
        image_url: metadata.imageUrl || factoryInfo.imageUrl,
        imageUrl: metadata.imageUrl || factoryInfo.imageUrl,
        twitter: metadata.twitter,
        telegram: metadata.telegram,
        website: metadata.website,
        maxWallet: metadata.maxWallet,
        maxTransaction: metadata.maxTransaction,
        tradingEnabled: metadata.tradingEnabled ?? true,
        status: factoryInfo.isLaunched ? 'GRADUATED' : 'BONDING',
        graduationPercentage,
        bondingCurve: {
          progress: graduationPercentage,
          raisedAmount: parseFloat(ethers.formatEther(factoryInfo.raised)),
          targetAmount: targetCore,
        },
        raised: parseFloat(ethers.formatEther(factoryInfo.raised)),
        sold: parseFloat(ethers.formatEther(factoryInfo.sold)),
        isGraduated: factoryInfo.isLaunched,
      };

      // Cache the result
      this.tokenInfoCache.set(tokenAddress, {
        data: tokenInfo,
        timestamp: Date.now(),
      });

      return tokenInfo;
    } catch (error) {
      this.logger.error(`Failed to get token info for ${tokenAddress}:`, error);
      throw error;
    }
  }

  private async estimateHolderCount(factoryInfo: any): Promise<number> {
    // Estimate based on raised amount and sold tokens
    // This is a rough estimate - real implementation would need an indexer
    const raised = parseFloat(ethers.formatEther(factoryInfo.raised));
    const sold = parseFloat(ethers.formatEther(factoryInfo.sold));
    
    if (raised === 0 || sold === 0) return 0;
    
    // Rough estimate: assume average buy is 0.1 CORE
    const estimatedTrades = raised / 0.1;
    // Assume 70% unique holders (some people buy multiple times)
    const estimatedHolders = Math.floor(estimatedTrades * 0.7);
    
    return Math.max(1, estimatedHolders);
  }

  private async checkTokenSafety(
    tokenAddress: string,
    metadata: any,
    factoryInfo: any
  ): Promise<{ isHoneypot: boolean; rugScore: number }> {
    let rugScore = 0;
    let isHoneypot = false;

    try {
      // Check 1: Trading enabled
      if (metadata.tradingEnabled === false) {
        isHoneypot = true;
        rugScore += 50;
      }

      // Check 2: Max wallet/transaction limits
      if (metadata.maxWallet && BigInt(metadata.maxWallet) < ethers.parseEther('0.01')) {
        rugScore += 30; // Very restrictive wallet limit
      }

      // Check 3: Creator still holds majority
      const tokenContract = new ethers.Contract(tokenAddress, MEME_TOKEN_ABI, this.provider);
      const creatorBalance = await tokenContract.balanceOf(factoryInfo.creator);
      const totalSupply = await tokenContract.totalSupply();
      
      const creatorPercentage = (parseFloat(ethers.formatEther(creatorBalance)) / parseFloat(ethers.formatEther(totalSupply))) * 100;
      
      if (creatorPercentage > 50) {
        rugScore += 40; // Creator holds too much
      } else if (creatorPercentage > 30) {
        rugScore += 20;
      }

      // Check 4: No metadata provided
      if (!metadata.description && !metadata.imageUrl) {
        rugScore += 10; // Low effort token
      }

      // Check 5: Contract verified (would need etherscan API)
      // For now, skip this check
      
      return {
        isHoneypot,
        rugScore: Math.min(100, rugScore),
      };
    } catch (error) {
      this.logger.error(`Failed to check token safety for ${tokenAddress}:`, error);
      // Return neutral scores on error
      return { isHoneypot: false, rugScore: 50 };
    }
  }

  async getMultipleTokenPrices(tokenAddresses: string[]): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();
    
    // Process in parallel but with a limit to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const prices = await Promise.all(
        batch.map(async (address) => {
          try {
            return await this.getTokenPrice(address);
          } catch (error) {
            this.logger.error(`Failed to get price for ${address}:`, error);
            return null;
          }
        })
      );
      
      batch.forEach((address, index) => {
        if (prices[index]) {
          results.set(address, prices[index]);
        }
      });
    }
    
    return results;
  }

  clearCache() {
    this.priceCache.clear();
    this.tokenInfoCache.clear();
  }
}