import { DatabaseService } from '@core-meme/shared';
import { PriceService } from '../services/PriceService';
import { createLogger } from '@core-meme/shared';

export interface Position {
  id: string;
  userId: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  amount: number;
  avgBuyPrice: number;
  currentPrice: number;
  initialInvestment: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  firstBuyTime: Date;
  lastUpdateTime: Date;
  trades: number;
}

export interface PositionSummary {
  totalPositions: number;
  totalValue: number;
  totalPnL: number;
  totalPnLPercentage: number;
  winningPositions: number;
  losingPositions: number;
  bestPerformer?: Position;
  worstPerformer?: Position;
}

export class PositionManager {
  private logger = createLogger({ service: 'position-manager' });
  private db: DatabaseService;
  private priceService: PriceService;
  private priceUpdateInterval: NodeJS.Timeout | null = null;

  constructor(db: DatabaseService) {
    this.db = db;
    this.priceService = new PriceService();
    this.startPriceUpdates();
  }

  /**
   * Get all positions for a user
   */
  async getUserPositions(userId: string): Promise<Position[]> {
    try {
      const positions = await this.db.getUserPositions(userId);
      
      // Update current prices
      const updatedPositions = await Promise.all(
        positions.map(async (pos) => {
          const currentPrice = await this.getCurrentPrice(pos.tokenAddress);
          return this.calculatePositionMetrics(pos, currentPrice);
        })
      );

      return updatedPositions.sort((a, b) => b.currentValue - a.currentValue);
    } catch (error) {
      this.logger.error('Failed to get user positions:', error);
      return [];
    }
  }

  /**
   * Get position for specific token
   */
  async getPosition(userId: string, tokenAddress: string): Promise<Position | null> {
    try {
      const position = await this.db.getPosition(userId, tokenAddress);
      if (!position) return null;

      const currentPrice = await this.getCurrentPrice(tokenAddress);
      return this.calculatePositionMetrics(position, currentPrice);
    } catch (error) {
      this.logger.error('Failed to get position:', error);
      return null;
    }
  }

  /**
   * Get position summary
   */
  async getPositionSummary(userId: string): Promise<PositionSummary> {
    const positions = await this.getUserPositions(userId);

    if (positions.length === 0) {
      return {
        totalPositions: 0,
        totalValue: 0,
        totalPnL: 0,
        totalPnLPercentage: 0,
        winningPositions: 0,
        losingPositions: 0,
      };
    }

    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalInvestment = positions.reduce((sum, pos) => sum + pos.initialInvestment, 0);
    const totalPnL = totalValue - totalInvestment;
    const totalPnLPercentage = (totalPnL / totalInvestment) * 100;

    const winningPositions = positions.filter(pos => pos.pnl > 0).length;
    const losingPositions = positions.filter(pos => pos.pnl < 0).length;

    const bestPerformer = positions.reduce((best, pos) => 
      pos.pnlPercentage > (best?.pnlPercentage || -Infinity) ? pos : best
    );

    const worstPerformer = positions.reduce((worst, pos) => 
      pos.pnlPercentage < (worst?.pnlPercentage || Infinity) ? pos : worst
    );

    return {
      totalPositions: positions.length,
      totalValue,
      totalPnL,
      totalPnLPercentage,
      winningPositions,
      losingPositions,
      bestPerformer,
      worstPerformer,
    };
  }

  /**
   * Add to position (averaging)
   */
  async addToPosition(
    userId: string,
    tokenAddress: string,
    amount: number,
    price: number
  ): Promise<Position> {
    const existingPosition = await this.db.getPosition(userId, tokenAddress);

    if (existingPosition) {
      // Calculate new average price
      const totalAmount = existingPosition.amount + amount;
      const totalCost = (existingPosition.amount * existingPosition.avgBuyPrice) + (amount * price);
      const newAvgPrice = totalCost / totalAmount;

      await this.db.updatePosition({
        userId,
        tokenAddress,
        amount: totalAmount,
        avgBuyPrice: newAvgPrice,
        trades: existingPosition.trades + 1,
      });
    } else {
      // Create new position
      await this.db.createPosition({
        userId,
        tokenAddress,
        amount,
        avgBuyPrice: price,
        initialInvestment: amount * price,
        firstBuyTime: new Date(),
        trades: 1,
      });
    }

    return (await this.getPosition(userId, tokenAddress))!;
  }

