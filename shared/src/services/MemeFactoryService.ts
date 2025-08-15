import { ethers } from 'ethers';
import { createLogger } from '../logger';
import MemeFactoryABI from '../abis/MemeFactory.json';
import MemeTokenABI from '../abis/MemeToken.json';
import EventEmitter from 'events';

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

export interface TokenData {
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
  status?: 'CREATED' | 'LAUNCHED' | 'GRADUATED';
  // Token metadata fields from MemeToken contract
  description?: string;
  image?: string;
  image_url?: string; // For backward compatibility
  imageUrl?: string; // For backward compatibility
  twitter?: string;
  telegram?: string;
  website?: string;
  // Trading control fields
  maxWallet?: string;
  maxTransaction?: string;
  tradingEnabled?: boolean;
  // Additional fields
  graduationPercentage?: number;
  bondingCurve?: {
    progress: number;
    raisedAmount: number;
    targetAmount: number;
  };
  raised?: number;
  stakingBenefits?: any;
}

export class MemeFactoryService extends EventEmitter {
  private provider: ethers.JsonRpcProvider;
  private wsProvider?: ethers.WebSocketProvider;
  private factory: ethers.Contract;
  private logger = createLogger({ service: 'memefactory-service' });
  private factoryAddress: string;
  private tokenCache: Map<string, { data: TokenData; timestamp: number }> = new Map();
  private CACHE_TTL = 30000; // 30 seconds cache
  private lastProcessedBlock: number = 0;
  private pollingInterval?: NodeJS.Timeout;

