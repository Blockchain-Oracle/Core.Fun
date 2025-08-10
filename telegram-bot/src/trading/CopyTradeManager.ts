import { ethers } from 'ethers';
import { DatabaseService } from '../services/DatabaseService';
import { TradingExecutor } from './TradingExecutor';
import { logger } from '../utils/logger';

export interface CopyTradeSettings {
  userId: string;
  targetWallet: string;
  enabled: boolean;
  copyBuys: boolean;
  copySells: boolean;
  maxAmountPerTrade: number;
  percentageOfWallet: number;
  minTokenAge: number; // hours
  maxSlippage: number;
  blacklistedTokens: string[];
  whitelistedTokens: string[];
  stopLoss?: number;
  takeProfit?: number;
  createdAt: Date;
}

export interface WalletStats {
  address: string;
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  totalProfit: number;
  riskScore: number;
  lastActivity: Date;
  followers: number;
}

export interface CopiedTrade {
  id: string;
  userId: string;
  targetWallet: string;
  tokenAddress: string;
  type: 'buy' | 'sell';
  originalAmount: number;
  copiedAmount: number;
  originalTxHash: string;
  copiedTxHash?: string;
  status: 'pending' | 'completed' | 'failed';
  reason?: string;
  createdAt: Date;
}

export class CopyTradeManager {
  private db: DatabaseService;
  private tradingExecutor: TradingExecutor;
  private provider: ethers.JsonRpcProvider;
  private activeListeners: Map<string, any> = new Map();
  private walletStats: Map<string, WalletStats> = new Map();

  constructor(db: DatabaseService, tradingExecutor: TradingExecutor) {
    this.db = db;
    this.tradingExecutor = tradingExecutor;
    this.provider = new ethers.JsonRpcProvider(
      process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
    );
  }

  /**
   * Start copying a wallet
   */
  async startCopyTrading(settings: Partial<CopyTradeSettings>): Promise<CopyTradeSettings> {
    try {
      // Validate target wallet
      if (!ethers.isAddress(settings.targetWallet)) {
        throw new Error('Invalid wallet address');
      }

      // Check if already copying
      const existing = await this.db.getCopyTradeSettings(
        settings.userId!,
        settings.targetWallet!
      );

      if (existing && existing.enabled) {
        throw new Error('Already copying this wallet');
      }

      // Analyze wallet performance
      const stats = await this.analyzeWallet(settings.targetWallet!);
      
      if (stats.riskScore > 80) {
        throw new Error('Wallet has high risk score');
      }

      // Create or update settings
      const fullSettings: CopyTradeSettings = {
        userId: settings.userId!,
        targetWallet: settings.targetWallet!,
        enabled: true,
        copyBuys: settings.copyBuys ?? true,
        copySells: settings.copySells ?? true,
        maxAmountPerTrade: settings.maxAmountPerTrade ?? 1,
        percentageOfWallet: settings.percentageOfWallet ?? 25,
        minTokenAge: settings.minTokenAge ?? 1,
        maxSlippage: settings.maxSlippage ?? 15,
        blacklistedTokens: settings.blacklistedTokens ?? [],
        whitelistedTokens: settings.whitelistedTokens ?? [],
        stopLoss: settings.stopLoss,
        takeProfit: settings.takeProfit,
        createdAt: new Date(),
      };

      await this.db.saveCopyTradeSettings(fullSettings);

      // Start monitoring
      await this.startWalletMonitoring(settings.targetWallet!);

      logger.info(`Started copy trading ${settings.targetWallet} for user ${settings.userId}`);

      return fullSettings;
    } catch (error) {
      logger.error('Failed to start copy trading:', error);
      throw error;
    }
  }

  /**
   * Stop copying a wallet
   */
  async stopCopyTrading(userId: string, targetWallet: string): Promise<void> {
    try {
      await this.db.updateCopyTradeSettings(userId, targetWallet, { enabled: false });
      
      // Check if anyone else is copying this wallet
      const otherCopiers = await this.db.getWalletCopiers(targetWallet);
      if (otherCopiers.length === 0) {
        this.stopWalletMonitoring(targetWallet);
      }

      logger.info(`Stopped copy trading ${targetWallet} for user ${userId}`);
    } catch (error) {
      logger.error('Failed to stop copy trading:', error);
      throw error;
    }
  }

