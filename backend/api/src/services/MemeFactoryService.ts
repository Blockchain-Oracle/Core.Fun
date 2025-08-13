import { ethers } from 'ethers';
import { createLogger } from '@core-meme/shared';
import MemeFactoryABI from '../../../../contracts/artifacts/core/MemeFactory.sol/MemeFactory.json';
import MemeTokenABI from '../../../../contracts/artifacts/core/MemeToken.sol/MemeToken.json';

interface TokenInfo {
  creator: string;
  name: string;
  symbol: string;
  totalSupply: bigint;
  availableSupply: bigint;
  reserveBalance: bigint;
  isLaunched: boolean;
  createdAt: number;
  launchedAt: number;
  creatorBalance: bigint;
}

interface TokenData {
  address: string;
  creator: string;
  name: string;
  symbol: string;
  totalSupply: string;
  availableSupply: string;
  reserveBalance: string;
  currentPrice: string;
  marketCap: string;
  isLaunched: boolean;
  createdAt: number;
  launchedAt: number;
  volume24h?: string;
  holders?: number;
  transactions24h?: number;
}

export class MemeFactoryService {
  private provider: ethers.JsonRpcProvider;
  private factory: ethers.Contract;
  private logger = createLogger({ service: 'memefactory-service' });
  private factoryAddress: string;
  private tokenCache: Map<string, { data: TokenData; timestamp: number }> = new Map();
  private CACHE_TTL = 30000; // 30 seconds cache

  constructor() {
    const rpcUrl = process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.factoryAddress = process.env.MEME_FACTORY_ADDRESS || '0x04242CfFdEC8F96A46857d4A50458F57eC662cE1';
    
    this.factory = new ethers.Contract(
      this.factoryAddress,
      MemeFactoryABI.abi,
      this.provider
    );

    this.logger.info(`MemeFactory service initialized with contract at ${this.factoryAddress}`);
  }

  /**
   * Get all tokens created by the factory
   */
  async getAllTokens(): Promise<TokenData[]> {
    try {
      const tokenCount = await this.factory.tokenCount();
      const tokens: TokenData[] = [];

      for (let i = 0; i < tokenCount; i++) {
        const tokenAddress = await this.factory.allTokens(i);
        const tokenData = await this.getTokenInfo(tokenAddress);
        if (tokenData) {
          tokens.push(tokenData);
        }
      }

      return tokens.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      this.logger.error('Error fetching all tokens:', error);
      return [];
    }
  }

  /**
   * Get detailed information about a specific token
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenData | null> {
    try {
      // Check cache first
      const cached = this.tokenCache.get(tokenAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }

      // Fetch from contract
      const info: TokenInfo = await this.factory.getTokenInfo(tokenAddress);
      
      // Calculate current price from bonding curve
      const currentPrice = await this.calculateCurrentPrice(tokenAddress);
      
      // Calculate market cap
      const marketCap = this.calculateMarketCap(info.totalSupply, currentPrice);

      // Create token contract instance to get more details
      const tokenContract = new ethers.Contract(
        tokenAddress,
        MemeTokenABI.abi,
        this.provider
      );

      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);

      const tokenData: TokenData = {
        address: tokenAddress,
        creator: info.creator,
        name,
        symbol,
        totalSupply: ethers.formatEther(info.totalSupply),
        availableSupply: ethers.formatEther(info.availableSupply),
        reserveBalance: ethers.formatEther(info.reserveBalance),
        currentPrice: ethers.formatEther(currentPrice),
        marketCap: ethers.formatEther(marketCap),
        isLaunched: info.isLaunched,
        createdAt: Number(info.createdAt),
        launchedAt: Number(info.launchedAt),
      };

      // Cache the result
      this.tokenCache.set(tokenAddress, { data: tokenData, timestamp: Date.now() });

      return tokenData;
    } catch (error) {
      this.logger.error(`Error fetching token info for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Calculate current price from bonding curve
   */
  async calculateCurrentPrice(tokenAddress: string): Promise<bigint> {
    try {
      // Get the current price for buying 1 token
      const oneEther = ethers.parseEther('1');
      const price = await this.factory.calculateBuyReturn(tokenAddress, oneEther);
      return price;
    } catch (error) {
      this.logger.error(`Error calculating price for ${tokenAddress}:`, error);
      return BigInt(0);
    }
  }

  /**
   * Calculate market cap
   */
  private calculateMarketCap(totalSupply: bigint, price: bigint): bigint {
    // MarketCap = totalSupply * price / 1e18 (to adjust for decimals)
    return (totalSupply * price) / ethers.parseEther('1');
  }

  /**
   * Get price history for a token (from events)
   */
  async getTokenPriceHistory(tokenAddress: string, hours: number = 24): Promise<any[]> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const blocksPerHour = 3600 / 3; // Assuming 3 second block time
      const fromBlock = currentBlock - (blocksPerHour * hours);

      // Get TokenPurchased and TokenSold events
      const purchaseFilter = this.factory.filters.TokenPurchased(tokenAddress);
      const soldFilter = this.factory.filters.TokenSold(tokenAddress);

      const [purchases, sales] = await Promise.all([
        this.factory.queryFilter(purchaseFilter, fromBlock, currentBlock),
        this.factory.queryFilter(soldFilter, fromBlock, currentBlock)
      ]);

      // Combine and sort events by block number
      const allEvents = [...purchases, ...sales].sort((a, b) => a.blockNumber - b.blockNumber);