  /**
   * Reduce position
   */
  async reducePosition(
    userId: string,
    tokenAddress: string,
    amount: number
  ): Promise<Position | null> {
    const position = await this.db.getPosition(userId, tokenAddress);
    if (!position) return null;

    const remainingAmount = position.amount - amount;

    if (remainingAmount <= 0) {
      // Close position
      await this.db.closePosition(userId, tokenAddress);
      return null;
    } else {
      // Update position
      await this.db.updatePosition({
        userId,
        tokenAddress,
        amount: remainingAmount,
        avgBuyPrice: position.avgBuyPrice,
      });

      return await this.getPosition(userId, tokenAddress);
    }
  }

  /**
   * Calculate position metrics
   */
  private calculatePositionMetrics(position: any, currentPrice: number): Position {
    const currentValue = position.amount * currentPrice;
    const initialInvestment = position.amount * position.avgBuyPrice;
    const pnl = currentValue - initialInvestment;
    const pnlPercentage = (pnl / initialInvestment) * 100;

    return {
      id: position.id,
      userId: position.userId,
      tokenAddress: position.tokenAddress,
      tokenSymbol: position.tokenSymbol || 'UNKNOWN',
      tokenName: position.tokenName || 'Unknown Token',
      amount: position.amount,
      avgBuyPrice: position.avgBuyPrice,
      currentPrice,
      initialInvestment,
      currentValue,
      pnl,
      pnlPercentage,
      firstBuyTime: position.firstBuyTime,
      lastUpdateTime: new Date(),
      trades: position.trades || 1,
    };
  }

  /**
   * Get current price for token using PriceService
   */
  private async getCurrentPrice(tokenAddress: string): Promise<number> {
    try {
      const priceData = await this.priceService.getTokenPrice(tokenAddress);
      return priceData.priceInCore;
    } catch (error) {
      this.logger.error(`Failed to get price for ${tokenAddress}:`, error);
      return 0;
    }
  }

  /**
   * Start automatic price updates
   */
  private startPriceUpdates() {
    // Update prices every 30 seconds
    this.priceUpdateInterval = setInterval(async () => {
      try {
        // Get all active positions
        const positions = await this.db.getAllActivePositions();
        
        // Update prices in batches
        const batchSize = 10;
        for (let i = 0; i < positions.length; i += batchSize) {
          const batch = positions.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (pos) => {
              const price = await this.getCurrentPrice(pos.tokenAddress);
              await this.db.updatePositionPrice(pos.id, price);
            })
          );
        }
      } catch (error) {
        this.logger.error('Price update failed:', error);
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop price updates
   */
  stopPriceUpdates() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
  }

  /**
   * Format position for display
   */
  formatPosition(position: Position): string {
    const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
    const pnlSign = position.pnl >= 0 ? '+' : '';
    
    return `
${position.tokenSymbol} (${position.tokenName})
━━━━━━━━━━━━━━━━━━
💰 Amount: ${position.amount.toFixed(4)}
📈 Avg Buy: $${position.avgBuyPrice.toFixed(6)}
💵 Current: $${position.currentPrice.toFixed(6)}
💎 Value: ${position.currentValue.toFixed(2)} CORE
${pnlEmoji} P&L: ${pnlSign}${position.pnl.toFixed(2)} CORE (${pnlSign}${position.pnlPercentage.toFixed(2)}%)
⏱ Held: ${this.formatTimeDiff(position.firstBuyTime)}
📊 Trades: ${position.trades}
`;
  }

  /**
   * Format time difference
   */
  private formatTimeDiff(date: Date): string {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m`;
  }
}