import { DatabaseService } from '@core-meme/shared';
import { PriceService } from '../services/PriceService';
import { createLogger } from '@core-meme/shared';

export interface PnLData {
  totalInvested: number;
  totalRealized: number;
  totalUnrealized: number;
  totalPnL: number;
  totalPnLPercentage: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  bestTrade: TradePerformance | null;
  worstTrade: TradePerformance | null;
  dailyPnL: DailyPnL[];
}

export interface TradePerformance {
  tokenSymbol: string;
  tokenAddress: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  profit: number;
  profitPercentage: number;
  date: Date;
  holdTime: string;
}

export interface DailyPnL {
  date: string;
  realized: number;
  unrealized: number;
  total: number;
  trades: number;
}

export class PnLCalculator {
  private logger = createLogger({ service: 'pnl-calculator' });
  private db: DatabaseService;
  private priceService: PriceService;

  constructor(db: DatabaseService) {
    this.db = db;
    this.priceService = new PriceService();
  }

  /**
   * Calculate complete P&L for user
   */
  async calculateUserPnL(userId: string, days: number = 30): Promise<PnLData> {
    try {
      // Get all trades
      const trades = await this.db.getUserTrades(userId, days);
      const positions = await this.db.getUserPositions(userId);

      // Calculate realized P&L from closed trades
      const realizedPnL = this.calculateRealizedPnL(trades);

      // Calculate unrealized P&L from open positions
      const unrealizedPnL = await this.calculateUnrealizedPnL(positions);

      // Calculate daily P&L
      const dailyPnL = this.calculateDailyPnL(trades, days);

      // Find best and worst trades
      const { bestTrade, worstTrade } = this.findBestWorstTrades(trades);

      // Calculate win rate
      const winningTrades = trades.filter(t => t.pnl && t.pnl > 0).length;
      const losingTrades = trades.filter(t => t.pnl && t.pnl < 0).length;
      const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

      // Calculate totals
      const totalInvested = this.calculateTotalInvested(trades, positions);
      const totalPnL = realizedPnL.total + unrealizedPnL.total;
      const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

      return {
        totalInvested,
        totalRealized: realizedPnL.total,
        totalUnrealized: unrealizedPnL.total,
        totalPnL,
        totalPnLPercentage,
        winRate,
        totalTrades: trades.length,
        winningTrades,
        losingTrades,
        bestTrade,
        worstTrade,
        dailyPnL,
      };
    } catch (error) {
      this.logger.error('Failed to calculate P&L:', error);
      throw error;
    }
  }

  /**
   * Calculate realized P&L from closed trades
   */
  private calculateRealizedPnL(trades: any[]): { total: number; byToken: Map<string, number> } {
    const byToken = new Map<string, number>();
    let total = 0;

    for (const trade of trades) {
      if (trade.type === 'sell' && trade.pnl !== undefined) {
        total += trade.pnl;
        
        const current = byToken.get(trade.tokenAddress) || 0;
        byToken.set(trade.tokenAddress, current + trade.pnl);
      }
    }

    return { total, byToken };
  }

  /**
   * Calculate unrealized P&L from open positions
   */
  private async calculateUnrealizedPnL(positions: any[]): Promise<{ total: number; byToken: Map<string, number> }> {
    const byToken = new Map<string, number>();
    let total = 0;

    for (const position of positions) {
      const currentPrice = await this.getCurrentPrice(position.tokenAddress);
      const currentValue = position.amount * currentPrice;
      const initialValue = position.amount * position.avgBuyPrice;
      const pnl = currentValue - initialValue;

      total += pnl;
      byToken.set(position.tokenAddress, pnl);
    }

    return { total, byToken };
  }

  /**
   * Calculate daily P&L
   */
  private calculateDailyPnL(trades: any[], days: number): DailyPnL[] {
    const dailyData = new Map<string, DailyPnL>();
    const today = new Date();

    // Initialize days
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      dailyData.set(dateStr, {
        date: dateStr,
        realized: 0,
        unrealized: 0,
        total: 0,
        trades: 0,
      });
    }

    // Aggregate trades by day
    for (const trade of trades) {
      const dateStr = new Date(trade.createdAt).toISOString().split('T')[0];
      const dayData = dailyData.get(dateStr);
      
      if (dayData) {
        if (trade.type === 'sell' && trade.pnl !== undefined) {
          dayData.realized += trade.pnl;
          dayData.total += trade.pnl;
        }
        dayData.trades++;
      }
    }

