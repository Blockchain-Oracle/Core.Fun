import { ethers } from 'ethers';
import { DatabaseService, WalletService } from '@core-meme/shared';
import { PriceService } from '../services/PriceService';
import { createLogger } from '@core-meme/shared';

// MemeFactory contract ABI
const MEME_FACTORY_ABI = [
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) public pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) public pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
  'function tokenToSale(address) external view returns (address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt)'
];

const TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function image() view returns (string)',
  'function twitter() view returns (string)',
  'function telegram() view returns (string)',
  'function website() view returns (string)'
];

// Local type definitions
interface TradeRequest {
  action: 'buy' | 'sell' | 'snipe';
  tokenAddress: string;
  amount: string;
  slippage?: number;
  deadline?: number;
  dexName?: string;
}

interface TradeParams {
  userId: string;
  walletAddress: string;
  tokenAddress: string;
  amount: string;
  type: 'buy' | 'sell';
  slippage?: number;
  deadline?: number;
  gasPrice?: 'slow' | 'normal' | 'fast' | 'instant';
}

interface TradeResult {
  success: boolean;
  txHash?: string;
  transactionHash?: string;
  amountIn: string;
  amountOut: string;
  price: string;
  gasUsed?: string;
  error?: string;
}

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
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
  stakingBenefits?: any;
  // MemeFactory specific
  isOpen?: boolean;
  isLaunched?: boolean;
  sold?: bigint;
}

export class TradingExecutor {
  private logger = createLogger({ service: 'trading-executor' });
  private db: DatabaseService;
  private walletService: WalletService;
  private priceService: PriceService;
  private provider: ethers.JsonRpcProvider;
  private memeFactory: ethers.Contract & {
    buyToken(token: string, minTokens: bigint, overrides?: any): Promise<any>;
    sellToken(token: string, amount: bigint, minETH: bigint, overrides?: any): Promise<any>;
    calculateTokensOut(currentSold: bigint, ethIn: bigint): Promise<bigint>;
    calculateETHOut(currentSold: bigint, tokensIn: bigint): Promise<bigint>;
    tokenToSale(token: string): Promise<any>;
    getTokenInfo(token: string): Promise<any>;
  };
  private factoryAddress: string;

  constructor(db: DatabaseService) {
    this.db = db;
    this.walletService = new WalletService(db);
    this.priceService = new PriceService();
    this.provider = new ethers.JsonRpcProvider(
      process.env.CORE_RPC_HTTP_URL || process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
    );
    
    // Initialize MemeFactory contract
    this.factoryAddress = process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784';
    this.memeFactory = new ethers.Contract(
      this.factoryAddress,
      MEME_FACTORY_ABI,
      this.provider
    ) as any;
  }

