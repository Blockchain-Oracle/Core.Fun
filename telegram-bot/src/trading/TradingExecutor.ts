import { ethers } from 'ethers';
import { DatabaseService } from '../services/DatabaseService';
import { PriceService } from '../services/PriceService';
import { createLogger } from '@core-meme/shared';

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
}

export class TradingExecutor {
  private logger = createLogger({ service: 'trading-executor' });
  private db: DatabaseService;
  private priceService: PriceService;
  private provider: ethers.JsonRpcProvider;
  private tradingEngineUrl: string;

  constructor(db: DatabaseService) {
    this.db = db;
    this.priceService = new PriceService();
    this.provider = new ethers.JsonRpcProvider(
      process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
    );
    this.tradingEngineUrl = process.env.TRADING_ENGINE_URL || 'http://localhost:3002';
  }

  /**
   * Execute a buy trade
   */
  async executeBuy(params: TradeParams): Promise<TradeResult> {
    try {
      this.logger.info(`Executing buy trade for user ${params.userId}`, params);

      // Get user's private key (encrypted)
      const user = await this.db.getUserById(params.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check token safety
      const tokenInfo = await this.getTokenInfo(params.tokenAddress);
      if (tokenInfo.isHoneypot) {
        throw new Error('Token is flagged as honeypot');
      }
      if (tokenInfo.rugScore > 70) {
        throw new Error(`High rug risk detected (score: ${tokenInfo.rugScore})`);
      }

      // Call trading engine API
      const response = await fetch(`${this.tradingEngineUrl}/api/trade/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: params.walletAddress,
          tokenAddress: params.tokenAddress,
          amountCore: parseFloat(params.amount),
          slippage: params.slippage || 10,
          gasPrice: params.gasPrice || 'normal',
        }),
      });

      if (!response.ok) {
        throw new Error('Trading engine error');
      }

      const result: any = await response.json();

      // Save trade to database
      await this.db.saveTrade({
        userId: params.userId,
        walletAddress: params.walletAddress,
        tokenAddress: params.tokenAddress,
        type: 'buy',
        amountCore: parseFloat(params.amount),
        amountToken: parseFloat(result.amountOut),
        price: parseFloat(result.price),
        txHash: result.txHash,
        status: 'completed',
      });

      // Update position
      await this.db.updatePosition({
        userId: params.userId,
        tokenAddress: params.tokenAddress,
        amount: parseFloat(result.amountOut),
        avgBuyPrice: parseFloat(result.price),
      });

      return {
        success: true,
        txHash: result.txHash,
        transactionHash: result.txHash,
        amountIn: params.amount,
        amountOut: result.amountOut.toString(),
        price: result.price.toString(),
        gasUsed: result.gasUsed,
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
   * Execute a sell trade
   */
  async executeSell(params: TradeParams & { percentage?: number }): Promise<TradeResult> {
    try {
      this.logger.info(`Executing sell trade for user ${params.userId}`, params);

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

      // Call trading engine API
      const response = await fetch(`${this.tradingEngineUrl}/api/trade/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: params.walletAddress,
          tokenAddress: params.tokenAddress,
          amountToken: sellAmount.toString(),
          slippage: params.slippage || 10,
          gasPrice: params.gasPrice || 'normal',
        }),
      });

      if (!response.ok) {
        throw new Error('Trading engine error');
      }

      const result: any = await response.json();

      // Calculate P&L
      const pnl = this.calculatePnL(
        position.avgBuyPrice,
        parseFloat(result.price),
        sellAmount
      );

      // Save trade to database
      await this.db.saveTrade({
        userId: params.userId,
        walletAddress: params.walletAddress,
        tokenAddress: params.tokenAddress,
        type: 'sell',
        amountCore: parseFloat(result.amountOut),
        amountToken: sellAmount,
        price: parseFloat(result.price),
        txHash: result.txHash,
        pnl: pnl.profit,
        pnlPercentage: pnl.percentage,
        status: 'completed',
      });