      // Process events to create price history
      const priceHistory = await Promise.all(allEvents.map(async (event) => {
        const block = await this.provider.getBlock(event.blockNumber);
        const args = event.args as any;
        
        return {
          timestamp: block?.timestamp || 0,
          price: ethers.formatEther(args.price || args.cost),
          amount: ethers.formatEther(args.amount),
          type: event.event === 'TokenPurchased' ? 'buy' : 'sell',
          txHash: event.transactionHash
        };
      }));

      return priceHistory;
    } catch (error) {
      this.logger.error(`Error fetching price history for ${tokenAddress}:`, error);
      return [];
    }
  }

  /**
   * Get recent trades for a token
   */
  async getRecentTrades(tokenAddress: string, limit: number = 50): Promise<any[]> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000); // Last ~1000 blocks

      const purchaseFilter = this.factory.filters.TokenPurchased(tokenAddress);
      const soldFilter = this.factory.filters.TokenSold(tokenAddress);

      const [purchases, sales] = await Promise.all([
        this.factory.queryFilter(purchaseFilter, fromBlock, currentBlock),
        this.factory.queryFilter(soldFilter, fromBlock, currentBlock)
      ]);

      const allTrades = [...purchases, ...sales]
        .sort((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, limit);

      return Promise.all(allTrades.map(async (event) => {
        const block = await this.provider.getBlock(event.blockNumber);
        const args = event.args as any;
        
        return {
          type: event.event === 'TokenPurchased' ? 'buy' : 'sell',
          trader: args.buyer || args.seller,
          amount: ethers.formatEther(args.amount),
          cost: ethers.formatEther(args.cost),
          timestamp: block?.timestamp || 0,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber
        };
      }));
    } catch (error) {
      this.logger.error(`Error fetching recent trades for ${tokenAddress}:`, error);
      return [];
    }
  }

  /**
   * Calculate buy return (how many tokens for X CORE)
   */
  async calculateBuyReturn(tokenAddress: string, coreAmount: string): Promise<string> {
    try {
      const amountInWei = ethers.parseEther(coreAmount);
      const tokenAmount = await this.factory.calculateBuyReturn(tokenAddress, amountInWei);
      return ethers.formatEther(tokenAmount);
    } catch (error) {
      this.logger.error('Error calculating buy return:', error);
      throw error;
    }
  }

  /**
   * Calculate sell return (how much CORE for X tokens)
   */
  async calculateSellReturn(tokenAddress: string, tokenAmount: string): Promise<string> {
    try {
      const amountInWei = ethers.parseEther(tokenAmount);
      const coreAmount = await this.factory.calculateSellReturn(tokenAddress, amountInWei);
      return ethers.formatEther(coreAmount);
    } catch (error) {
      this.logger.error('Error calculating sell return:', error);
      throw error;
    }
  }

  /**
   * Build create token transaction
   */
  async buildCreateTokenTx(
    name: string,
    symbol: string,
    description: string,
    imageUrl: string,
    twitter: string,
    telegram: string,
    website: string
  ): Promise<ethers.TransactionRequest> {
    try {
      const creationFee = await this.factory.creationFee();
      
      const tx = await this.factory.createToken.populateTransaction(
        name,
        symbol,
        description,
        imageUrl,
        twitter,
        telegram,
        website,
        { value: creationFee }
      );

      return tx;
    } catch (error) {
      this.logger.error('Error building create token transaction:', error);
      throw error;
    }
  }

  /**
   * Build buy token transaction
   */
  async buildBuyTokenTx(tokenAddress: string, coreAmount: string): Promise<ethers.TransactionRequest> {
    try {
      const amountInWei = ethers.parseEther(coreAmount);
      
      const tx = await this.factory.buyToken.populateTransaction(
        tokenAddress,
        { value: amountInWei }
      );

      return tx;
    } catch (error) {
      this.logger.error('Error building buy token transaction:', error);
      throw error;
    }
  }

  /**
   * Build sell token transaction
   */
  async buildSellTokenTx(tokenAddress: string, tokenAmount: string): Promise<ethers.TransactionRequest> {
    try {
      const amountInWei = ethers.parseEther(tokenAmount);
      
      const tx = await this.factory.sellToken.populateTransaction(
        tokenAddress,
        amountInWei
      );

      return tx;
    } catch (error) {
      this.logger.error('Error building sell token transaction:', error);
      throw error;
    }
  }

  /**
   * Listen to factory events
   */
  setupEventListeners(callbacks: {
    onTokenCreated?: (event: any) => void;
    onTokenPurchased?: (event: any) => void;
    onTokenSold?: (event: any) => void;
    onTokenLaunched?: (event: any) => void;
  }) {
    if (callbacks.onTokenCreated) {
      this.factory.on('TokenCreated', callbacks.onTokenCreated);
    }

    if (callbacks.onTokenPurchased) {
      this.factory.on('TokenPurchased', callbacks.onTokenPurchased);
    }

    if (callbacks.onTokenSold) {
      this.factory.on('TokenSold', callbacks.onTokenSold);
    }

    if (callbacks.onTokenLaunched) {
      this.factory.on('TokenLaunched', callbacks.onTokenLaunched);
    }

    this.logger.info('Event listeners set up for MemeFactory');
  }

  /**
   * Clean up event listeners
   */
  removeAllListeners() {
    this.factory.removeAllListeners();
  }
}

// Export singleton instance
export const memeFactoryService = new MemeFactoryService();