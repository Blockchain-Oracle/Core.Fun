import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@core-meme/shared';
import type winston from 'winston';
import { z } from 'zod';

// Contract addresses from deployment
const DEPLOYMENT = {
  memeFactory: '0x04242CfFdEC8F96A46857d4A50458F57eC662cE1',
  staking: '0x95F1588ef2087f9E40082724F5Da7BAD946969CB',
  platformToken: '0x96611b71A4DE5B8616164B650720ADe10948193F',
  treasury: '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a'
};

// Contract ABIs
const MEMEFACTORY_ABI = [
  'function createToken(string _name, string _symbol, string _description, string _image, string _twitter, string _telegram, string _website) external payable',
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) external pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) external pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
  'function getTokensByCreator(address _creator) external view returns (address[])',
  'function getAllTokens() external view returns (address[])',
  'function creationFee() external view returns (uint256)',
  'function platformTradingFee() external view returns (uint256)',
  'function totalTokensCreated() external view returns (uint256)',
  'function totalVolume() external view returns (uint256)',
  'function totalFeesCollected() external view returns (uint256)',
  'function TOKEN_LIMIT() external view returns (uint256)',
  'function TARGET() external view returns (uint256)',
  'function MAX_SUPPLY() external view returns (uint256)'
];

const STAKING_ABI = [
  'function stake(uint256 _amount) external',
  'function unstake(uint256 _amount) external',
  'function claimRewards() external',
  'function getUserFeeDiscount(address _user) external view returns (uint256)',
  'function isPremiumUser(address _user) external view returns (bool)',
  'function getUserTier(address _user) external view returns (uint256)',
  'function pendingReward(address _user) external view returns (uint256)',
  'function getStakingStats(address _user) external view returns (uint256 stakedAmount, uint256 pendingRewardAmount, uint256 totalEarnedAmount, uint256 userTier, bool isPremium)',
  'function pool() external view returns (uint256 totalStaked, uint256 accRewardPerShare, uint256 lastRewardTime, uint256 rewardRate)'
];

const MEMETOKEN_ABI = [
  'function getMetadata() external view returns (string description, string image, string twitter, string telegram, string website, uint256 maxWallet, uint256 maxTransaction, bool tradingEnabled, address owner)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];

// Response schemas
const TokenInfoSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  creator: z.string(),
  sold: z.string(),
  raised: z.string(),
  isOpen: z.boolean(),
  isLaunched: z.boolean(),
  createdAt: z.number(),
  launchedAt: z.number(),
  progress: z.number(),
  currentPrice: z.string(),
  marketCap: z.string(),
  metadata: z.object({
    description: z.string(),
    image: z.string(),
    twitter: z.string(),
    telegram: z.string(),
    website: z.string()
  }).optional()
});

const StakingInfoSchema = z.object({
  stakedAmount: z.string(),
  pendingRewards: z.string(),
  totalEarned: z.string(),
  tier: z.number(),
  tierName: z.string(),
  isPremium: z.boolean(),
  feeDiscount: z.number()
});

const PriceQuoteSchema = z.object({
  tokensOut: z.string(),
  pricePerToken: z.number(),
  priceImpact: z.number(),
  fee: z.string(),
  minReceived: z.string()
});

const PlatformStatsSchema = z.object({
  totalTokensCreated: z.number(),
  totalVolume: z.string(),
  totalFeesCollected: z.string(),
  creationFee: z.string(),
  tradingFee: z.number()
});

export type TokenInfo = z.infer<typeof TokenInfoSchema>;
export type StakingInfo = z.infer<typeof StakingInfoSchema>;
export type PriceQuote = z.infer<typeof PriceQuoteSchema>;
export type PlatformStats = z.infer<typeof PlatformStatsSchema>;
export type TokenHolder = {
  address: string;
  balance: string;
  percentage?: number;
};
export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  status?: number;
  [key: string]: any;
};
export type PriceData = {
  address: string;
  priceCore: number;
  priceUSD: number;
  liquidityCore?: number;
  liquidityUSD?: number;
  marketCapUSD?: number;
  updatedAt: number;
};