  /**
   * Execute a buy trade on MemeFactory
   */
  async executeBuy(params: TradeParams): Promise<TradeResult> {
    try {
      this.logger.info(`Executing buy trade for user ${params.userId}`, params);

      // Get user's wallet
      const user = await this.db.getUserById(params.userId);
      if (!user || !user.encryptedPrivateKey) {
        throw new Error('User wallet not found');
      }

      // Check if token exists and is tradeable
      const tokenInfo = await this.getTokenInfo(params.tokenAddress);
      if (!tokenInfo.isOpen) {
        throw new Error('Token trading is not open');
      }
      if (tokenInfo.isLaunched) {
        throw new Error('Token already launched to DEX');
      }

      // Decrypt private key and create wallet
      const decryptedKey = await this.walletService.decryptPrivateKey(
        user.encryptedPrivateKey,
        user.telegramId
      );
      const wallet = new ethers.Wallet(decryptedKey, this.provider);

      // Calculate expected tokens out
      const amountInWei = ethers.parseEther(params.amount);
      const expectedTokens = await this.memeFactory.calculateTokensOut(
        tokenInfo.sold || BigInt(0),
        amountInWei
      );

      // Apply slippage (default 5% if not specified)
      const slippage = params.slippage || 5;
      const minTokens = (expectedTokens * BigInt(100 - slippage)) / BigInt(100);

      // Connect wallet to factory
      const connectedFactory = this.memeFactory.connect(wallet) as typeof this.memeFactory;

      // Execute buy transaction
      this.logger.info(`Buying ${params.amount} CORE worth of ${tokenInfo.symbol}`);
      
      const tx = await connectedFactory.buyToken(
        params.tokenAddress,
        minTokens,
        {
          value: amountInWei,
          gasLimit: params.gasPrice === 'instant' ? 500000 : 300000
        }
      );

      this.logger.info(`Buy transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Parse events to get actual amounts
      const purchaseEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('TokenPurchased(address,address,uint256,uint256,uint256)')
      );
      
      let actualTokensReceived = expectedTokens;
      if (purchaseEvent) {
        const parsed = this.memeFactory.interface.parseLog({
          topics: purchaseEvent.topics as string[],
          data: purchaseEvent.data
        });
        if (parsed) {
          actualTokensReceived = parsed.args[2]; // amount field
        }
      }

      const tokensFormatted = parseFloat(ethers.formatEther(actualTokensReceived));
      const price = parseFloat(params.amount) / tokensFormatted;

      // Save trade to database
      await this.db.saveTrade({
        userId: params.userId,
        walletAddress: wallet.address,
        tokenAddress: params.tokenAddress,
        type: 'buy',
        amountCore: parseFloat(params.amount),
        amountToken: tokensFormatted,
        price,
        txHash: receipt.hash,
        status: 'completed',
      });

      // Update position
      await this.db.updatePosition({
        userId: params.userId,
        tokenAddress: params.tokenAddress,
        amount: tokensFormatted,
        avgBuyPrice: price,
      });

      return {
        success: true,
        txHash: receipt.hash,
        transactionHash: receipt.hash,
        amountIn: params.amount,
        amountOut: ethers.formatEther(actualTokensReceived),
        price: price.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

    } catch (error: any) {
      this.logger.error('Buy trade failed:', error);
      return {
        success: false,
        amountIn: params.amount,
        amountOut: '0',
        price: '0',
        error: error.message,
      };
    }
  }

  /**
   * Execute a sell trade on MemeFactory
   */
  async executeSell(params: TradeParams & { percentage?: number }): Promise<TradeResult> {
    try {
      this.logger.info(`Executing sell trade for user ${params.userId}`, params);

      // Get user's wallet
      const user = await this.db.getUserById(params.userId);
      if (!user || !user.encryptedPrivateKey) {
        throw new Error('User wallet not found');
      }

      // Get user's position
      const position = await this.db.getPosition(params.userId, params.tokenAddress);
      if (!position || position.amount === 0) {
        throw new Error('No position found');
      }

      // Calculate sell amount
      let sellAmount = position.amount;
      if (params.percentage && params.percentage < 100) {
        sellAmount = (position.amount * params.percentage) / 100;
      }

      // Check if token exists and is tradeable
      const tokenInfo = await this.getTokenInfo(params.tokenAddress);
      if (tokenInfo.isLaunched) {
        throw new Error('Token already launched, cannot sell back to bonding curve');
      }

      // Decrypt private key and create wallet
      const decryptedKey = await this.walletService.decryptPrivateKey(
        user.encryptedPrivateKey,
        user.telegramId
      );
      const wallet = new ethers.Wallet(decryptedKey, this.provider);

      // Check token balance
      const tokenContract = new ethers.Contract(
        params.tokenAddress,
        TOKEN_ABI,
        wallet
      );
      
      const balance = await tokenContract.balanceOf(wallet.address);
      const amountToSell = ethers.parseEther(sellAmount.toString());
      
      if (balance < amountToSell) {
        throw new Error(
          `Insufficient token balance: ${ethers.formatEther(balance)} < ${sellAmount}`
        );
      }

      // Check and set approval if needed
      const allowance = await tokenContract.allowance(wallet.address, this.factoryAddress);
      if (allowance < amountToSell) {
        this.logger.info('Setting token approval for MemeFactory');
        const approveTx = await tokenContract.approve(
          this.factoryAddress,
          ethers.MaxUint256
        );
        await approveTx.wait();
      }

      // Calculate expected CORE out
      const expectedCore = await this.memeFactory.calculateETHOut(
        tokenInfo.sold || BigInt(0),
        amountToSell
      );

      // Apply slippage (default 5% if not specified)
      const slippage = params.slippage || 5;
      const minCore = (expectedCore * BigInt(100 - slippage)) / BigInt(100);

      // Connect wallet to factory
      const connectedFactory = this.memeFactory.connect(wallet) as typeof this.memeFactory;

      // Execute sell transaction
      this.logger.info(`Selling ${sellAmount} ${tokenInfo.symbol} tokens`);
      
      const tx = await connectedFactory.sellToken(
        params.tokenAddress,
        amountToSell,
        minCore,
        {
          gasLimit: params.gasPrice === 'instant' ? 500000 : 300000
        }
      );

      this.logger.info(`Sell transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Parse events to get actual amounts
      const sellEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('TokenSold(address,address,uint256,uint256,uint256)')
      );
      
      let actualCoreReceived = expectedCore;
      if (sellEvent) {
        const parsed = this.memeFactory.interface.parseLog({
          topics: sellEvent.topics as string[],
          data: sellEvent.data
        });
        if (parsed) {
          actualCoreReceived = parsed.args[3]; // proceeds field
        }
      }

      const coreFormatted = parseFloat(ethers.formatEther(actualCoreReceived));
      const price = coreFormatted / sellAmount;

      // Save trade to database
      await this.db.saveTrade({
        userId: params.userId,
        walletAddress: wallet.address,
        tokenAddress: params.tokenAddress,
        type: 'sell',
        amountCore: coreFormatted,
        amountToken: sellAmount,
        price,
        txHash: receipt.hash,
        status: 'completed',
      });

      // Update position
      const newAmount = position.amount - sellAmount;
      if (newAmount <= 0) {
        await this.db.closePosition(params.userId, params.tokenAddress);
      } else {
        await this.db.updatePosition({
          userId: params.userId,
          tokenAddress: params.tokenAddress,
          amount: newAmount,
          avgBuyPrice: position.avgBuyPrice,
        });
      }

      return {
        success: true,
        txHash: receipt.hash,
        transactionHash: receipt.hash,
        amountIn: sellAmount.toString(),
        amountOut: ethers.formatEther(actualCoreReceived),
        price: price.toString(),
        gasUsed: receipt.gasUsed.toString(),
      };

    } catch (error: any) {
      this.logger.error('Sell trade failed:', error);
      return {
        success: false,
        amountIn: params.amount,
        amountOut: '0',
        price: '0',
        error: error.message,
      };
    }
  }

