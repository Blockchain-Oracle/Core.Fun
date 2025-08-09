import { ethers } from 'ethers';
import { DatabaseService } from './DatabaseService';
import { WalletManager } from './WalletManager';
import { PriceService } from './PriceService';
import { logger } from '../utils/logger';

// DEX configurations for Core blockchain
const DEX_CONFIGS = {
  CORSWAP: {
    routerAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Replace with actual Core DEX
    factoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    version: 'v2',
  },
};

const WCORE_ADDRESS = '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f'; // Wrapped CORE address

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

// Router ABI for DEX interactions
const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function factory() external view returns (address)',
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class TradingEngine {
  private provider: ethers.JsonRpcProvider;
  private database: DatabaseService;
  private walletManager: WalletManager;
  private priceService: PriceService;

  constructor(database: DatabaseService) {
    this.database = database;
    this.walletManager = new WalletManager(database);
    this.priceService = new PriceService();
    
    const rpcUrl = process.env.CORE_RPC_URL || 'https://rpc.coredao.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Buy tokens with CORE
   */
  async buy(params: BuyParams): Promise<TradeResult> {
    return this.buyToken(params);
  }

  /**
   * Sell tokens for CORE
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
      logger.info('Executing buy', { wallet, token: tokenAddress, amount: amountCore });

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

      // Get router contract
      const router = new ethers.Contract(
        DEX_CONFIGS.CORSWAP.routerAddress,
        ROUTER_ABI,
        signer
      );

      // Build swap path
      const path = [WCORE_ADDRESS, tokenAddress];
      const amountIn = ethers.parseEther(amountCore.toString());

      // Get expected output
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / 100n;

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice! * BigInt(Math.floor(gasPriceMultiplier * 100)) / 100n;

      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;

      // Execute swap
      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        wallet,
        deadline,
        {
          value: amountIn,
          gasPrice,
          gasLimit: 300000,
        }
      );

      logger.info('Buy transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      const actualAmountOut = amounts[1];
      const price = Number(amountIn) / Number(actualAmountOut);

      // Save trade to database
      await this.database.saveTrade({
        userId: user.id,
        walletAddress: wallet,
        tokenAddress,
        type: 'buy',
        amountCore: amountCore,
        amountToken: parseFloat(ethers.formatUnits(actualAmountOut, 18)),
        price,
        txHash: receipt.hash,
        status: 'completed',
      });

      return {
        success: true,
        txHash: receipt.hash,
        amountToken: ethers.formatUnits(actualAmountOut, 18),
        amountCore: amountCore.toString(),
        price,
        gasUsed: receipt.gasUsed.toString(),
      };

    } catch (error: any) {
      logger.error('Buy failed', { error, params });
      return {
        success: false,
        amountCore: amountCore.toString(),
        error: error.message,
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
      logger.info('Executing sell', { wallet, token: tokenAddress, percentage });

      // Validate percentage
      if (percentage < 1 || percentage > 100) {
        throw new Error('Percentage must be between 1 and 100');
      }

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

      // Get token balance
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const balance = await tokenContract.balanceOf(wallet);

      if (balance === 0n) {
        throw new Error('No tokens to sell');
      }

      // Calculate amount to sell based on percentage
      const amountToSell = balance * BigInt(percentage) / 100n;

      // Get router contract
      const router = new ethers.Contract(
        DEX_CONFIGS.CORSWAP.routerAddress,
        ROUTER_ABI,
        signer
      );

      // Approve router if needed
      const allowance = await tokenContract.allowance(wallet, router.target);

      if (allowance < amountToSell) {
        logger.info('Approving router');
        const approveTx = await tokenContract.approve(router.target, ethers.MaxUint256);
        await approveTx.wait();
      }

      // Build swap path
      const path = [tokenAddress, WCORE_ADDRESS];

      // Get expected output
      const amounts = await router.getAmountsOut(amountToSell, path);
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / 100n;

      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice! * BigInt(Math.floor(gasPriceMultiplier * 100)) / 100n;

      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;

      // Execute swap
      const tx = await router.swapExactTokensForETH(
        amountToSell,
        amountOutMin,
        path,
        wallet,
        deadline,
        {
          gasPrice,
          gasLimit: 300000,
        }
      );

      logger.info('Sell transaction sent', { txHash: tx.hash });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      const actualAmountOut = amounts[1];
      const price = Number(actualAmountOut) / Number(amountToSell);

      // Calculate P&L if we have buy history
      const position = await this.database.getPosition(user.id, tokenAddress);
      let pnl = 0;
      let pnlPercentage = 0;

      if (position) {
        const sellValue = parseFloat(ethers.formatEther(actualAmountOut));
        const costBasis = position.avgBuyPrice * parseFloat(ethers.formatUnits(amountToSell, 18));
        pnl = sellValue - costBasis;
        pnlPercentage = (pnl / costBasis) * 100;
      }

      // Save trade to database
      await this.database.saveTrade({
        userId: user.id,
        walletAddress: wallet,
        tokenAddress,
        type: 'sell',
        amountCore: parseFloat(ethers.formatEther(actualAmountOut)),
        amountToken: parseFloat(ethers.formatUnits(amountToSell, 18)),
        price,
        txHash: receipt.hash,
        pnl,
        pnlPercentage,
        status: 'completed',
      });

      // Update position
      const remainingBalance = balance - amountToSell;
      if (remainingBalance === 0n) {
        await this.database.closePosition(user.id, tokenAddress);
      } else {
        await this.database.updatePosition({
          userId: user.id,
          tokenAddress,
          amount: parseFloat(ethers.formatUnits(remainingBalance, 18)),
        });
      }

      return {
        success: true,
        txHash: receipt.hash,
        amountToken: ethers.formatUnits(amountToSell, 18),
        amountCore: ethers.formatEther(actualAmountOut),
        price,
        gasUsed: receipt.gasUsed.toString(),
      };

    } catch (error: any) {
      logger.error('Sell failed', { error, params });
      return {
        success: false,
        amountCore: '0',
        error: error.message,
      };
    }
  }

  async getBalance(walletAddress: string): Promise<any> {
    try {
      const balance = await this.provider.getBalance(walletAddress);
      const coreAmount = parseFloat(ethers.formatEther(balance));
      
      // Get CORE price from price service
      const priceData = await this.priceService.getCoreUsdPrice();
      const usdAmount = coreAmount * priceData;

      return {
        coreAmount,
        core: coreAmount.toFixed(4),
        usdAmount,
        usd: usdAmount.toFixed(2),
      };
    } catch (error) {
      logger.error('Failed to get balance', { error, wallet: walletAddress });
      return { core: '0', usd: '0', coreAmount: 0, usdAmount: 0 };
    }
  }

  async getTokenBalance(walletAddress: string, tokenAddress: string): Promise<any> {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      
      const [balance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals(),
        tokenContract.symbol(),
      ]);

      const amount = parseFloat(ethers.formatUnits(balance, decimals));

      // Get token price
      const priceData = await this.priceService.getTokenPrice(tokenAddress);
      const usdValue = amount * priceData.priceInUsd;

      return {
        amount,
        symbol,
        decimals,
        usdValue,
        formatted: `${amount.toFixed(4)} ${symbol}`,
      };
    } catch (error) {
      logger.error('Failed to get token balance', { error, wallet: walletAddress, token: tokenAddress });
      return {
        amount: 0,
        symbol: 'UNKNOWN',
        decimals: 18,
        usdValue: 0,
        formatted: '0 UNKNOWN',
      };
    }
  }
}