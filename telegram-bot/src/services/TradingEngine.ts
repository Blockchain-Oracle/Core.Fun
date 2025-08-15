import { DatabaseService, WalletService } from '@core-meme/shared';
import { ApiService } from './ApiService';
import { createLogger } from '@core-meme/shared';

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

interface SnipeParams {
  wallet: string;
  tokenAddress: string;
  amountCore: number;
  autoSellProfit?: number;
  autoSellLoss?: number;
  maxGas?: number;
}

export class TradingEngine {
  private logger = createLogger({ service: 'trading-engine' });
  private database: DatabaseService;
  private walletService: WalletService;
  private apiService: ApiService;
  private snipeQueue: Map<string, SnipeParams> = new Map();

  constructor(database: DatabaseService) {
    this.database = database;
    this.walletService = new WalletService(database);
    this.apiService = new ApiService();
  }

  /**
   * Set authentication token for API calls
   */
  setAuthToken(token: string) {
    this.apiService.setAuthToken(token);
  }

  /**
   * Buy tokens through backend API
   */
  async buy(params: BuyParams): Promise<TradeResult> {
    try {
      this.logger.info(`Executing buy order for ${params.amountCore} CORE of ${params.tokenAddress}`);

      // Call backend API to execute buy
      const response = await this.apiService.buyToken({
        tokenAddress: params.tokenAddress,
        amount: params.amountCore.toString(),
        slippage: params.slippage || 5,
      });

      if (!response.success) {
        throw new Error(response.error || 'Buy failed');
      }

      const data = response.data!;

      // Log trade to database
      await this.database.logTrade({
        userId: params.wallet,
        walletAddress: params.wallet,
        tokenAddress: params.tokenAddress,
        type: 'buy',
        amountCore: parseFloat(data.amountIn),
        amountToken: parseFloat(data.amountOut),
        txHash: data.txHash || '',
        price: parseFloat(data.amountIn) / parseFloat(data.amountOut),
        status: 'completed',
      });

      return {
        success: true,
        txHash: data.txHash,
        amountToken: data.amountOut,
        amountCore: data.amountIn,
        price: parseFloat(data.amountIn) / parseFloat(data.amountOut),
        gasUsed: data.fee,
      };
    } catch (error: any) {
      this.logger.error('Buy failed:', error);
      return {
        success: false,
        amountCore: params.amountCore.toString(),
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Sell tokens through backend API
   */
  async sell(params: SellParams): Promise<TradeResult> {
    try {
      this.logger.info(`Executing sell order for ${params.percentage}% of ${params.tokenAddress}`);

      // Get user's token balance first
      const walletInfo = await this.apiService.getWalletInfo(params.wallet);
      if (!walletInfo.success || !walletInfo.data) {
        throw new Error('Failed to get wallet info');
      }

      const tokenBalance = walletInfo.data.tokens.find(
        t => t.address.toLowerCase() === params.tokenAddress.toLowerCase()
      );

      if (!tokenBalance) {
        throw new Error('No tokens to sell');
      }

      // Calculate amount to sell based on percentage
      const amountToSell = (parseFloat(tokenBalance.balance) * params.percentage) / 100;

      // Call backend API to execute sell
      const response = await this.apiService.sellToken({
        tokenAddress: params.tokenAddress,
        amount: amountToSell.toString(),
        slippage: params.slippage || 5,
      });

      if (!response.success) {
        throw new Error(response.error || 'Sell failed');
      }

      const data = response.data!;

      // Log trade to database
      await this.database.logTrade({
        userId: params.wallet,
        walletAddress: params.wallet,
        tokenAddress: params.tokenAddress,
        type: 'sell',
        amountCore: parseFloat(data.amountOut),
        amountToken: parseFloat(data.amountIn),
        txHash: data.txHash || '',
        price: parseFloat(data.amountOut) / parseFloat(data.amountIn),
        status: 'completed',
      });

      return {
        success: true,
        txHash: data.txHash,
        amountToken: data.amountIn,
        amountCore: data.amountOut,
        price: parseFloat(data.amountOut) / parseFloat(data.amountIn),
        gasUsed: data.fee,
      };
    } catch (error: any) {
      this.logger.error('Sell failed:', error);
      return {
        success: false,
        amountCore: '0',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Setup snipe for token launch
   */
  async setupSnipe(params: SnipeParams): Promise<{ success: boolean; message: string }> {
    try {
      // Get token info to check if it's already launched
      const tokenInfo = await this.apiService.getTokenInfo(params.tokenAddress);
      
      if (tokenInfo.success && tokenInfo.data?.tradingEnabled) {
        return {
          success: false,
          message: 'Token is already launched and trading',
        };
      }

      // Extract token symbol from the token info if available
      const tokenSymbol = tokenInfo.success && tokenInfo.data?.symbol 
        ? tokenInfo.data.symbol 
        : 'PENDING'; // Use PENDING instead of UNKNOWN for tokens not yet launched
      
      // Add to snipe queue
      this.snipeQueue.set(params.tokenAddress, params);
      
      // Store in database for persistence
      await this.database.addSnipeOrder({
        userId: params.wallet,
        tokenAddress: params.tokenAddress,
        tokenSymbol: tokenSymbol,
        amount: params.amountCore,
        maxPrice: params.autoSellProfit,
        minLiquidity: 0,
        status: 'PENDING',
        createdAt: new Date(),
      });

      this.logger.info(`Snipe setup for ${params.tokenAddress} with ${params.amountCore} CORE`);

      return {
        success: true,
        message: `Snipe order placed. Will buy ${params.amountCore} CORE when token launches.`,
      };
    } catch (error: any) {
      this.logger.error('Snipe setup failed:', error);
      return {
        success: false,
        message: error.message || 'Failed to setup snipe',
      };
    }
  }

  /**
   * Execute pending snipes when token launches
   */
  async executePendingSnipes(tokenAddress: string): Promise<void> {
    const snipeParams = this.snipeQueue.get(tokenAddress);
    if (!snipeParams) return;

    try {
      this.logger.info(`Executing snipe for ${tokenAddress}`);
      
      // Execute buy immediately
      const result = await this.buy({
        wallet: snipeParams.wallet,
        tokenAddress: tokenAddress,
        amountCore: snipeParams.amountCore,
        slippage: 10, // Higher slippage for snipes
        gasPriceMultiplier: 1.5, // Higher gas for priority
      });

      if (result.success) {
        // Update snipe order status
        await this.database.updateSnipeOrder(tokenAddress, {
          status: 'EXECUTED',
          txHash: result.txHash,
          executedAt: new Date(),
        });

        // Setup auto-sell if configured
        if (snipeParams.autoSellProfit || snipeParams.autoSellLoss) {
          await this.setupAutoSell(
            tokenAddress,
            snipeParams.wallet,
            result.price!,
            snipeParams.autoSellProfit,
            snipeParams.autoSellLoss
          );
        }
      } else {
        await this.database.updateSnipeOrder(tokenAddress, {
          status: 'FAILED',
        });
      }

      // Remove from queue
      this.snipeQueue.delete(tokenAddress);
    } catch (error) {
      this.logger.error(`Snipe execution failed for ${tokenAddress}:`, error);
      this.snipeQueue.delete(tokenAddress);
    }
  }

  /**
   * Setup auto-sell orders
   */
  private async setupAutoSell(
    tokenAddress: string,
    wallet: string,
    entryPrice: number,
    profitTarget?: number,
    stopLoss?: number
  ): Promise<void> {
    try {
      // Fetch token info to get the symbol
      let tokenSymbol = 'AUTO';
      try {
        const tokenInfo = await this.apiService.getTokenInfo(tokenAddress);
        if (tokenInfo.success && tokenInfo.data?.symbol) {
          tokenSymbol = tokenInfo.data.symbol;
        }
      } catch (error) {
        this.logger.debug(`Failed to fetch token symbol for ${tokenAddress}, using AUTO`);
      }

      if (profitTarget) {
        const targetPrice = entryPrice * (1 + profitTarget / 100);
        await this.database.addPriceAlert({
          userId: wallet,
          tokenAddress,
          tokenSymbol: tokenSymbol,
          targetPrice,
          condition: 'above',
          enabled: true,
          createdAt: new Date(),
        });
      }

      if (stopLoss) {
        const stopPrice = entryPrice * (1 - stopLoss / 100);
        await this.database.addPriceAlert({
          userId: wallet,
          tokenAddress,
          tokenSymbol: tokenSymbol,
          targetPrice: stopPrice,
          condition: 'below',
          enabled: true,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Failed to setup auto-sell:', error);
    }
  }

  /**
   * Get user's portfolio
   */
  async getPortfolio(walletAddress: string): Promise<any> {
    try {
      const response = await this.apiService.getPortfolio(walletAddress);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get portfolio');
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get portfolio:', error);
      return null;
    }
  }

  /**
   * Get trade history
   */
  async getTradeHistory(walletAddress: string, limit = 50): Promise<any[]> {
    try {
      const response = await this.apiService.getTradingHistory(walletAddress);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get trade history');
      }

      return response.data || [];
    } catch (error) {
      this.logger.error('Failed to get trade history:', error);
      return [];
    }
  }

  /**
   * Calculate P&L for a position
   */
  async calculatePnL(
    walletAddress: string,
    tokenAddress: string
  ): Promise<{
    invested: number;
    currentValue: number;
    pnl: number;
    pnlPercentage: number;
  }> {
    try {
      // Get portfolio data
      const portfolio = await this.getPortfolio(walletAddress);
      if (!portfolio) {
        throw new Error('Failed to get portfolio');
      }

      const position = portfolio.positions?.find(
        (p: any) => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
      );

      if (!position) {
        return {
          invested: 0,
          currentValue: 0,
          pnl: 0,
          pnlPercentage: 0,
        };
      }

      return {
        invested: position.invested || 0,
        currentValue: position.currentValue || 0,
        pnl: position.pnl || 0,
        pnlPercentage: position.pnlPercentage || 0,
      };
    } catch (error) {
      this.logger.error('Failed to calculate P&L:', error);
      return {
        invested: 0,
        currentValue: 0,
        pnl: 0,
        pnlPercentage: 0,
      };
    }
  }

  /**
   * Get gas estimates
   */
  async getGasEstimate(method: 'buy' | 'sell', amount: string): Promise<any> {
    try {
      const response = await this.apiService.estimateGas(method, { amount });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to estimate gas');
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get gas estimate:', error);
      return null;
    }
  }
}