  /**
   * Get token information from MemeFactory
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    try {
      // Get token info from MemeFactory
      const saleInfo = await this.memeFactory.tokenToSale(tokenAddress);
      
      if (!saleInfo || saleInfo.token === ethers.ZeroAddress) {
        // Try the getTokenInfo function if tokenToSale doesn't work
        const info = await this.memeFactory.getTokenInfo(tokenAddress);
        if (!info || info.token === ethers.ZeroAddress) {
          throw new Error('Token not found in MemeFactory');
        }
        
        return this.formatTokenInfo(info, tokenAddress);
      }
      
      // Get token contract for additional metadata
      const tokenContract = new ethers.Contract(
        tokenAddress,
        TOKEN_ABI,
        this.provider
      );
      
      // Try to get metadata (may not exist on all tokens)
      let description = '';
      let image = '';
      let twitter = '';
      let telegram = '';
      let website = '';
      
      try {
        [description, image, twitter, telegram, website] = await Promise.all([
          tokenContract.description().catch(() => ''),
          tokenContract.image().catch(() => ''),
          tokenContract.twitter().catch(() => ''),
          tokenContract.telegram().catch(() => ''),
          tokenContract.website().catch(() => '')
        ]);
      } catch (e) {
        // Metadata functions may not exist
      }

      return {
        address: tokenAddress,
        name: saleInfo.name,
        symbol: saleInfo.symbol,
        decimals: 18,
        price: 0,
        priceChange24h: 0,
        marketCap: 0,
        liquidity: parseFloat(ethers.formatEther(saleInfo.raised)),
        volume24h: 0,
        holders: 0,
        isHoneypot: false,
        rugScore: 0,
        description,
        image,
        twitter,
        telegram,
        website,
        tradingEnabled: saleInfo.isOpen,
        status: saleInfo.isLaunched ? 'launched' : (saleInfo.isOpen ? 'trading' : 'closed'),
        raised: parseFloat(ethers.formatEther(saleInfo.raised)),
        graduationPercentage: (parseFloat(ethers.formatEther(saleInfo.raised)) / 3) * 100,
        bondingCurve: {
          progress: (parseFloat(ethers.formatEther(saleInfo.sold)) / 500000) * 100,
          raisedAmount: parseFloat(ethers.formatEther(saleInfo.raised)),
          targetAmount: 3
        },
        isOpen: saleInfo.isOpen,
        isLaunched: saleInfo.isLaunched,
        sold: saleInfo.sold
      };
    } catch (error) {
      this.logger.error('Failed to get token info:', error);
      
      // Return basic info on error
      return {
        address: tokenAddress,
        name: 'Unknown',
        symbol: 'UNKNOWN',
        decimals: 18,
        price: 0,
        priceChange24h: 0,
        marketCap: 0,
        liquidity: 0,
        volume24h: 0,
        holders: 0,
        isHoneypot: false,
        rugScore: 0,
        tradingEnabled: false,
        isOpen: false,
        isLaunched: false,
        sold: BigInt(0)
      };
    }
  }

  private formatTokenInfo(info: any, tokenAddress: string): TokenInfo {
    return {
      address: tokenAddress,
      name: info.name,
      symbol: info.symbol,
      decimals: 18,
      price: 0,
      priceChange24h: 0,
      marketCap: 0,
      liquidity: parseFloat(ethers.formatEther(info.raised)),
      volume24h: 0,
      holders: 0,
      isHoneypot: false,
      rugScore: 0,
      tradingEnabled: info.isOpen,
      status: info.isLaunched ? 'launched' : (info.isOpen ? 'trading' : 'closed'),
      raised: parseFloat(ethers.formatEther(info.raised)),
      graduationPercentage: (parseFloat(ethers.formatEther(info.raised)) / 3) * 100,
      bondingCurve: {
        progress: (parseFloat(ethers.formatEther(info.sold)) / 500000) * 100,
        raisedAmount: parseFloat(ethers.formatEther(info.raised)),
        targetAmount: 3
      },
      isOpen: info.isOpen,
      isLaunched: info.isLaunched,
      sold: info.sold
    };
  }

  /**
   * Execute a snipe trade (buy immediately when token launches)
   */
  async executeSnipe(params: TradeParams): Promise<TradeResult> {
    // Snipe is just a buy with specific timing
    return this.executeBuy(params);
  }

  /**
   * Get user's positions
   */
  async getUserPositions(userId: string): Promise<any[]> {
    return this.db.getUserPositions(userId);
  }

  /**
   * Get user's trade history
   */
  async getUserTrades(userId: string, limit: number = 50): Promise<any[]> {
    return this.db.getUserTrades(userId, limit);
  }
}