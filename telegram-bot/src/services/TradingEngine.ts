import { ethers } from 'ethers';
import { DatabaseService } from './DatabaseService';
import { WalletManager } from './WalletManager';
import { PriceService } from './PriceService';
import { createLogger } from '@core-meme/shared';

// Contract addresses from deployment
const DEPLOYMENT = {
  memeFactory: '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  staking: '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  platformToken: '0x26EfC13dF039c6B4E084CEf627a47c348197b655',
  treasury: '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a'
};

interface TradeResult {
  success: boolean;
  txHash?: string;
  amountToken?: string;
  amountCore: string;
  price?: number;
  gasUsed?: string;
  error?: string;
}

interface BuyParams {
  wallet: string;
  tokenAddress: string;
  amountCore: number;
  slippage?: number;
  gasPriceMultiplier?: number;
}

interface SellParams {
  wallet: string;
  tokenAddress: string;
  percentage: number;
  slippage?: number;
  gasPriceMultiplier?: number;
}

// MemeFactory ABI
const MEMEFACTORY_ABI = [
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) external pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) external pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
  'function platformTradingFee() external view returns (uint256)'
];

// Staking ABI for fee discounts
const STAKING_ABI = [
  'function getUserFeeDiscount(address _user) external view returns (uint256)',
  'function isPremiumUser(address _user) external view returns (bool)',
  'function getUserTier(address _user) external view returns (uint256)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class TradingEngine {
  private logger = createLogger({ service: 'trading-engine' });
  private provider: ethers.JsonRpcProvider;
  private database: DatabaseService;
  private walletManager: WalletManager;
  private priceService: PriceService;
  private factoryContract: ethers.Contract;
  private stakingContract: ethers.Contract;

  constructor(database: DatabaseService) {
    this.database = database;
    this.walletManager = new WalletManager(database);
    this.priceService = new PriceService();
    
    const rpcUrl = process.env.CORE_RPC_URL || 'https://rpc.coredao.org';
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
  }

  /**
   * Buy tokens through MemeFactory bonding curve
   */
  async buy(params: BuyParams): Promise<TradeResult> {
    return this.buyToken(params);
  }

  /**
   * Sell tokens back to MemeFactory bonding curve
   */
  async sell(params: SellParams): Promise<TradeResult> {
    return this.sellToken(params);
  }

  async buyToken(params: BuyParams): Promise<TradeResult> {
    const { 
      wallet, 
      tokenAddress, 
      amountCore, 
      slippage = 10,
      gasPriceMultiplier = 1.2
    } = params;

    try {
      this.logger.info('Executing bonding curve buy', { wallet, token: tokenAddress, amount: amountCore });

      // Get user ID from wallet address
      const user = await this.database.getUserByWalletAddress(wallet);
      if (!user) {
        throw new Error('User not found');
      }

      // Get wallet with signer
      const signer = await this.walletManager.getWalletWithSigner(user.id);
      if (!signer) {
        throw new Error('Failed to get wallet signer');
      }

      // Get factory contract with signer
      const factoryWithSigner = this.factoryContract.connect(signer);

      // Get token info to check if sale is open
      const tokenInfo = await this.factoryContract.getTokenInfo(tokenAddress);
      if (!tokenInfo.isOpen) {
        throw new Error(tokenInfo.isLaunched ? 'Token already launched' : 'Token sale closed');
      }

      // Calculate expected tokens out
      const amountIn = ethers.parseEther(amountCore.toString());
      const tokensOut = await this.factoryContract.calculateTokensOut(
        tokenInfo.sold,
        amountIn
      );
      
      // Apply slippage
      const minTokensOut = tokensOut * BigInt(100 - slippage) / 100n;

      // Check for fee discount from staking
      const feeDiscount = await this.getFeeDiscount(wallet);
      this.logger.info('User fee discount from staking', { discount: feeDiscount });

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice! * BigInt(Math.floor(gasPriceMultiplier * 100)) / 100n;

      // Execute buy
      const tx = await (factoryWithSigner as any).buyToken(
        tokenAddress,
        minTokensOut,
        {
          value: amountIn,
          gasPrice,
          gasLimit: 200000,
        }
      );

      this.logger.info('Buy transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      // Parse events to get actual amounts
      const purchaseEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.factoryContract.interface.parseLog(log);
          return parsed?.name === 'TokenPurchased';
        } catch {
          return false;
        }
      });

      let actualTokens = tokensOut;
      let actualCost = amountIn;
      
      if (purchaseEvent) {
        const parsed = this.factoryContract.interface.parseLog(purchaseEvent);
        actualTokens = parsed?.args.amount;
        actualCost = parsed?.args.cost;
      }

      // Calculate price
      const price = Number(ethers.formatEther(actualCost)) / Number(ethers.formatEther(actualTokens));

      // Update database
      await this.database.saveTrade({
        userId: user.id,
        tokenAddress,
        type: 'buy',
        amountCore: Number(ethers.formatEther(actualCost)),
        amountToken: Number(ethers.formatEther(actualTokens)),
        price,
        txHash: tx.hash,
        status: 'completed'
      });

      return {
        success: true,
        txHash: tx.hash,
        amountToken: ethers.formatEther(actualTokens),
        amountCore: ethers.formatEther(actualCost),
        price,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error: any) {
      this.logger.error('Buy transaction failed', { error: error.message });
      
      return {
        success: false,
        amountCore: amountCore.toString(),
        error: error.message || 'Transaction failed'
      };
    }
  }

  async sellToken(params: SellParams): Promise<TradeResult> {
    const {
      wallet,
      tokenAddress,
      percentage,
      slippage = 10,
      gasPriceMultiplier = 1.2
    } = params;

    try {
      this.logger.info('Executing bonding curve sell', { wallet, token: tokenAddress, percentage });

      // Get user ID from wallet address
      const user = await this.database.getUserByWalletAddress(wallet);
      if (!user) {
        throw new Error('User not found');
      }

      // Get wallet with signer
      const signer = await this.walletManager.getWalletWithSigner(user.id);
      if (!signer) {
        throw new Error('Failed to get wallet signer');
      }

      // Get token contract
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      
      // Get user's token balance
      const balance = await tokenContract.balanceOf(wallet);
      if (balance === 0n) {
        throw new Error('No tokens to sell');
      }

      // Calculate amount to sell
      const amountToSell = balance * BigInt(percentage) / 100n;

      // Get token info
      const tokenInfo = await this.factoryContract.getTokenInfo(tokenAddress);
      if (tokenInfo.isLaunched) {
        throw new Error('Token already launched, cannot sell back to bonding curve');
      }

      // Calculate expected ETH out
      const ethOut = await this.factoryContract.calculateETHOut(
        tokenInfo.sold,
        amountToSell
      );
      
      // Apply slippage
      const minEthOut = ethOut * BigInt(100 - slippage) / 100n;

      // Check token approval
      const allowance = await tokenContract.allowance(wallet, DEPLOYMENT.memeFactory);
      if (allowance < amountToSell) {
        const approveTx = await tokenContract.approve(DEPLOYMENT.memeFactory, amountToSell);
        await approveTx.wait();
        this.logger.info('Token approval completed');
      }

      // Get factory contract with signer
      const factoryWithSigner = this.factoryContract.connect(signer);

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice! * BigInt(Math.floor(gasPriceMultiplier * 100)) / 100n;

      // Execute sell
      const tx = await (factoryWithSigner as any).sellToken(
        tokenAddress,
        amountToSell,
        minEthOut,
        {
          gasPrice,
          gasLimit: 200000,
        }
      );

      this.logger.info('Sell transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      // Parse events to get actual amounts
      const sellEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.factoryContract.interface.parseLog(log);
          return parsed?.name === 'TokenSold';
        } catch {
          return false;
        }
      });

      let actualTokens = amountToSell;
      let actualProceeds = ethOut;
      
      if (sellEvent) {
        const parsed = this.factoryContract.interface.parseLog(sellEvent);
        actualTokens = parsed?.args.amount;
        actualProceeds = parsed?.args.proceeds;
      }

      // Calculate price
      const price = Number(ethers.formatEther(actualProceeds)) / Number(ethers.formatEther(actualTokens));

      // Update database
      await this.database.saveTrade({
        userId: user.id,
        tokenAddress,
        type: 'sell',
        amountCore: Number(ethers.formatEther(actualProceeds)),
        amountToken: Number(ethers.formatEther(actualTokens)),
        price,
        txHash: tx.hash,
        status: 'completed'
      });

      return {
        success: true,
        txHash: tx.hash,
        amountToken: ethers.formatEther(actualTokens),
        amountCore: ethers.formatEther(actualProceeds),
        price,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error: any) {
      this.logger.error('Sell transaction failed', { error: error.message });
      
      return {
        success: false,
        amountCore: '0',
        error: error.message || 'Transaction failed'
      };
    }
  }

  /**
   * Get fee discount based on staking tier
   */
  async getFeeDiscount(walletAddress: string): Promise<number> {
    try {
      const discount = await this.stakingContract.getUserFeeDiscount(walletAddress);
      return Number(discount); // Returns basis points (100 = 1%)
    } catch (error) {
      this.logger.debug('Could not get fee discount', { error });
      return 0;
    }
  }

  /**
   * Check if user has premium status from staking
   */
  async isPremiumUser(walletAddress: string): Promise<boolean> {
    try {
      return await this.stakingContract.isPremiumUser(walletAddress);
    } catch (error) {
      this.logger.debug('Could not check premium status', { error });
      return false;
    }
  }

  /**
   * Get user's staking tier
   */
  async getUserTier(walletAddress: string): Promise<number> {
    try {
      return Number(await this.stakingContract.getUserTier(walletAddress));
    } catch (error) {
      this.logger.debug('Could not get user tier', { error });
      return 0;
    }
  }

  /**
   * Get token information from factory
   */
  async getTokenInfo(tokenAddress: string): Promise<any> {
    try {
      const info = await this.factoryContract.getTokenInfo(tokenAddress);
      return {
        token: info.token,
        name: info.name,
        symbol: info.symbol,
        creator: info.creator,
        sold: ethers.formatEther(info.sold),
        raised: ethers.formatEther(info.raised),
        isOpen: info.isOpen,
        isLaunched: info.isLaunched,
        createdAt: Number(info.createdAt),
        launchedAt: Number(info.launchedAt),
        progress: (Number(info.sold) / Number(ethers.parseEther('500000'))) * 100
      };
    } catch (error) {
      this.logger.error('Failed to get token info', { error });
      return null;
    }
  }

  /**
   * Calculate price for a given amount
   */
  async calculateBuyPrice(tokenAddress: string, amountCore: number): Promise<{
    tokensOut: string;
    pricePerToken: number;
    priceImpact: number;
  }> {
    try {
      const tokenInfo = await this.factoryContract.getTokenInfo(tokenAddress);
      const amountIn = ethers.parseEther(amountCore.toString());
      
      const tokensOut = await this.factoryContract.calculateTokensOut(
        tokenInfo.sold,
        amountIn
      );
      
      const pricePerToken = amountCore / Number(ethers.formatEther(tokensOut));
      
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
        priceImpact
      };
    } catch (error) {
      this.logger.error('Failed to calculate buy price', { error });
      throw error;
    }
  }

  /**
   * Calculate sell proceeds for a given amount
   */
  async calculateSellProceeds(tokenAddress: string, tokenAmount: string): Promise<{
    ethOut: string;
    pricePerToken: number;
    priceImpact: number;
  }> {
    try {
      const tokenInfo = await this.factoryContract.getTokenInfo(tokenAddress);
      const amountIn = ethers.parseEther(tokenAmount);
      
      const ethOut = await this.factoryContract.calculateETHOut(
        tokenInfo.sold,
        amountIn
      );
      
      const pricePerToken = Number(ethers.formatEther(ethOut)) / Number(tokenAmount);
      
      // Calculate price impact
      const smallAmount = ethers.parseEther('1000'); // 1000 tokens
      const smallEthOut = await this.factoryContract.calculateETHOut(
        tokenInfo.sold,
        smallAmount
      );
      const basePrice = Number(ethers.formatEther(smallEthOut)) / 1000;
      const priceImpact = ((basePrice - pricePerToken) / basePrice) * 100;
      
      return {
        ethOut: ethers.formatEther(ethOut),
        pricePerToken,
        priceImpact
      };
    } catch (error) {
      this.logger.error('Failed to calculate sell proceeds', { error });
      throw error;
    }
  }
}