      // Update position
      const remainingAmount = position.amount - sellAmount;
      if (remainingAmount > 0) {
        await this.db.updatePosition({
          userId: params.userId,
          tokenAddress: params.tokenAddress,
          amount: remainingAmount,
          avgBuyPrice: position.avgBuyPrice,
        });
      } else {
        await this.db.closePosition(params.userId, params.tokenAddress);
      }

      return {
        success: true,
        txHash: result.txHash,
        transactionHash: result.txHash,
        amountIn: sellAmount.toString(),
        amountOut: result.amountOut.toString(),
        price: result.price.toString(),
        gasUsed: result.gasUsed,
      };

    } catch (error: any) {
      this.logger.error('Sell trade failed:', error);
      return {
        success: false,
        amountIn: '0',
        amountOut: '0',
        price: '0',
        error: error.message,
      };
    }
  }

  /**
   * Execute emergency sell (market sell with high slippage)
   */
  async emergencySell(userId: string, tokenAddress: string): Promise<TradeResult> {
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return this.executeSell({
      userId,
      walletAddress: user.walletAddress,
      tokenAddress,
      amount: '0', // Will use full position
      type: 'sell',
      percentage: 100,
      slippage: 30, // High slippage for emergency
      gasPrice: 'instant',
    });
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    try {
      // Use the real PriceService to get token info from blockchain
      const tokenInfo = await this.priceService.getTokenInfo(tokenAddress);
      
      return {
        address: tokenAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        price: tokenInfo.price,
        priceChange24h: tokenInfo.priceChange24h,
        marketCap: tokenInfo.marketCap,
        liquidity: tokenInfo.liquidity,
        volume24h: tokenInfo.volume24h,
        holders: tokenInfo.holders,
        isHoneypot: tokenInfo.isHoneypot,
        rugScore: tokenInfo.rugScore,
      };
    } catch (error) {
      this.logger.error('Failed to get token info:', error);
      throw error;
    }
  }

  /**
   * Calculate P&L
   */
  private calculatePnL(
    buyPrice: number,
    sellPrice: number,
    amount: number
  ): { profit: number; percentage: number } {
    const buyValue = buyPrice * amount;
    const sellValue = sellPrice * amount;
    const profit = sellValue - buyValue;
    const percentage = ((sellPrice - buyPrice) / buyPrice) * 100;

    return { profit, percentage };
  }

  /**
   * Estimate gas for trade
   */
  async estimateGas(
    tokenAddress: string,
    amount: string,
    type: 'buy' | 'sell'
  ): Promise<{ gasLimit: string; gasPrice: string; estimatedCost: string }> {
    try {
      const gasPrice = await this.provider.getFeeData();
      const gasLimit = type === 'buy' ? 200000 : 150000; // Estimates

      const estimatedCost = ethers.formatEther(
        BigInt(gasLimit) * (gasPrice.gasPrice || BigInt(0))
      );

      return {
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.gasPrice?.toString() || '0',
        estimatedCost,
      };
    } catch (error) {
      this.logger.error('Failed to estimate gas:', error);
      return {
        gasLimit: '200000',
        gasPrice: '0',
        estimatedCost: '0',
      };
    }
  }

  /**
   * Simulate trade before execution
   */
  async simulateTrade(params: TradeParams): Promise<{
    success: boolean;
    estimatedOutput: string;
    priceImpact: number;
    warning?: string;
  }> {
    try {
      const response = await fetch(`${this.tradingEngineUrl}/api/trade/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Simulation failed');
      }

      const result = await response.json();
      return result as {
        success: boolean;
        estimatedOutput: string;
        priceImpact: number;
        warning?: string;
      };
    } catch (error) {
      this.logger.error('Trade simulation failed:', error);
      return {
        success: false,
        estimatedOutput: '0',
        priceImpact: 0,
        warning: 'Unable to simulate trade',
      };
    }
  }
}