  /**
   * Get all copy trade settings for user
   */
  async getUserCopyTrades(userId: string): Promise<CopyTradeSettings[]> {
    return this.db.getUserCopyTrades(userId);
  }

  /**
   * Get copied trade history
   */
  async getCopiedTrades(userId: string, limit: number = 50): Promise<CopiedTrade[]> {
    return this.db.getCopiedTrades(userId, limit);
  }

  /**
   * Analyze wallet performance
   */
  async analyzeWallet(walletAddress: string): Promise<WalletStats> {
    try {
      // Check cache
      if (this.walletStats.has(walletAddress)) {
        const cached = this.walletStats.get(walletAddress)!;
        if (Date.now() - cached.lastActivity.getTime() < 3600000) { // 1 hour cache
          return cached;
        }
      }

      // Analyze on-chain data
      const trades = await this.getWalletTrades(walletAddress, 30); // Last 30 days
      
      const winningTrades = trades.filter(t => t.profit > 0).length;
      const totalTrades = trades.length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      
      const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
      const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
      
      // Calculate risk score (0-100)
      const riskScore = this.calculateRiskScore(trades);
      
      // Get followers count
      const followers = await this.db.getWalletFollowersCount(walletAddress);

      const stats: WalletStats = {
        address: walletAddress,
        totalTrades,
        winRate,
        avgProfit,
        totalProfit,
        riskScore,
        lastActivity: new Date(),
        followers,
      };

      // Cache stats
      this.walletStats.set(walletAddress, stats);

      return stats;
    } catch (error) {
      logger.error('Failed to analyze wallet:', error);
      throw error;
    }
  }

  /**
   * Start monitoring wallet for trades
   */
  private async startWalletMonitoring(walletAddress: string) {
    if (this.activeListeners.has(walletAddress)) {
      return; // Already monitoring
    }

    // Set up event listeners for swap events
    // This would listen to DEX router events
    const listener = async (event: any) => {
      await this.handleWalletTrade(walletAddress, event);
    };

    // Store listener
    this.activeListeners.set(walletAddress, listener);

    // In production, this would use WebSocket subscriptions
    // For now, we'll use polling
    const pollInterval = setInterval(async () => {
      await this.checkWalletActivity(walletAddress);
    }, 10000); // Check every 10 seconds

    this.activeListeners.set(`${walletAddress}_interval`, pollInterval);

    logger.info(`Started monitoring wallet ${walletAddress}`);
  }

  /**
   * Stop monitoring wallet
   */
  private stopWalletMonitoring(walletAddress: string) {
    const listener = this.activeListeners.get(walletAddress);
    if (listener) {
      // Remove listener
      this.activeListeners.delete(walletAddress);
    }

    const interval = this.activeListeners.get(`${walletAddress}_interval`);
    if (interval) {
      clearInterval(interval);
      this.activeListeners.delete(`${walletAddress}_interval`);
    }

    logger.info(`Stopped monitoring wallet ${walletAddress}`);
  }

  /**
   * Handle detected wallet trade
   */
  private async handleWalletTrade(walletAddress: string, event: any) {
    try {
      // Parse trade details
      const trade = this.parseTradeEvent(event);
      
      // Get all users copying this wallet
      const copiers = await this.db.getWalletCopiers(walletAddress);
      
      for (const copier of copiers) {
        await this.executeCopyTrade(copier, walletAddress, trade);
      }
    } catch (error) {
      logger.error('Failed to handle wallet trade:', error);
    }
  }

