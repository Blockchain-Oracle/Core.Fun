import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { createClient, RedisClientType } from 'redis';
import winston from 'winston';
import { z } from 'zod';
import { DEX_CONFIG, getDexConfig } from '../config/dexConfig';

// Response schemas
const TokenInfoSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  totalSupply: z.string(),
  owner: z.string().optional(),
  verified: z.boolean().optional(),
});

const TokenHolderSchema = z.object({
  address: z.string(),
  balance: z.string(),
  percentage: z.number(),
});

const TransactionSchema = z.object({
  hash: z.string(),
  from: z.string(),
  to: z.string(),
  value: z.string(),
  blockNumber: z.number(),
  timestamp: z.number(),
  status: z.number(),
});

const PriceDataSchema = z.object({
  token: z.string(),
  priceUSD: z.number(),
  priceCore: z.number(),
  volume24h: z.number(),
  liquidity: z.number(),
  priceChange24h: z.number(),
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;
export type TokenHolder = z.infer<typeof TokenHolderSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type PriceData = z.infer<typeof PriceDataSchema>;

interface CoreAPIConfig {
  mainnetRPC?: string;
  testnetRPC?: string;
  mainnetAPI?: string;
  testnetAPI?: string;
  apiKey?: string;
  network?: 'mainnet' | 'testnet';
  cacheEnabled?: boolean;
  cacheTTL?: {
    default?: number;
    tokenInfo?: number;
    priceData?: number;
    holders?: number;
    transactions?: number;
  };
}

export class CoreAPIService {
  private provider: ethers.JsonRpcProvider;
  private apiClient: AxiosInstance;
  private redis: RedisClientType | null = null;
  private logger: winston.Logger;
  private config: Required<CoreAPIConfig>;
  private network: 'mainnet' | 'testnet';

  constructor(config: CoreAPIConfig = {}) {
    this.network = config.network || 'mainnet';
    
    // Set default configuration
    this.config = {
      mainnetRPC: config.mainnetRPC || process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org',
      testnetRPC: config.testnetRPC || process.env.CORE_TESTNET_RPC || 'https://rpc.test2.btcs.network',
      mainnetAPI: config.mainnetAPI || process.env.CORE_SCAN_MAINNET_API || 'https://openapi.coredao.org/api',
      testnetAPI: config.testnetAPI || process.env.CORE_SCAN_TESTNET_API || 'https://api.test2.btcs.network/api',
      apiKey: config.apiKey || process.env.CORE_SCAN_API_KEY || '',
      network: this.network,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: {
        default: config.cacheTTL?.default || 60,
        tokenInfo: config.cacheTTL?.tokenInfo || 300,
        priceData: config.cacheTTL?.priceData || 30,
        holders: config.cacheTTL?.holders || 600,
        transactions: config.cacheTTL?.transactions || 120,
      },
    };

    // Initialize provider
    const rpcUrl = this.network === 'mainnet' ? this.config.mainnetRPC : this.config.testnetRPC;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Initialize API client
    const apiUrl = this.network === 'mainnet' ? this.config.mainnetAPI : this.config.testnetAPI;
    this.apiClient = axios.create({
      baseURL: apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for API key
    if (this.config.apiKey) {
      this.apiClient.interceptors.request.use((config) => {
        config.params = {
          ...config.params,
          apikey: this.config.apiKey,
        };
        return config;
      });
    }

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
          filename: process.env.LOG_FILE || 'core-api-service.log' 
        }),
      ],
    });

    // Initialize Redis if caching is enabled
    if (this.config.cacheEnabled) {
      this.initializeRedis();
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD,
        database: parseInt(process.env.REDIS_DB || '0'),
      });

      this.redis.on('error', (err) => {
        this.logger.error('Redis Client Error', err);
      });

      await this.redis.connect();
      this.logger.info('Redis connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      this.redis = null;
    }
  }

  private async getCached<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
    }
    
    return null;
  }

  private async setCached<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.redis) return;
    
    try {
      const ttlSeconds = ttl || this.config.cacheTTL.default || 60;
      await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  // Token Information
  async getTokenInfo(address: string): Promise<TokenInfo | null> {
    const cacheKey = `token:info:${this.network}:${address.toLowerCase()}`;
    
    // Check cache
    const cached = await this.getCached<TokenInfo>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for token info: ${address}`);
      return cached;
    }

    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'token',
          action: 'getToken',
          contractaddress: address,
        },
      });

      if (response.data.status === '1' && response.data.result) {
        const tokenInfo = TokenInfoSchema.parse(response.data.result);
        await this.setCached(cacheKey, tokenInfo, this.config.cacheTTL.tokenInfo);
        return tokenInfo;
      }
    } catch (error) {
      this.logger.error(`Failed to get token info for ${address}:`, error);
    }

    return null;
  }

  // Token Holders
  async getTokenHolders(
    address: string, 
    page: number = 1, 
    limit: number = 100
  ): Promise<TokenHolder[]> {
    const cacheKey = `token:holders:${this.network}:${address.toLowerCase()}:${page}:${limit}`;
    
    const cached = await this.getCached<TokenHolder[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for token holders: ${address}`);
      return cached;
    }

    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'token',
          action: 'getTokenHolders',
          contractaddress: address,
          page,
          offset: limit,
        },
      });

      if (response.data.status === '1' && response.data.result) {
        const holders = z.array(TokenHolderSchema).parse(response.data.result);
        await this.setCached(cacheKey, holders, this.config.cacheTTL.holders);
        return holders;
      }
    } catch (error) {
      this.logger.error(`Failed to get token holders for ${address}:`, error);
    }

    return [];
  }

  // Token Transactions
  async getTokenTransactions(
    address: string,
    startBlock: number = 0,
    endBlock: number = 99999999,
    page: number = 1,
    limit: number = 100
  ): Promise<Transaction[]> {
    const cacheKey = `token:txs:${this.network}:${address.toLowerCase()}:${startBlock}:${endBlock}:${page}`;
    
    const cached = await this.getCached<Transaction[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'account',
          action: 'tokentx',
          contractaddress: address,
          startblock: startBlock,
          endblock: endBlock,
          page,
          offset: limit,
          sort: 'desc',
        },
      });

      if (response.data.status === '1' && response.data.result) {
        const transactions = z.array(TransactionSchema).parse(response.data.result);
        await this.setCached(cacheKey, transactions, this.config.cacheTTL.transactions);
        return transactions;
      }
    } catch (error) {
      this.logger.error(`Failed to get token transactions for ${address}:`, error);
    }

    return [];
  }

  // Contract Verification
  async verifyContract(
    address: string,
    sourceCode: string,
    contractName: string,
    compilerVersion: string,
    constructorArgs: string = ''
  ): Promise<boolean> {
    try {
      const response = await this.apiClient.post('/api', {
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: address,
        sourceCode,
        codeformat: 'solidity-single-file',
        contractname: contractName,
        compilerversion: compilerVersion,
        optimizationUsed: 1,
        runs: 200,
        constructorArguements: constructorArgs,
      });

      if (response.data.status === '1') {
        this.logger.info(`Contract verification submitted for ${address}`);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to verify contract ${address}:`, error);
    }

    return false;
  }

  // Get Contract ABI
  async getContractABI(address: string): Promise<any[] | null> {
    const cacheKey = `contract:abi:${this.network}:${address.toLowerCase()}`;
    
    const cached = await this.getCached<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'contract',
          action: 'getabi',
          address,
        },
      });

      if (response.data.status === '1' && response.data.result) {
        const abi = JSON.parse(response.data.result);
        await this.setCached(cacheKey, abi, (this.config.cacheTTL.default || 60) * 10);
        return abi;
      }
    } catch (error) {
      this.logger.error(`Failed to get contract ABI for ${address}:`, error);
    }

    return null;
  }

  // Price Data (from DEX)
  async getTokenPrice(tokenAddress: string): Promise<PriceData | null> {
    const cacheKey = `token:price:${this.network}:${tokenAddress.toLowerCase()}`;
    
    const cached = await this.getCached<PriceData>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get price from multiple DEXes for best coverage
      const dexConfig = getDexConfig(this.network);
      const tasks: Array<Promise<PriceData | null>> = [];
      if (dexConfig.IceCreamSwap && dexConfig.IceCreamSwap.factory !== '0x0000000000000000000000000000000000000000') {
        tasks.push(this.getPriceFromIceCreamSwap(tokenAddress));
      }
      if (dexConfig.ShadowSwap && dexConfig.ShadowSwap.factory !== '0x0000000000000000000000000000000000000000') {
        tasks.push(this.getPriceFromShadowSwap(tokenAddress));
      }
      const dexPrices = await Promise.allSettled(tasks);

      // Aggregate prices from successful DEX queries
      const validPrices = dexPrices
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => (result as PromiseFulfilledResult<PriceData>).value!);

      if (validPrices.length === 0) {
        this.logger.warn(`No DEX prices found for token ${tokenAddress}`);
        return null;
      }

      // Calculate weighted average based on liquidity
      const totalLiquidity = validPrices.reduce((sum, p) => sum + p.liquidity, 0);
      
      const priceData: PriceData = {
        token: tokenAddress,
        priceUSD: validPrices.reduce((sum, p) => sum + (p.priceUSD * p.liquidity), 0) / totalLiquidity,
        priceCore: validPrices.reduce((sum, p) => sum + (p.priceCore * p.liquidity), 0) / totalLiquidity,
        volume24h: validPrices.reduce((sum, p) => sum + p.volume24h, 0),
        liquidity: totalLiquidity,
        priceChange24h: validPrices[0].priceChange24h, // Use first available
      };
      
      await this.setCached(cacheKey, priceData, this.config.cacheTTL.priceData);
      return priceData;
    } catch (error) {
      this.logger.error(`Failed to get price data for ${tokenAddress}:`, error);
    }

    return null;
  }

  // Get Block Number
  async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      this.logger.error('Failed to get block number:', error);
      throw error;
    }
  }

  // Get Transaction
  async getTransaction(hash: string): Promise<ethers.TransactionResponse | null> {
    try {
      return await this.provider.getTransaction(hash);
    } catch (error) {
      this.logger.error(`Failed to get transaction ${hash}:`, error);
      return null;
    }
  }

  // Get Transaction Receipt
  async getTransactionReceipt(hash: string): Promise<ethers.TransactionReceipt | null> {
    try {
      return await this.provider.getTransactionReceipt(hash);
    } catch (error) {
      this.logger.error(`Failed to get transaction receipt ${hash}:`, error);
      return null;
    }
  }

  // Estimate Gas
  async estimateGas(transaction: ethers.TransactionRequest): Promise<bigint> {
    try {
      return await this.provider.estimateGas(transaction);
    } catch (error) {
      this.logger.error('Failed to estimate gas:', error);
      throw error;
    }
  }

  // Get Gas Price
  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.gasPrice || BigInt(35000000000); // Default 35 Gwei
    } catch (error) {
      this.logger.error('Failed to get gas price:', error);
      return BigInt(35000000000);
    }
  }

  // Clear cache
  async clearCache(pattern?: string): Promise<void> {
    if (!this.redis) return;
    
    try {
      if (pattern) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
          this.logger.info(`Cleared ${keys.length} cache entries matching pattern: ${pattern}`);
        }
      } else {
        await this.redis.flushDb();
        this.logger.info('Cleared all cache entries');
      }
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
    }
  }

  // ============ ACCOUNTS MODULE ============
  
  /**
   * Get account balance for multiple addresses
   */
  async getBalanceMulti(addresses: string[]): Promise<{ account: string; balance: string }[]> {
    const cacheKey = `balance:multi:${this.network}:${addresses.join(',')}`;
    
    const cached = await this.getCached<any[]>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'account',
          action: 'balancemulti',
          address: addresses.join(','),
          tag: 'latest',
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result;
        await this.setCached(cacheKey, result, this.config.cacheTTL.default);
        return result;
      }
    } catch (error) {
      this.logger.error('Failed to get multi balance:', error);
    }
    
    return [];
  }
  
  /**
   * Get normal transactions by address
   */
  async getNormalTransactions(
    address: string,
    startBlock: number = 0,
    endBlock: number = 99999999,
    page: number = 1,
    offset: number = 100,
    sort: 'asc' | 'desc' = 'desc'
  ): Promise<any[]> {
    const cacheKey = `txs:normal:${this.network}:${address}:${startBlock}:${endBlock}:${page}`;
    
    const cached = await this.getCached<any[]>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'account',
          action: 'txlist',
          address,
          startblock: startBlock,
          endblock: endBlock,
          page,
          offset,
          sort,
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result;
        await this.setCached(cacheKey, result, this.config.cacheTTL.transactions);
        return result;
      }
    } catch (error) {
      this.logger.error('Failed to get normal transactions:', error);
    }
    
    return [];
  }
  
  /**
   * Get internal transactions by address
   */
  async getInternalTransactions(
    address: string,
    startBlock: number = 0,
    endBlock: number = 99999999,
    page: number = 1,
    offset: number = 100
  ): Promise<any[]> {
    const cacheKey = `txs:internal:${this.network}:${address}:${startBlock}:${endBlock}:${page}`;
    
    const cached = await this.getCached<any[]>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'account',
          action: 'txlistinternal',
          address,
          startblock: startBlock,
          endblock: endBlock,
          page,
          offset,
          sort: 'desc',
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result;
        await this.setCached(cacheKey, result, this.config.cacheTTL.transactions);
        return result;
      }
    } catch (error) {
      this.logger.error('Failed to get internal transactions:', error);
    }
    
    return [];
  }
  
  // ============ BLOCKS MODULE ============
  
  /**
   * Get block by number
   */
  async getBlockByNumber(blockNumber: number): Promise<any> {
    const cacheKey = `block:${this.network}:${blockNumber}`;
    
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'proxy',
          action: 'eth_getBlockByNumber',
          tag: `0x${blockNumber.toString(16)}`,
          boolean: true,
        },
      });
      
      if (response.data.result) {
        const result = response.data.result;
        await this.setCached(cacheKey, result, (this.config.cacheTTL.default || 60) * 10);
        return result;
      }
    } catch (error) {
      this.logger.error(`Failed to get block ${blockNumber}:`, error);
    }
    
    return null;
  }
  
  /**
   * Get block reward
   */
  async getBlockReward(blockNumber: number): Promise<any> {
    const cacheKey = `block:reward:${this.network}:${blockNumber}`;
    
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'block',
          action: 'getblockreward',
          blockno: blockNumber,
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result;
        await this.setCached(cacheKey, result, (this.config.cacheTTL.default || 60) * 60);
        return result;
      }
    } catch (error) {
      this.logger.error(`Failed to get block reward ${blockNumber}:`, error);
    }
    
    return null;
  }
  
  // ============ CONTRACTS MODULE ============
  
  /**
   * Get contract creation transaction
   */
  async getContractCreation(address: string): Promise<any> {
    const cacheKey = `contract:creation:${this.network}:${address.toLowerCase()}`;
    
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: address,
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result[0];
        await this.setCached(cacheKey, result, (this.config.cacheTTL.default || 60) * 60);
        return result;
      }
    } catch (error) {
      this.logger.error(`Failed to get contract creation for ${address}:`, error);
    }
    
    return null;
  }
  
  /**
   * Get source code for verified contract
   */
  async getSourceCode(address: string): Promise<any> {
    const cacheKey = `contract:source:${this.network}:${address.toLowerCase()}`;
    
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'contract',
          action: 'getsourcecode',
          address,
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result[0];
        await this.setCached(cacheKey, result, (this.config.cacheTTL.default || 60) * 60);
        return result;
      }
    } catch (error) {
      this.logger.error(`Failed to get source code for ${address}:`, error);
    }
    
    return null;
  }
  
  // ============ STATS MODULE ============
  
  /**
   * Get total supply of CORE
   */
  async getTotalSupply(): Promise<string> {
    const cacheKey = `stats:supply:${this.network}`;
    
    const cached = await this.getCached<string>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'stats',
          action: 'coresupply',
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = response.data.result;
        await this.setCached(cacheKey, result, (this.config.cacheTTL.default || 60) * 60);
        return result;
      }
    } catch (error) {
      this.logger.error('Failed to get total supply:', error);
    }
    
    return '0';
  }
  
  /**
   * Get CORE price
   */
  async getCorePrice(): Promise<{ btc: string; usd: string }> {
    const cacheKey = `stats:price:${this.network}`;
    
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;
    
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'stats',
          action: 'coreprice',
        },
      });
      
      if (response.data.status === '1' && response.data.result) {
        const result = {
          btc: response.data.result.corebtc,
          usd: response.data.result.coreusd,
        };
        await this.setCached(cacheKey, result, this.config.cacheTTL.priceData);
        return result;
      }
    } catch (error) {
      this.logger.error('Failed to get CORE price:', error);
    }
    
    return { btc: '0', usd: '0' };
  }
  
  // ============ GETH PROXY MODULE ============
  
  /**
   * Get transaction count (nonce) for address
   */
  async getTransactionCount(address: string): Promise<number> {
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'proxy',
          action: 'eth_getTransactionCount',
          address,
          tag: 'latest',
        },
      });
      
      if (response.data.result) {
        return parseInt(response.data.result, 16);
      }
    } catch (error) {
      this.logger.error(`Failed to get transaction count for ${address}:`, error);
    }
    
    return 0;
  }
  
  /**
   * Send raw transaction
   */
  async sendRawTransaction(hex: string): Promise<string | null> {
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'proxy',
          action: 'eth_sendRawTransaction',
          hex,
        },
      });
      
      if (response.data.result) {
        return response.data.result;
      }
    } catch (error) {
      this.logger.error('Failed to send raw transaction:', error);
    }
    
    return null;
  }
  
  /**
   * Call contract function
   */
  async call(to: string, data: string): Promise<string | null> {
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'proxy',
          action: 'eth_call',
          to,
          data,
          tag: 'latest',
        },
      });
      
      if (response.data.result) {
        return response.data.result;
      }
    } catch (error) {
      this.logger.error('Failed to call contract:', error);
    }
    
    return null;
  }
  
  /**
   * Get code at address
   */
  async getCode(address: string): Promise<string> {
    try {
      const response = await this.apiClient.get('/api', {
        params: {
          module: 'proxy',
          action: 'eth_getCode',
          address,
          tag: 'latest',
        },
      });
      
      if (response.data.result) {
        return response.data.result;
      }
    } catch (error) {
      this.logger.error(`Failed to get code for ${address}:`, error);
    }
    
    return '0x';
  }
  
  // ============ HELPER METHODS ============
  
  /**
   * Check if address is a contract
   */
  async isContract(address: string): Promise<boolean> {
    const code = await this.getCode(address);
    return code !== '0x' && code !== '0x0';
  }
  
  /**
   * Get comprehensive token analytics
   */
  async getTokenAnalyticsExtended(address: string): Promise<any> {
    const [
      tokenInfo,
      holders,
      transactions,
      sourceCode,
      creationTx,
      isVerified,
    ] = await Promise.all([
      this.getTokenInfo(address),
      this.getTokenHolders(address, 1, 50),
      this.getTokenTransactions(address),
      this.getSourceCode(address),
      this.getContractCreation(address),
      this.isContract(address),
    ]);
    
    // Calculate additional metrics
    const uniqueAddresses = new Set(
      transactions.flatMap((tx: any) => [tx.from, tx.to])
    ).size;
    
    const topHolderPercentage = holders[0]?.percentage || 0;
    const top10HoldersPercentage = holders
      .slice(0, 10)
      .reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);
    
    return {
      tokenInfo,
      holders: {
        count: holders.length,
        topHolder: holders[0],
        topHolderPercentage,
        top10HoldersPercentage,
      },
      transactions: {
        count: transactions.length,
        uniqueTraders: uniqueAddresses,
        last24h: transactions.filter((tx: any) => {
          const txTime = parseInt(tx.timestamp) * 1000;
          return Date.now() - txTime < 24 * 60 * 60 * 1000;
        }).length,
      },
      contract: {
        isContract: isVerified,
        isVerified: sourceCode && sourceCode.SourceCode !== '',
        creationTx: creationTx?.txHash,
        creator: creationTx?.contractCreator,
        deployedAt: creationTx?.timestamp,
      },
    };
  }
  
  /**
   * Get comprehensive account analytics
   */
  async getAccountAnalytics(address: string): Promise<any> {
    const [
      balance,
      normalTxs,
      internalTxs,
      nonce,
    ] = await Promise.all([
      this.provider.getBalance(address),
      this.getNormalTransactions(address, 0, 99999999, 1, 100),
      this.getInternalTransactions(address, 0, 99999999, 1, 100),
      this.getTransactionCount(address),
    ]);
    
    return {
      address,
      balance: balance.toString(),
      balanceCore: ethers.formatEther(balance),
      nonce,
      transactions: {
        normal: normalTxs.length,
        internal: internalTxs.length,
        total: normalTxs.length + internalTxs.length,
      },
      firstTx: normalTxs[normalTxs.length - 1],
      lastTx: normalTxs[0],
    };
  }

  // ============ DEX PRICE FETCHING METHODS ============

  /**
   * Get token price from IceCreamSwap DEX
   */
  private async getPriceFromIceCreamSwap(tokenAddress: string): Promise<PriceData | null> {
    try {
      const dexConfig = getDexConfig(this.network);
      if (!dexConfig.IceCreamSwap || dexConfig.IceCreamSwap.factory === '0x0000000000000000000000000000000000000000') {
        this.logger.debug('IceCreamSwap not configured for this network');
        return null;
      }
      const FACTORY_ADDRESS = dexConfig.IceCreamSwap.factory;
      const { WCORE: WCORE_ADDRESS, USDT: USDT_ADDRESS } = dexConfig.tokens;
      
      // Use ABIs from config
      const factoryAbi = DEX_CONFIG.abis.factory;
      const pairAbi = DEX_CONFIG.abis.pair;
      
      const factory = new ethers.Contract(FACTORY_ADDRESS, factoryAbi, this.provider);
      
      // Try to find WCORE pair first (most common)
      let pairAddress = await factory.getPair(tokenAddress, WCORE_ADDRESS);
      let useUSDT = false;
      
      if (pairAddress === ethers.ZeroAddress) {
        // Try USDT pair as fallback
        if (USDT_ADDRESS) {
          pairAddress = await factory.getPair(tokenAddress, USDT_ADDRESS);
        }
        useUSDT = true;
        
        if (pairAddress === ethers.ZeroAddress) {
          this.logger.debug(`No IceCreamSwap pair found for token ${tokenAddress}`);
          return null;
        }
      }
      
      const pair = new ethers.Contract(pairAddress, pairAbi, this.provider);
      
      // Get reserves and token ordering
      const [reserves, token0] = await Promise.all([
        pair.getReserves(),
        pair.token0(),
      ]);
      
      // Determine which token is which
      const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? reserves[0] : reserves[1];
      const baseReserve = isToken0 ? reserves[1] : reserves[0];
      
      // Get token decimals (assume 18 for most tokens)
      const tokenDecimals = 18;
      const baseDecimals = useUSDT ? 6 : 18; // USDT has 6 decimals, WCORE has 18
      
      // Calculate price
      const tokenAmount = Number(ethers.formatUnits(tokenReserve, tokenDecimals));
      const baseAmount = Number(ethers.formatUnits(baseReserve, baseDecimals));
      
      if (tokenAmount === 0) return null;
      
      const priceInBase = baseAmount / tokenAmount;
      
      // Get CORE price in USD (if we need to convert)
      let priceUSD = 0;
      let priceCore = 0;
      
      if (useUSDT && USDT_ADDRESS) {
        priceUSD = priceInBase;
        // Get CORE price to calculate priceCore
        const corePrice = await this.getCorePrice();
        priceCore = priceUSD / parseFloat(corePrice.usd);
      } else {
        priceCore = priceInBase;
        // Get CORE price in USD
        const corePrice = await this.getCorePrice();
        priceUSD = priceCore * parseFloat(corePrice.usd);
      }
      
      // Calculate liquidity in USD
      const liquidity = (useUSDT && USDT_ADDRESS)
        ? baseAmount * 2
        : priceCore * baseAmount * 2 * parseFloat((await this.getCorePrice()).usd);
      
      // Get 24h volume from events (simplified - would need event filtering)
      const volume24h = liquidity * DEX_CONFIG.priceCalculation.volumeMultipliers.IceCreamSwap;
      
      return {
        token: tokenAddress,
        priceUSD,
        priceCore,
        volume24h,
        liquidity,
        priceChange24h: 0, // Would need historical data
      };
    } catch (error) {
      this.logger.debug(`IceCreamSwap price fetch failed for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Get token price from ShadowSwap DEX
   */
  private async getPriceFromShadowSwap(tokenAddress: string): Promise<PriceData | null> {
    try {
      const dexConfig = getDexConfig(this.network);
      const FACTORY_ADDRESS = dexConfig.ShadowSwap?.factory;
      if (!FACTORY_ADDRESS) {
        this.logger.debug('ShadowSwap not configured for this network');
        return null;
      }
      const { WCORE: WCORE_ADDRESS } = dexConfig.tokens;
      
      const factoryAbi = DEX_CONFIG.abis.factory;
      const pairAbi = DEX_CONFIG.abis.pair;
      
      const factory = new ethers.Contract(FACTORY_ADDRESS, factoryAbi, this.provider);
      const pairAddress = await factory.getPair(tokenAddress, WCORE_ADDRESS);
      
      if (pairAddress === ethers.ZeroAddress) {
        this.logger.debug(`No ShadowSwap pair found for token ${tokenAddress}`);
        return null;
      }
      
      const pair = new ethers.Contract(pairAddress, pairAbi, this.provider);
      const [reserves, token0] = await Promise.all([
        pair.getReserves(),
        pair.token0(),
      ]);
      
      const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? reserves[0] : reserves[1];
      const coreReserve = isToken0 ? reserves[1] : reserves[0];
      
      const tokenAmount = Number(ethers.formatUnits(tokenReserve, 18));
      const coreAmount = Number(ethers.formatUnits(coreReserve, 18));
      
      if (tokenAmount === 0) return null;
      
      const priceCore = coreAmount / tokenAmount;
      const corePrice = await this.getCorePrice();
      const priceUSD = priceCore * parseFloat(corePrice.usd);
      const liquidity = coreAmount * 2 * parseFloat(corePrice.usd);
      
      return {
        token: tokenAddress,
        priceUSD,
        priceCore,
        volume24h: liquidity * DEX_CONFIG.priceCalculation.volumeMultipliers.ShadowSwap,
        liquidity,
        priceChange24h: 0,
      };
    } catch (error) {
      this.logger.debug(`ShadowSwap price fetch failed for ${tokenAddress}:`, error);
      return null;
    }
  }

  // CoreX removed from supported DEX list

  // Historical price computation not implemented in current scope

  /**
   * Get liquidity pools for a token across all DEXes
   */
  async getTokenLiquidityPools(tokenAddress: string): Promise<any[]> {
    const pools = [];
    const dexConfig = getDexConfig(this.network);
    
    // Check all configured DEXes
    for (const [dexName, config] of Object.entries(dexConfig)) {
      if (dexName === 'tokens') continue; // Skip token config
      
      try {
        // Skip entries that are not DEX configs (e.g., tokens)
        if (!(config as any) || !('factory' in (config as any))) {
          continue;
        }
        if ((config as any).factory === '0x0000000000000000000000000000000000000000') {
          continue;
        }
        const factoryAbi = DEX_CONFIG.abis.factory;
        const factory = new ethers.Contract((config as any).factory, factoryAbi, this.provider);
        
        // Check for pools with common base tokens
        for (const [tokenName, tokenAddr] of Object.entries(dexConfig.tokens)) {
          try {
            const pairAddress = await factory.getPair(tokenAddress, tokenAddr);
            if (pairAddress !== ethers.ZeroAddress) {
              pools.push({
                dex: dexName,
                factory: (config as any).factory,
                pair: pairAddress,
                baseToken: tokenName,
                baseTokenAddress: tokenAddr,
              });
            }
          } catch (err) {
            // Pair doesn't exist, continue
          }
        }
      } catch (error) {
        this.logger.debug(`Failed to get ${dexName} pools:`, error);
      }
    }
    
    return pools;
  }

  // Get provider
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  // Close connections
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.provider.destroy();
    this.logger.info('CoreAPIService closed');
  }
}