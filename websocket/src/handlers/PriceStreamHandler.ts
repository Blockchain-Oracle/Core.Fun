import { ethers } from 'ethers';
import Redis from 'ioredis';
import { createLogger } from '@core-meme/shared';

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
  private logger = createLogger({ service: 'websocket-prices' });

  constructor(provider: ethers.JsonRpcProvider, redis: Redis) {
    this.provider = provider;
    this.redis = redis;
  }

  async start(): Promise<void> {
    this.logger.info('Starting price stream handler');
    
    // Start price update loop
    this.startPriceUpdates();
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping price stream handler');
    
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
      this.redis.publish('websocket:price_update', JSON.stringify({
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
        this.logger.error('Error updating prices:', error);
      }
    }, 5000);
  }

  private async addTokenToMonitoring(tokenAddress: string): Promise<void> {
    try {
      // Get initial price data
      const priceData = await this.fetchTokenPrice(tokenAddress);
      this.tokenPrices.set(tokenAddress, priceData);
    } catch (error) {
      this.logger.error(`Failed to add token ${tokenAddress} to monitoring:`, error);
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
        this.logger.error(`Failed to update price for ${tokenAddress}:`, error);
      }
    }
    
    // Broadcast updates
    updates.forEach((prices, clientId) => {
      this.redis.publish('websocket:price_update', JSON.stringify({
        clientId,
        prices,
      }));
    });
  }

  private async fetchTokenPrice(tokenAddress: string): Promise<PriceUpdate> {
    try {
      // First try to get price from our MemeFactory bonding curve
      const bondingPrice = await this.getBondingCurvePrice(tokenAddress);
      if (bondingPrice > 0) {
        return await this.createPriceUpdate(tokenAddress, bondingPrice);
      }

      // Then try DEX pair contracts for real price data
      const pairAddress = await this.getPairAddress(tokenAddress);
      if (pairAddress && pairAddress !== ethers.ZeroAddress) {
        const realPrice = await this.getPriceFromPair(pairAddress);
        if (realPrice > 0) {
          return await this.createPriceUpdate(tokenAddress, realPrice);
        }
      }
      
      // Fallback: use last known price or minimum
      const cachedPrice = this.tokenPrices.get(tokenAddress);
      const basePrice = cachedPrice?.price || 0.000001; // Start at $0.000001
      
      return {
        tokenAddress,
        price: basePrice,
        priceChange24h: cachedPrice?.priceChange24h || 0,
        volume24h: await this.getVolume24h(tokenAddress),
        liquidity: await this.getLiquidity(tokenAddress),
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(`Failed to fetch price for ${tokenAddress}: ${error}`);
    }
  }

  private async getBondingCurvePrice(tokenAddress: string): Promise<number> {
    try {
      const factoryAddress = process.env.MEME_FACTORY_ADDRESS || '0x04242CfFdEC8F96A46857d4A50458F57eC662cE1';
      if (!factoryAddress) return 0;

      // Get token info from MemeFactory
      const factoryContract = new ethers.Contract(
        factoryAddress,
        [
          'function getTokenInfo(address) view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
          'function calculateTokensOut(uint256 currentSold, uint256 ethIn) view returns (uint256)'
        ],
        this.provider
      );

      const tokenInfo = await factoryContract.getTokenInfo(tokenAddress);
      if (!tokenInfo || tokenInfo.token === ethers.ZeroAddress) return 0;
      if (tokenInfo.isLaunched) return 0; // Token graduated to DEX

      // Calculate current price based on bonding curve
      // Price formula from contract: basePrice + (priceIncrement * (sold / step))
      const basePrice = 0.0001; // 0.0001 CORE per token
      const priceIncrement = 0.0001;
      const step = ethers.parseEther('10000');
      const sold = tokenInfo.sold;
      
      const currentPrice = basePrice + (priceIncrement * Number(sold / step));
      
      // Get CORE price in USD
      const corePrice = await this.getCorePrice();
      return currentPrice * corePrice;
    } catch (error) {
      this.logger.error(`Error getting bonding curve price for ${tokenAddress}:`, error);
      return 0;
    }
  }

  private async getPairAddress(tokenAddress: string): Promise<string> {
    try {
      const network = process.env.NETWORK || 'testnet';
      // Using IcecreamSwap on both mainnet and testnet
      const dexes = [{ factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f' }];

      const wethAddress = network === 'mainnet' ? 
        '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f' : // WCORE mainnet
        '0x5c872990530Fe4f7322cA0c302762788e8199Ed0'; // WCORE testnet

      for (const dex of dexes) {
        try {
          const factoryContract = new ethers.Contract(
            dex.factory,
            ['function getPair(address, address) view returns (address)'],
            this.provider
          );

          const pairAddress = await factoryContract.getPair(tokenAddress, wethAddress);
          if (pairAddress !== ethers.ZeroAddress) {
            return pairAddress;
          }
        } catch (error) {
          this.logger.warn(`Failed to get pair from ${dex.factory}:`, error);
        }
      }

      return ethers.ZeroAddress;
    } catch (error) {
      this.logger.error(`Error getting pair address for ${tokenAddress}:`, error);
      return ethers.ZeroAddress;
    }
  }

  private async getPriceFromPair(pairAddress: string): Promise<number> {
    try {
      const pairContract = new ethers.Contract(
        pairAddress,
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

      const network = process.env.NETWORK || 'testnet';
      const wethAddress = network === 'mainnet' ? 
        '0x40375C92d9FAF44d2f9db9Bd9ba41a3317a2404f' : 
        '0x8069d2F7bB7AfFFD42FF8778F55cdf38E8F25698';

      // Determine which reserve is WETH/WCORE
      const isToken0Weth = token0.toLowerCase() === wethAddress.toLowerCase();
      const ethReserve = isToken0Weth ? reserves.reserve0 : reserves.reserve1;
      const tokenReserve = isToken0Weth ? reserves.reserve1 : reserves.reserve0;

      if (tokenReserve === 0n) return 0;

      // Price = ETH_RESERVE / TOKEN_RESERVE
      const priceInEth = Number(ethers.formatEther(ethReserve)) / Number(ethers.formatEther(tokenReserve));
      
      // Get CORE price in USD (using CoinGecko API)
      const corePrice = await this.getCorePrice();
      
      return priceInEth * corePrice;
    } catch (error) {
      this.logger.error(`Error getting price from pair ${pairAddress}:`, error);
      return 0;
    }
  }

  private async getCorePrice(): Promise<number> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd');
      const data: any = await response.json();
      return data.coredaoorg?.usd || 0.50; // Fallback to $0.50 if API fails
    } catch (error) {
      this.logger.warn('Failed to fetch CORE price, using fallback:', error);
      return 0.50; // Fallback price
    }
  }

  private async createPriceUpdate(tokenAddress: string, price: number): Promise<PriceUpdate> {
    const cached = this.tokenPrices.get(tokenAddress);
    const priceChange24h = cached ? ((price - cached.price) / cached.price) * 100 : 0;

    return {
      tokenAddress,
      price,
      priceChange24h,
      volume24h: await this.getVolume24h(tokenAddress),
      liquidity: await this.getLiquidity(tokenAddress),
      timestamp: Date.now(),
    };
  }

  private async getVolume24h(tokenAddress: string): Promise<number> {
    try {
      // Query from Redis cache first
      const cacheKey = `volume24h:${tokenAddress}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return parseFloat(cached);

      let totalVolume = 0;
      const oneDayAgo = Math.floor((Date.now() - 86400000) / 1000); // 24 hours ago in seconds

      // First check if token is still in bonding curve (MemeFactory trades)
      const factoryAddress = process.env.MEME_FACTORY_ADDRESS;
      if (factoryAddress) {
        try {
          const factoryContract = new ethers.Contract(
            factoryAddress,
            ['function getTokenInfo(address) view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))'],
            this.provider
          );

          const tokenInfo = await factoryContract.getTokenInfo(tokenAddress);
          if (tokenInfo && !tokenInfo.isLaunched) {
            // Get buy events from MemeFactory
            const filter = {
              address: factoryAddress,
              topics: [
                ethers.id('TokenPurchased(address,address,uint256,uint256)'), // TokenPurchased event signature
                null,
                ethers.zeroPadValue(tokenAddress, 32) // token address as second indexed parameter
              ],
              fromBlock: Math.max(0, await this.provider.getBlockNumber() - 7200), // ~24h of blocks (12s per block)
              toBlock: 'latest'
            };

            const events = await this.provider.getLogs(filter);
            for (const event of events) {
              try {
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                  ['uint256', 'uint256'], // ethAmount, tokenAmount
                  event.data
                );
                const ethAmount = Number(ethers.formatEther(decoded[0]));
                const corePrice = await this.getCorePrice();
                totalVolume += ethAmount * corePrice;
              } catch (decodeError) {
                // Skip invalid events
                continue;
              }
            }

            // Cache for 5 minutes
            await this.redis.setex(cacheKey, 300, totalVolume.toString());
            return totalVolume;
          }
        } catch (error) {
          this.logger.debug('Token not in MemeFactory or error fetching:', error);
        }
      }

      // For launched tokens, check DEX trading volume
      const pairAddress = await this.getPairAddress(tokenAddress);
      if (pairAddress && pairAddress !== ethers.ZeroAddress) {
        try {
          // Get Swap events from the pair contract
          const pairContract = new ethers.Contract(
            pairAddress,
            [
              'function token0() view returns (address)',
              'function token1() view returns (address)'
            ],
            this.provider
          );

          const [token0, token1] = await Promise.all([
            pairContract.token0(),
            pairContract.token1()
          ]);

          // Swap(address,uint256,uint256,uint256,uint256,address) event signature
          const swapFilter = {
            address: pairAddress,
            topics: [ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)')],
            fromBlock: Math.max(0, await this.provider.getBlockNumber() - 7200), // ~24h of blocks
            toBlock: 'latest'
          };

          const swapEvents = await this.provider.getLogs(swapFilter);
          const network = process.env.NETWORK || 'testnet';
          const wethAddress = network === 'mainnet' ? 
            '0x40375C92d9FAF44d2f9db9Bd9ba41a3317a2404f' : 
            '0x8069d2F7bB7AfFFD42FF8778F55cdf38E8F25698';

          const isToken0Weth = token0.toLowerCase() === wethAddress.toLowerCase();
          const corePrice = await this.getCorePrice();

          for (const event of swapEvents) {
            try {
              // Decode swap event data: (uint256,uint256,uint256,uint256)
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ['uint256', 'uint256', 'uint256', 'uint256'], // amount0In, amount1In, amount0Out, amount1Out
                event.data
              );

              // Calculate volume from the WETH/WCORE side of the swap
              let ethVolume = 0;
              if (isToken0Weth) {
                // WETH is token0, so use amount0In + amount0Out
                ethVolume = Number(ethers.formatEther(decoded[0])) + Number(ethers.formatEther(decoded[2]));
              } else {
                // WETH is token1, so use amount1In + amount1Out
                ethVolume = Number(ethers.formatEther(decoded[1])) + Number(ethers.formatEther(decoded[3]));
              }

              totalVolume += ethVolume * corePrice;
            } catch (decodeError) {
              // Skip invalid events
              continue;
            }
          }
        } catch (pairError) {
          this.logger.warn(`Failed to get DEX volume for ${tokenAddress}:`, pairError);
        }
      }

      // Cache the result for 5 minutes to avoid excessive blockchain queries
      await this.redis.setex(cacheKey, 300, totalVolume.toString());
      
      return totalVolume;
    } catch (error) {
      this.logger.error(`Error getting 24h volume for ${tokenAddress}:`, error);
      return 0;
    }
  }

  private async getLiquidity(tokenAddress: string): Promise<number> {
    try {
      // First check if token is still in bonding curve
      const factoryAddress = process.env.MEME_FACTORY_ADDRESS || '0x04242CfFdEC8F96A46857d4A50458F57eC662cE1';
      const factoryContract = new ethers.Contract(
        factoryAddress,
        ['function getTokenInfo(address) view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))'],
        this.provider
      );

      const tokenInfo = await factoryContract.getTokenInfo(tokenAddress);
      if (tokenInfo && !tokenInfo.isLaunched) {
        // Return raised amount as liquidity for bonding curve tokens
        const corePrice = await this.getCorePrice();
        return Number(ethers.formatEther(tokenInfo.raised)) * corePrice;
      }

      // For DEX tokens, get pair liquidity
      const pairAddress = await this.getPairAddress(tokenAddress);
      if (pairAddress && pairAddress !== ethers.ZeroAddress) {
        const pairContract = new ethers.Contract(
          pairAddress,
          ['function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'],
          this.provider
        );

        const reserves = await pairContract.getReserves();
        const corePrice = await this.getCorePrice();
        
        // Assuming one of the reserves is WCORE
        const totalLiquidity = (Number(ethers.formatEther(reserves.reserve0)) + 
                               Number(ethers.formatEther(reserves.reserve1))) * corePrice;
        
        return totalLiquidity;
      }

      return 0;
    } catch (error) {
      this.logger.error(`Error getting liquidity for ${tokenAddress}:`, error);
      return 0;
    }
  }
}