interface CoreAPIConfig {
  mainnetRPC?: string;
  testnetRPC?: string;
  apiKey?: string;
  network?: 'mainnet' | 'testnet';
  cacheEnabled?: boolean;
  cacheTTL?: {
    default?: number;
    tokenInfo?: number;
    priceData?: number;
    stakingInfo?: number;
  };
}

export class CoreAPIService {
  private provider: ethers.JsonRpcProvider;
  private apiClient: AxiosInstance;
  private redis: RedisClientType | null = null;
  private logger: winston.Logger;
  private config: Required<CoreAPIConfig>;
  private network: 'mainnet' | 'testnet';
  private factoryContract: ethers.Contract;
  private stakingContract: ethers.Contract;

  constructor(config: CoreAPIConfig = {}) {
    this.network = config.network || 'testnet';
    
    // Set default configuration
    this.config = {
      mainnetRPC: config.mainnetRPC || process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org',
      testnetRPC: config.testnetRPC || process.env.CORE_TESTNET_RPC || 'https://rpc.test2.btcs.network',
      apiKey: config.apiKey || process.env.CORE_SCAN_API_KEY || '',
      network: this.network,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: {
        default: config.cacheTTL?.default || 60,
        tokenInfo: config.cacheTTL?.tokenInfo || 30,
        priceData: config.cacheTTL?.priceData || 10,
        stakingInfo: config.cacheTTL?.stakingInfo || 60,
      },
    };

    // Initialize provider
    const rpcUrl = this.network === 'mainnet' ? this.config.mainnetRPC : this.config.testnetRPC;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Initialize contracts
    this.factoryContract = new ethers.Contract(
      DEPLOYMENT.memeFactory,
      MEMEFACTORY_ABI,
      this.provider
    );

    this.stakingContract = new ethers.Contract(
      DEPLOYMENT.staking,
      STAKING_ABI,
      this.provider
    );

    // Initialize API client for Core Scan
    const apiUrl = this.network === 'mainnet' 
      ? 'https://openapi.coredao.org/api'
      : 'https://api.test2.btcs.network/api';
    
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
          ...(config.params ?? {}),
          apikey: this.config.apiKey,
        };
        return config;
      });
    }

    // Initialize logger
    this.logger = createLogger({ 
      service: 'core-api-service',
      enableFileLogging: true
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
      this.logger.error('Failed to connect to Redis:', error);
      this.redis = null;
    }
  }

  // ============= MemeFactory Methods =============

  /**
   * Get comprehensive token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    const cacheKey = `token:${tokenAddress}`;
    
    // Check cache
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    try {
      // Get token info from factory
      const info = await this.factoryContract.getTokenInfo(tokenAddress);
      
      if (!info.token || info.token === ethers.ZeroAddress) {
        return null;
      }

      // Get token metadata
      const tokenContract = new ethers.Contract(
        tokenAddress,
        MEMETOKEN_ABI,
        this.provider
      );

      let metadata;
      try {
        const metadataRaw = await tokenContract.getMetadata();
        metadata = {
          description: metadataRaw[0],
          image: metadataRaw[1],
          twitter: metadataRaw[2],
          telegram: metadataRaw[3],
          website: metadataRaw[4]
        };
      } catch {
        metadata = undefined;
      }

      // Calculate current price
      const currentPrice = await this.getCurrentPrice(tokenAddress, info.sold);
      
      // Calculate market cap
      const marketCap = (Number(ethers.formatEther(info.sold)) * currentPrice).toString();

      const tokenInfo: TokenInfo = {
        address: tokenAddress,
        name: info.name,
        symbol: info.symbol,
        creator: info.creator,
        sold: ethers.formatEther(info.sold),
        raised: ethers.formatEther(info.raised),
        isOpen: info.isOpen,
        isLaunched: info.isLaunched,
        createdAt: Number(info.createdAt),
        launchedAt: Number(info.launchedAt),
        progress: (Number(info.sold) / Number(await this.factoryContract.TOKEN_LIMIT())) * 100,
        currentPrice: currentPrice.toString(),
        marketCap,
        metadata
      };

      // Cache result
      if (this.redis) {
        const ttl = (this.config.cacheTTL.tokenInfo ?? this.config.cacheTTL.default ?? 60);
        await this.redis.setEx(
          cacheKey,
          ttl,
          JSON.stringify(tokenInfo)
        );
      }

      return tokenInfo;
    } catch (error) {
      this.logger.error('Failed to get token info:', error);
      return null;
    }
  }

  /**
   * Get all tokens created by the factory
   */
  async getAllTokens(): Promise<string[]> {
    try {
      return await this.factoryContract.getAllTokens();
    } catch (error) {
      this.logger.error('Failed to get all tokens:', error);
      return [];
    }
  }

  /**
   * Get tokens created by a specific creator
   */
  async getTokensByCreator(creator: string): Promise<string[]> {
    try {
      return await this.factoryContract.getTokensByCreator(creator);
    } catch (error) {
      this.logger.error('Failed to get tokens by creator:', error);
      return [];
    }
  }

  /**
   * Calculate buy quote
   */
  async getBuyQuote(tokenAddress: string, amountCore: string): Promise<PriceQuote | null> {
    try {
      const tokenInfo = await this.factoryContract.getTokenInfo(tokenAddress);
      const amountIn = ethers.parseEther(amountCore);
      
      const tokensOut = await this.factoryContract.calculateTokensOut(
        tokenInfo.sold,
        amountIn
      );
      
      const tradingFee = await this.factoryContract.platformTradingFee();
      const fee = (amountIn * BigInt(tradingFee)) / 10000n;
      
      const pricePerToken = Number(amountCore) / Number(ethers.formatEther(tokensOut));
      
      // Calculate price impact
      const smallAmount = ethers.parseEther('0.001');
      const smallTokensOut = await this.factoryContract.calculateTokensOut(
        tokenInfo.sold,
        smallAmount
      );
      const basePrice = 0.001 / Number(ethers.formatEther(smallTokensOut));
      const priceImpact = ((pricePerToken - basePrice) / basePrice) * 100;
      
      return {
        tokensOut: ethers.formatEther(tokensOut),
        pricePerToken,
        priceImpact,
        fee: ethers.formatEther(fee),
        minReceived: ethers.formatEther(tokensOut * 95n / 100n) // 5% slippage
      };
    } catch (error) {
      this.logger.error('Failed to get buy quote:', error);
      return null;
    }
  }

  /**
   * Calculate sell quote
   */
  async getSellQuote(tokenAddress: string, tokenAmount: string): Promise<PriceQuote | null> {
    try {
      const tokenInfo = await this.factoryContract.getTokenInfo(tokenAddress);
      const amountIn = ethers.parseEther(tokenAmount);
      
      const ethOut = await this.factoryContract.calculateETHOut(
        tokenInfo.sold,
        amountIn
      );
      
      const tradingFee = await this.factoryContract.platformTradingFee();
      const fee = (ethOut * BigInt(tradingFee)) / 10000n;
      
      const pricePerToken = Number(ethers.formatEther(ethOut)) / Number(tokenAmount);
      
      // Calculate price impact
      const smallAmount = ethers.parseEther('1000');
      const smallEthOut = await this.factoryContract.calculateETHOut(
        tokenInfo.sold,
        smallAmount
      );
      const basePrice = Number(ethers.formatEther(smallEthOut)) / 1000;
      const priceImpact = ((basePrice - pricePerToken) / basePrice) * 100;
      
      return {
        tokensOut: ethers.formatEther(ethOut),
        pricePerToken,
        priceImpact,
        fee: ethers.formatEther(fee),
        minReceived: ethers.formatEther(ethOut * 95n / 100n) // 5% slippage
      };
    } catch (error) {
      this.logger.error('Failed to get sell quote:', error);
      return null;
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats(): Promise<PlatformStats | null> {
    const cacheKey = 'platform:stats';
    
    // Check cache
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    try {
      const [
        totalTokensCreated,
        totalVolume,
        totalFeesCollected,
        creationFee,
        tradingFee
      ] = await Promise.all([
        this.factoryContract.totalTokensCreated(),
        this.factoryContract.totalVolume(),
        this.factoryContract.totalFeesCollected(),
        this.factoryContract.creationFee(),
        this.factoryContract.platformTradingFee()
      ]);

      const stats: PlatformStats = {
        totalTokensCreated: Number(totalTokensCreated),
        totalVolume: ethers.formatEther(totalVolume),
        totalFeesCollected: ethers.formatEther(totalFeesCollected),
        creationFee: ethers.formatEther(creationFee),
        tradingFee: Number(tradingFee) // basis points
      };

      // Cache result
      if (this.redis) {
        const ttl = (this.config.cacheTTL.default ?? 60);
        await this.redis.setEx(
          cacheKey,
          ttl,
          JSON.stringify(stats)
        );
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get platform stats:', error);
      return null;
    }
  }

  // ============= Staking Methods =============

  /**
   * Get user's staking information
   */
  async getStakingInfo(userAddress: string): Promise<StakingInfo | null> {
    const cacheKey = `staking:${userAddress}`;
    
    // Check cache
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    try {
      const [
        stats,
        feeDiscount,
        tier
      ] = await Promise.all([
        this.stakingContract.getStakingStats(userAddress),
        this.stakingContract.getUserFeeDiscount(userAddress),
        this.stakingContract.getUserTier(userAddress)
      ]);

      const tierNames = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];
      
      const stakingInfo: StakingInfo = {
        stakedAmount: ethers.formatEther(stats[0]),
        pendingRewards: ethers.formatEther(stats[1]),
        totalEarned: ethers.formatEther(stats[2]),
        tier: Number(tier),
        tierName: tierNames[Number(tier)] || 'None',
        isPremium: stats[4],
        feeDiscount: Number(feeDiscount) // basis points
      };

      // Cache result
      if (this.redis) {
        const ttl = (this.config.cacheTTL.stakingInfo ?? this.config.cacheTTL.default ?? 60);
        await this.redis.setEx(
          cacheKey,
          ttl,
          JSON.stringify(stakingInfo)
        );
      }

      return stakingInfo;
    } catch (error) {
      this.logger.error('Failed to get staking info:', error);
      return null;
    }
  }

  /**
   * Get staking pool information
   */
  async getStakingPoolInfo(): Promise<any> {
    try {
      const pool = await this.stakingContract.pool();
      
      return {
        totalStaked: ethers.formatEther(pool[0]),
        accRewardPerShare: pool[1].toString(),
        lastRewardTime: Number(pool[2]),
        rewardRate: ethers.formatEther(pool[3])
      };
    } catch (error) {
      this.logger.error('Failed to get staking pool info:', error);
      return null;
    }
  }

  // ============= Helper Methods =============

  /**
   * Get contract ABI by address (via explorer) or by known name fallback
   */
  public async getContractABI(identifier: string): Promise<any | null> {
    try {
      const isAddress = /^0x[a-fA-F0-9]{40}$/.test(identifier);
      if (isAddress) {
        const { data } = await this.apiClient.get('', {
          params: {
            module: 'contract',
            action: 'getabi',
            address: identifier,
          },
        });
        if (data && data.status === '1' && data.result) {
          try {
            return JSON.parse(data.result);
          } catch {
            // Some explorers return already-parsed JSON
            return data.result;
          }
        }
        return null;
      }
      const key = identifier.toLowerCase();
      if (key === 'memefactory' || key === 'factory' || key === 'meme_factory') {
        return MEMEFACTORY_ABI;
      }
      if (key === 'staking' || key === 'stake') {
        return STAKING_ABI;
      }
      if (key === 'memetoken' || key === 'token' || key === 'meme_token') {
        return MEMETOKEN_ABI;
      }
      return null;
    } catch (error) {
      this.logger.error('Failed to get contract ABI:', error);
      return null;
    }
  }

  /**
   * Submit contract verification to Core Scan (Etherscan-compatible)
   * Returns true if submission was accepted
   */
  public async verifyContract(
    address: string,
    sourceCode: string,
    contractName: string,
    compilerVersion: string,
    constructorArgs: string
  ): Promise<boolean> {
    try {
      const params: Record<string, any> = {
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: address,
        sourceCode,
        codeformat: 'solidity-single-file',
        contractname: contractName,
        compilerversion: compilerVersion,
        optimizationUsed: 1,
        runs: 200,
        constructorArguements: (constructorArgs || '').replace(/^0x/, ''),
      };
      const { data } = await this.apiClient.post('', null, { params });
      // Etherscan-like API returns { status: '1', message: 'OK', result: 'GUID' }
      if (data && String(data.status) === '1') {
        return true;
      }
      this.logger.warn('Contract verification submission failed', { response: data });
      return false;
    } catch (error) {
      this.logger.error('Failed to verify contract:', error);
      return false;
    }
  }

  /**
   * Calculate current price based on bonding curve
   */
  private async getCurrentPrice(tokenAddress: string, currentSold: bigint): Promise<number> {
    try {
      // Calculate price for buying 1 token at current state
      const oneEther = ethers.parseEther('1');
      const tokensForOneEther = await this.factoryContract.calculateTokensOut(
        currentSold,
        oneEther
      );
      
      // Price = 1 CORE / tokens received
      return 1 / Number(ethers.formatEther(tokensForOneEther));
    } catch {
      return 0;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txHash: string): Promise<any> {
    try {
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!tx || !receipt) {
        return null;
      }

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        gasPrice: ethers.formatUnits(tx.gasPrice || 0, 'gwei'),
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        timestamp: (await this.provider.getBlock(receipt.blockNumber))?.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to get transaction:', error);
      return null;
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get CORE price in USD (mock for now)
   */
  async getCorePriceUSD(): Promise<number> {
    // Etherscan-compatible stats.ethprice
    const { data } = await this.apiClient.get('', {
      params: {
        module: 'stats',
        action: 'ethprice',
      },
    });
    if (String(data?.status ?? '1') === '1') {
      const usd = Number(
        data?.result?.ethusd ??
        data?.result?.coreusd ??
        data?.result?.usd ??
        0
      );
      if (!isNaN(usd) && usd > 0) {
        return usd;
      }
    }
    throw new Error('Invalid CORE price response');
  }

  // ============= Public Utility Methods for Routes =============

  public getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  public async getBalanceMulti(addresses: string[]): Promise<Array<{ address: string; balance: string; balanceCore: string }>> {
    const results = await Promise.all(addresses.map(async (address) => {
      const balance = await this.provider.getBalance(address);
      return {
        address,
        balance: balance.toString(),
        balanceCore: ethers.formatEther(balance),
      };
    }));
    return results;
  }

  public async getNormalTransactions(
    address: string,
    startBlock: number,
    endBlock: number,
    page: number,
    offset: number,
    sort: 'asc' | 'desc'
  ): Promise<Transaction[]> {
    try {
      const { data } = await this.apiClient.get('', {
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
      return data?.result || [];
    } catch (error) {
      this.logger.error('Failed to get normal transactions:', error);
      return [];
    }
  }

  public async getInternalTransactions(
    address: string,
    startBlock: number,
    endBlock: number,
    page: number,
    offset: number,
  ): Promise<Transaction[]> {
    try {
      const { data } = await this.apiClient.get('', {
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
      return data?.result || [];
    } catch (error) {
      this.logger.error('Failed to get internal transactions:', error);
      return [];
    }
  }

  public async getTokenTransactions(
    contractAddress: string,
    startBlock: number = 0,
    endBlock: number = 99999999,
    page: number = 1,
    offset: number = 100,
    sort: 'asc' | 'desc' = 'desc'
  ): Promise<Transaction[]> {
    try {
      const { data } = await this.apiClient.get('', {
        params: {
          module: 'account',
          action: 'tokentx',
          contractaddress: contractAddress,
          startblock: startBlock,
          endblock: endBlock,
          page,
          offset,
          sort,
        },
      });
      return data?.result || [];
    } catch (error) {
      this.logger.error('Failed to get token transactions:', error);
      return [];
    }
  }

  public async getTransactionCount(address: string): Promise<number> {
    try {
      const count = await this.provider.getTransactionCount(address);
      return count;
    } catch (error) {
      this.logger.error('Failed to get transaction count:', error);
      return 0;
    }
  }

  public async getAccountAnalytics(address: string): Promise<{ address: string; txCount: number; totalReceivedCore: string; totalSentCore: string; firstTxTimestamp?: number; lastTxTimestamp?: number; }>
  {
    const txs = await this.getNormalTransactions(address, 0, 99999999, 1, 100, 'desc');
    let received = 0n;
    let sent = 0n;
    let firstTs: number | undefined;
    let lastTs: number | undefined;
    for (const tx of txs) {
      const value = BigInt(tx.value || '0');
      if (String(tx.to).toLowerCase() === address.toLowerCase()) {
        received += value;
      }
      if (String(tx.from).toLowerCase() === address.toLowerCase()) {
        sent += value;
      }
      const ts = Number(tx.timeStamp || tx.timestamp || 0);
      if (ts) {
        if (firstTs === undefined || ts < firstTs) firstTs = ts;
        if (lastTs === undefined || ts > lastTs) lastTs = ts;
      }
    }
    return {
      address,
      txCount: txs.length,
      totalReceivedCore: ethers.formatEther(received),
      totalSentCore: ethers.formatEther(sent),
      firstTxTimestamp: firstTs,
      lastTxTimestamp: lastTs,
    };
  }

  public async getTokenHolders(contractAddress: string, page: number = 1, offset: number = 100): Promise<TokenHolder[]> {
    try {
      const { data } = await this.apiClient.get('', {
        params: {
          module: 'token',
          action: 'getTokenHolders',
          contractaddress: contractAddress,
          page,
          offset,
        },
      });
      return data?.result || [];
    } catch (error) {
      this.logger.error('Failed to get token holders:', error);
      return [];
    }
  }

  public async getTokenPrice(tokenAddress: string): Promise<PriceData | null> {
    try {
      // Try platform-specific pricing via bonding curve if token is known to factory
      const info = await this.factoryContract.getTokenInfo(tokenAddress);
      if (info && info.token && info.token !== ethers.ZeroAddress) {
        const priceCore = await this.getCurrentPrice(tokenAddress, info.sold);
        const coreUsd = await this.getCorePrice().catch(() => this.getCorePriceUSD());
        return {
          address: tokenAddress,
          priceCore,
          priceUSD: priceCore * (coreUsd || 0),
          marketCapUSD: Number(ethers.formatEther(info.sold)) * priceCore * (coreUsd || 0),
          updatedAt: Math.floor(Date.now() / 1000),
        };
      }
      return null;
    } catch (error) {
      this.logger.error('Failed to get token price:', error);
      return null;
    }
  }

  public async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      if (feeData.gasPrice != null) {
        return feeData.gasPrice;
      }
      const hex = await this.provider.send('eth_gasPrice', []);
      return BigInt(hex);
    } catch (error) {
      this.logger.error('Failed to get gas price:', error);
      return 0n;
    }
  }

  public async getTotalSupply(): Promise<bigint> {
    try {
      const { data } = await this.apiClient.get('', {
        params: {
          module: 'stats',
          action: 'ethsupply',
        },
      });
      const result = data?.result;
      if (typeof result === 'string') {
        return BigInt(result);
      }
      return 0n;
    } catch (error) {
      this.logger.error('Failed to get total supply:', error);
      return 0n;
    }
  }

  public async getCorePrice(): Promise<number> {
    try {
      // Delegate to USD price helper (Etherscan-compatible endpoint)
      return await this.getCorePriceUSD();
    } catch (error) {
      this.logger.error('Failed to get CORE price via explorer:', error);
      return await this.getCorePriceUSD();
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.provider.destroy();
  }
}