  /**
   * Execute copy trade for user
   */
  private async executeCopyTrade(
    settings: CopyTradeSettings,
    targetWallet: string,
    trade: any
  ) {
    try {
      // Check if should copy this trade
      if (!this.shouldCopyTrade(settings, trade)) {
        return;
      }

      // Calculate copy amount
      const copyAmount = this.calculateCopyAmount(settings, trade.amount);
      
      if (copyAmount < 0.01) {
        logger.info(`Copy amount too small for user ${settings.userId}`);
        return;
      }

      // Get user details
      const user = await this.db.getUserById(settings.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create copy trade record
      const copyTrade: CopiedTrade = {
        id: this.generateTradeId(),
        userId: settings.userId,
        targetWallet,
        tokenAddress: trade.tokenAddress,
        type: trade.type,
        originalAmount: trade.amount,
        copiedAmount: copyAmount,
        originalTxHash: trade.txHash,
        status: 'pending',
        createdAt: new Date(),
      };

      await this.db.saveCopiedTrade(copyTrade);

      // Execute trade
      const result = await this.tradingExecutor.executeBuy({
        userId: settings.userId,
        walletAddress: user.walletAddress,
        tokenAddress: trade.tokenAddress,
        amount: copyAmount.toString(),
        type: trade.type,
        slippage: settings.maxSlippage,
      });

      // Update copy trade record
      if (result.success) {
        copyTrade.status = 'completed';
        copyTrade.copiedTxHash = result.txHash;
      } else {
        copyTrade.status = 'failed';
        copyTrade.reason = result.error;
      }

      await this.db.updateCopiedTrade(copyTrade);

      // Notify user
      await this.notifyUser(settings.userId, copyTrade);

    } catch (error) {
      logger.error('Failed to execute copy trade:', error);
    }
  }

  /**
   * Check if should copy trade
   */
  private shouldCopyTrade(settings: CopyTradeSettings, trade: any): boolean {
    // Check trade type
    if (trade.type === 'buy' && !settings.copyBuys) return false;
    if (trade.type === 'sell' && !settings.copySells) return false;

    // Check blacklist
    if (settings.blacklistedTokens.includes(trade.tokenAddress)) {
      return false;
    }

    // Check whitelist (if specified)
    if (settings.whitelistedTokens.length > 0) {
      if (!settings.whitelistedTokens.includes(trade.tokenAddress)) {
        return false;
      }
    }

    // Check token age
    if (trade.tokenAge < settings.minTokenAge * 3600) {
      return false;
    }

    return true;
  }

  /**
   * Calculate copy amount based on settings
   */
  private calculateCopyAmount(settings: CopyTradeSettings, originalAmount: number): number {
    // Use percentage of original
    let amount = (originalAmount * settings.percentageOfWallet) / 100;
    
    // Apply max limit
    if (amount > settings.maxAmountPerTrade) {
      amount = settings.maxAmountPerTrade;
    }

    return amount;
  }

  /**
   * Get wallet trades (mock implementation)
   */
  private async getWalletTrades(_walletAddress: string, _days: number): Promise<any[]> {
    // In production, this would query blockchain data
    return [];
  }

  /**
   * Check wallet activity (polling implementation)
   */
  private async checkWalletActivity(_walletAddress: string) {
    // This would check for new transactions
    // For now, it's a placeholder
  }

  /**
   * Parse trade event
   */
  private parseTradeEvent(event: any): any {
    // Parse blockchain event
    return {
      tokenAddress: event.tokenAddress,
      type: event.type,
      amount: event.amount,
      txHash: event.txHash,
      tokenAge: 3600, // Mock
    };
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(trades: any[]): number {
    // Simple risk calculation
    let score = 0;
    
    // Check for rug pulls
    const rugPulls = trades.filter(t => t.profit < -90).length;
    score += rugPulls * 20;
    
    // Check volatility
    const profits = trades.map(t => t.profit);
    const volatility = this.calculateVolatility(profits);
    score += volatility * 0.5;
    
    return Math.min(score, 100);
  }

  /**
   * Calculate volatility
   */
  private calculateVolatility(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Generate trade ID
   */
  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Notify user about copy trade
   */
  private async notifyUser(userId: string, trade: CopiedTrade) {
    // This would send Telegram notification
    logger.info(`Notifying user ${userId} about copy trade`, trade);
  }
}