    // Convert to array and sort by date
    return Array.from(dailyData.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * Find best and worst trades
   */
  private findBestWorstTrades(trades: any[]): {
    bestTrade: TradePerformance | null;
    worstTrade: TradePerformance | null;
  } {
    const sellTrades = trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
    
    if (sellTrades.length === 0) {
      return { bestTrade: null, worstTrade: null };
    }

    const bestTrade = sellTrades.reduce((best, trade) => 
      trade.pnlPercentage > (best?.pnlPercentage || -Infinity) ? trade : best
    );

    const worstTrade = sellTrades.reduce((worst, trade) => 
      trade.pnlPercentage < (worst?.pnlPercentage || Infinity) ? trade : worst
    );

    return {
      bestTrade: this.mapToTradePerformance(bestTrade),
      worstTrade: this.mapToTradePerformance(worstTrade),
    };
  }

  /**
   * Map trade to performance object
   */
  private mapToTradePerformance(trade: any): TradePerformance {
    const holdTime = this.calculateHoldTime(trade.buyTime, trade.sellTime);
    
    return {
      tokenSymbol: trade.tokenSymbol || 'UNKNOWN',
      tokenAddress: trade.tokenAddress,
      buyPrice: trade.buyPrice,
      sellPrice: trade.sellPrice,
      amount: trade.amountToken,
      profit: trade.pnl,
      profitPercentage: trade.pnlPercentage,
      date: trade.createdAt,
      holdTime,
    };
  }

  /**
   * Calculate total invested
   */
  private calculateTotalInvested(trades: any[], positions: any[]): number {
    let total = 0;

    // From closed trades
    const buyTrades = trades.filter(t => t.type === 'buy');
    for (const trade of buyTrades) {
      total += parseFloat(trade.amountCore);
    }

    // From open positions
    for (const position of positions) {
      total += position.amount * position.avgBuyPrice;
    }

    return total;
  }

  /**
   * Calculate hold time
   */
  private calculateHoldTime(buyTime: Date, sellTime: Date): string {
    const diff = sellTime.getTime() - buyTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m`;
  }

  /**
   * Get current price using PriceService
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
   * Format P&L for display
   */
  formatPnLSummary(pnl: PnLData): string {
    const totalEmoji = pnl.totalPnL >= 0 ? '🟢' : '🔴';
    const totalSign = pnl.totalPnL >= 0 ? '+' : '';

    let summary = `📊 *P&L Summary (${pnl.dailyPnL.length} days)*\n`;
    summary += `━━━━━━━━━━━━━━━━━━\n`;
    summary += `💰 Total Invested: ${pnl.totalInvested.toFixed(2)} CORE\n`;
    summary += `${totalEmoji} Total P&L: ${totalSign}${pnl.totalPnL.toFixed(2)} CORE (${totalSign}${pnl.totalPnLPercentage.toFixed(2)}%)\n`;
    summary += `├ Realized: ${totalSign}${pnl.totalRealized.toFixed(2)} CORE\n`;
    summary += `└ Unrealized: ${pnl.totalUnrealized >= 0 ? '+' : ''}${pnl.totalUnrealized.toFixed(2)} CORE\n\n`;
    
    summary += `📈 *Performance*\n`;
    summary += `Win Rate: ${pnl.winRate.toFixed(1)}% (${pnl.winningTrades}W/${pnl.losingTrades}L)\n`;
    summary += `Total Trades: ${pnl.totalTrades}\n\n`;

    if (pnl.bestTrade) {
      summary += `🏆 Best Trade: ${pnl.bestTrade.tokenSymbol}\n`;
      summary += `   +${pnl.bestTrade.profitPercentage.toFixed(2)}% (${pnl.bestTrade.holdTime})\n`;
    }

    if (pnl.worstTrade) {
      summary += `😢 Worst Trade: ${pnl.worstTrade.tokenSymbol}\n`;
      summary += `   ${pnl.worstTrade.profitPercentage.toFixed(2)}% (${pnl.worstTrade.holdTime})\n`;
    }

    return summary;
  }

  /**
   * Format daily P&L chart
   */
  formatDailyChart(dailyPnL: DailyPnL[]): string {
    let chart = `📈 *Daily P&L (Last 7 Days)*\n`;
    chart += `━━━━━━━━━━━━━━━━━━\n`;

    const last7Days = dailyPnL.slice(-7);
    
    for (const day of last7Days) {
      const date = new Date(day.date).toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
      const pnlBar = this.createBar(day.total, 10);
      const sign = day.total >= 0 ? '+' : '';
      
      chart += `${date}: ${pnlBar} ${sign}${day.total.toFixed(2)}\n`;
    }

    return chart;
  }

  /**
   * Create visual bar for P&L
   */
  private createBar(value: number, maxLength: number): string {
    const isPositive = value >= 0;
    const normalizedValue = Math.min(Math.abs(value) / 10, 1); // Normalize to 0-1
    const barLength = Math.round(normalizedValue * maxLength);
    
    if (isPositive) {
      return '🟢'.repeat(barLength) || '·';
    } else {
      return '🔴'.repeat(barLength) || '·';
    }
  }
}