  constructor() {
    super();
    
    // Initialize HTTP provider
    const rpcUrl = process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.factoryAddress = process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784';
    
    // Try to initialize WebSocket provider if available
    const wsUrl = process.env.CORE_WS_URL;
    if (wsUrl) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(wsUrl);
        this.logger.info('WebSocket provider initialized for MemeFactory');
        
        // Initialize factory contract with WebSocket provider
        this.factory = new ethers.Contract(
          this.factoryAddress,
          MemeFactoryABI,
          this.wsProvider
        );
      } catch (error) {
        this.logger.warn('WebSocket provider initialization failed, falling back to HTTP:', error);
        // Fall back to HTTP provider
        this.factory = new ethers.Contract(
          this.factoryAddress,
          MemeFactoryABI,
          this.provider
        );
      }
    } else {
      // Use HTTP provider if no WebSocket URL provided
      this.factory = new ethers.Contract(
        this.factoryAddress,
        MemeFactoryABI,
        this.provider
      );
    }

    this.logger.info(`MemeFactory service initialized with contract at ${this.factoryAddress}`);
  }

  /**
   * Get all tokens created by the factory
   */
  async getAllTokens(): Promise<TokenData[]> {
    try {
      // Use getAllTokens function from the contract directly
      const tokenAddresses = await this.factory.getAllTokens();
      const tokens: TokenData[] = [];

      for (const tokenAddress of tokenAddresses) {
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
        MemeTokenABI,
        this.provider
      );

      // Get basic token info and metadata
      const [name, symbol, decimals, metadata] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.getMetadata().catch(() => null)
      ]);
      
      // Extract metadata if available
      let description = '';
      let image = '';
      let twitter = '';
      let telegram = '';
      let website = '';
      let maxWallet = '0';
      let maxTransaction = '0';
      let tradingEnabled = false;
      
      if (metadata) {
        description = metadata._description || '';
        image = metadata._image || '';
        twitter = metadata._twitter || '';
        telegram = metadata._telegram || '';
        website = metadata._website || '';
        maxWallet = metadata._maxWallet?.toString() || '0';
        maxTransaction = metadata._maxTransaction?.toString() || '0';
        tradingEnabled = metadata._tradingEnabled || false;
      }

      // Determine token status based on bonding curve progress
      let status: 'CREATED' | 'LAUNCHED' | 'GRADUATED' = 'CREATED';
      if (info.isLaunched) {
        status = 'GRADUATED';
      } else {
        // Check if close to graduation (>= 250 CORE in reserves)
        const reserveInCore = parseFloat(ethers.formatEther(info.reserveBalance));
        if (reserveInCore >= 250) {
          status = 'GRADUATED';
        }
      }

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
        status,
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
        // Calculate bonding curve progress
        graduationPercentage: status === 'CREATED' ? 
          (parseFloat(ethers.formatEther(info.reserveBalance)) / 3) * 100 : 100,
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
      // Get the current price for buying 1 token (how much ETH needed for 1 token)
      const oneToken = ethers.parseEther('1');
      const ethNeeded = await this.factory.calculateETHOut(tokenAddress, oneToken);
      return ethNeeded;
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
    return (totalSupply * price) / BigInt(10 ** 18);
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
      const priceHistory = await Promise.all(allEvents.map(async (event: any) => {
        const block = await this.provider.getBlock(event.blockNumber);
        
        return {
          timestamp: block?.timestamp || 0,
          price: ethers.formatEther(event.args.price || event.args.cost),
          amount: ethers.formatEther(event.args.amount),
          type: event.eventName === 'TokenPurchased' ? 'buy' : 'sell',
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

      return Promise.all(allTrades.map(async (event: any) => {
        const block = await this.provider.getBlock(event.blockNumber);
        
        return {
          type: event.eventName === 'TokenPurchased' ? 'buy' : 'sell',
          trader: event.args.buyer || event.args.seller,
          amount: ethers.formatEther(event.args.amount),
          cost: ethers.formatEther(event.args.cost),
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
      const tokenAmount = await this.factory.calculateTokensOut(tokenAddress, amountInWei);
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
      const coreAmount = await this.factory.calculateETHOut(tokenAddress, amountInWei);
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
    // Store callbacks
    if (callbacks.onTokenCreated) {
      this.on('TokenCreated', callbacks.onTokenCreated);
    }

    if (callbacks.onTokenPurchased) {
      this.on('TokenPurchased', callbacks.onTokenPurchased);
    }

    if (callbacks.onTokenSold) {
      this.on('TokenSold', callbacks.onTokenSold);
    }

    if (callbacks.onTokenLaunched) {
      this.on('TokenLaunched', callbacks.onTokenLaunched);
    }
    
    // Use WebSocket provider if available
    if (this.wsProvider) {
      this.logger.info('Setting up WebSocket event listeners for MemeFactory');
      
      // Set up WebSocket event listeners
      this.factory.on('TokenCreated', (event: any) => {
        this.emit('TokenCreated', event);
      });
      
      this.factory.on('TokenPurchased', (event: any) => {
        this.emit('TokenPurchased', event);
      });
      
      this.factory.on('TokenSold', (event: any) => {
        this.emit('TokenSold', event);
      });
      
      this.factory.on('TokenLaunched', (event: any) => {
        this.emit('TokenLaunched', event);
      });
      
      // Handle WebSocket errors and reconnection
      const websocket = this.wsProvider.websocket as any;
      if (websocket) {
        websocket.on('error', (error: any) => {
          this.logger.error('WebSocket error:', error);
          this.setupPollingFallback();
        });
        
        websocket.on('close', () => {
          this.logger.warn('WebSocket connection closed, falling back to polling');
          this.setupPollingFallback();
        });
      }
    } else {
      // Fall back to polling if WebSocket is not available
      this.logger.info('WebSocket not available, using polling for events');
      this.setupPollingFallback();
    }

    this.logger.info('Event listeners set up for MemeFactory');
  }
  
  /**
   * Set up polling fallback for events
   */
  private async setupPollingFallback() {
    // Clear any existing polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // Get current block number if we don't have one
    if (this.lastProcessedBlock === 0) {
      try {
        this.lastProcessedBlock = await this.provider.getBlockNumber();
        this.logger.info(`Starting event polling from block ${this.lastProcessedBlock}`);
      } catch (error) {
        this.logger.error('Failed to get current block number:', error);
        this.lastProcessedBlock = 0;
      }
    }
    
    // Set up polling interval (every 15 seconds)
    this.pollingInterval = setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        
        if (currentBlock > this.lastProcessedBlock) {
          this.logger.debug(`Polling for events from block ${this.lastProcessedBlock + 1} to ${currentBlock}`);
          
          // Query for each event type
          await this.queryAndEmitEvents('TokenCreated', this.lastProcessedBlock + 1, currentBlock);
          await this.queryAndEmitEvents('TokenPurchased', this.lastProcessedBlock + 1, currentBlock);
          await this.queryAndEmitEvents('TokenSold', this.lastProcessedBlock + 1, currentBlock);
          await this.queryAndEmitEvents('TokenLaunched', this.lastProcessedBlock + 1, currentBlock);
          
          // Update last processed block
          this.lastProcessedBlock = currentBlock;
        }
      } catch (error) {
        this.logger.error('Error polling for events:', error);
      }
    }, 15000); // Poll every 15 seconds
  }
  
  /**
   * Query and emit events of a specific type
   */
  private async queryAndEmitEvents(eventName: string, fromBlock: number, toBlock: number) {
    try {
      const filter = this.factory.filters[eventName]();
      const events = await this.factory.queryFilter(filter, fromBlock, toBlock);
      
      for (const event of events) {
        this.logger.info(`Emitting ${eventName} event from block ${event.blockNumber}`);
        this.emit(eventName, event);
      }
    } catch (error) {
      this.logger.error(`Error querying ${eventName} events:`, error);
    }
  }

  /**
   * Clean up event listeners
   */
  removeAllListeners() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    
    if (this.wsProvider) {
      try {
        this.factory.removeAllListeners();
      } catch (error) {
        this.logger.warn('Error removing factory listeners:', error);
      }
    }
    
    // Call parent removeAllListeners
    return super.removeAllListeners();
  }
}

// Export singleton instance
export const memeFactoryService = new MemeFactoryService();