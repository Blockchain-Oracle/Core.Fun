import { createCanvas, GlobalFonts, SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { Position } from '../trading/PositionManager';
import { PnLData } from '../trading/PnLCalculator';
import { createLogger } from '@core-meme/shared';

const logger = createLogger({ service: 'image-generator' });

export class ImageGenerator {
  private readonly colors = {
    background: '#0A0E27',
    cardBg: '#1A1F3A',
    green: '#00D87A',
    red: '#FF3B69',
    yellow: '#FFB800',
    text: '#FFFFFF',
    textSecondary: '#8B92B9',
    border: '#2A3050',
    gradientStart: '#1E2341',
    gradientEnd: '#0A0E27',
  };

  private fontsLoaded = false;

  constructor() {
    this.loadFonts();
  }

  private loadFonts() {
    try {
      if (this.fontsLoaded) return;
      // Optionally register bundled fonts if added later.
      // GlobalFonts.registerFromPath(pathToFont, 'Inter');
      this.fontsLoaded = true;
    } catch (error) {
      logger.warn('Failed to register custom fonts, falling back to system fonts.', error);
    }
  }

  /**
   * Generate position card image
   */
  async generatePositionCard(position: Position): Promise<Buffer> {
    try {
      const width = 800;
      const height = 400;
      const { canvas, ctx } = this.createBaseCanvas(width, height);

      // Background gradient
      this.drawVerticalGradient(ctx, 0, 0, width, height, this.colors.gradientStart, this.colors.gradientEnd);

      // Title
      this.drawText(ctx, `${position.tokenSymbol} Position`, 40, 50, 32, 'bold');

      // Position details
      const pnlColor = position.pnl >= 0 ? this.colors.green : this.colors.red;
      const pnlSign = position.pnl >= 0 ? '+' : '';

      this.drawLabelValue(ctx, 'Amount:', position.amount.toFixed(4), 40, 100);
      this.drawLabelValue(ctx, 'Value:', `${position.currentValue.toFixed(2)} CORE`, 40, 140);
      this.drawLabelValue(ctx, 'Entry:', `$${position.avgBuyPrice.toFixed(8)}`, 40, 180);
      this.drawLabelValue(ctx, 'Current:', `$${position.currentPrice.toFixed(8)}`, 40, 220);

      // P&L
      this.drawText(ctx, 'P&L', 40, 290, 24, 'normal');
      this.drawText(ctx, `${pnlSign}${position.pnlPercentage.toFixed(2)}%`, 200, 290, 48, 'bold', pnlColor);

      // Branding
      this.drawText(ctx, 'Core Meme Platform', width - 220, height - 20, 16, 'normal', this.colors.textSecondary);

      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Failed to generate position card:', error);
      throw error;
    }
  }

  /**
   * Generate portfolio summary image
   */
  async generatePortfolioCard(positions: Position[], totalValue: number, totalPnL: number): Promise<Buffer> {
    try {
      const width = 800;
      const height = 600;
      const { canvas, ctx } = this.createBaseCanvas(width, height);

      this.drawVerticalGradient(ctx, 0, 0, width, height, this.colors.gradientStart, this.colors.gradientEnd);

      // Title
      this.drawText(ctx, 'Portfolio Overview', 40, 50, 32, 'bold');

      // Summary stats
      this.drawText(ctx, `Total Value: ${totalValue.toFixed(2)} CORE`, 40, 110, 24);

      const pnlColor = totalPnL >= 0 ? this.colors.green : this.colors.red;
      const pnlSign = totalPnL >= 0 ? '+' : '';
      this.drawText(ctx, `Total P&L: ${pnlSign}${totalPnL.toFixed(2)} CORE`, 40, 150, 24, 'normal', pnlColor);

      // Top positions
      this.drawText(ctx, 'Top Positions:', 40, 210, 24);
      let yOffset = 250;
      for (let i = 0; i < Math.min(5, positions.length); i++) {
        const pos = positions[i];
        const posColor = pos.pnl >= 0 ? this.colors.green : this.colors.red;
        const posSign = pos.pnl >= 0 ? '+' : '';
        this.drawText(ctx, `${pos.tokenSymbol}: ${posSign}${pos.pnlPercentage.toFixed(2)}%`, 60, yOffset, 16, 'normal', posColor);
        yOffset += 40;
      }

      // Branding
      this.drawText(ctx, 'Core Meme Platform', width - 220, height - 20, 16, 'normal', this.colors.textSecondary);

      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Failed to generate portfolio card:', error);
      throw error;
    }
  }

  /**
   * Generate P&L chart image
   */
  async generatePnLChart(pnlData: PnLData): Promise<Buffer> {
    try {
      const width = 800;
      const height = 500;
      const { canvas, ctx } = this.createBaseCanvas(width, height);

      this.drawVerticalGradient(ctx, 0, 0, width, height, this.colors.gradientStart, this.colors.gradientEnd);

      // Title
      this.drawText(ctx, 'P&L Performance', 40, 50, 32, 'bold');

      // Stats
      const pnlColor = pnlData.totalPnL >= 0 ? this.colors.green : this.colors.red;
      const pnlSign = pnlData.totalPnL >= 0 ? '+' : '';
      this.drawText(ctx, `Total P&L: ${pnlSign}${pnlData.totalPnL.toFixed(2)} CORE`, 40, 110, 24, 'normal', pnlColor);
      this.drawText(ctx, `Win Rate: ${pnlData.winRate.toFixed(1)}%`, 40, 150, 24);
      this.drawText(ctx, `Trades: ${pnlData.totalTrades} (${pnlData.winningTrades}W/${pnlData.losingTrades}L)`, 40, 190, 24);

      // Chart area
      if (pnlData.dailyPnL && pnlData.dailyPnL.length > 0) {
        const chartX = 50;
        const chartY = 250;
        const chartWidth = 700;
        const chartHeight = 180;

        // Chart background
        this.drawRoundedRect(ctx, chartX, chartY, chartWidth, chartHeight, 10, this.colors.cardBg);

        // Line chart
        const maxAbs = Math.max(...pnlData.dailyPnL.map(d => Math.abs(d.total)), 1);
        const xStep = chartWidth / Math.max(pnlData.dailyPnL.length - 1, 1);

        for (let i = 1; i < pnlData.dailyPnL.length; i++) {
          const prevX = chartX + (i - 1) * xStep;
          const prevY = chartY + chartHeight / 2 - (pnlData.dailyPnL[i - 1].total / maxAbs) * (chartHeight / 2 - 10);
          const currX = chartX + i * xStep;
          const currY = chartY + chartHeight / 2 - (pnlData.dailyPnL[i].total / maxAbs) * (chartHeight / 2 - 10);

          const lineColor = pnlData.dailyPnL[i].total >= 0 ? this.colors.green : this.colors.red;
          this.drawLine(ctx, prevX, prevY, currX, currY, lineColor, 3);
        }
      }

      // Branding
      this.drawText(ctx, 'Core Meme Platform', width - 220, height - 20, 16, 'normal', this.colors.textSecondary);

      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Failed to generate P&L chart:', error);
      throw error;
    }
  }

  /**
   * Generate trade result image
   */
  async generateTradeResult(
    type: 'buy' | 'sell',
    tokenSymbol: string,
    amount: string,
    price: string,
    value: string,
    pnl?: { amount: number; percentage: number }
  ): Promise<Buffer> {
    try {
      const width = 800;
      const height = 400;
      const { canvas, ctx } = this.createBaseCanvas(width, height);

      this.drawVerticalGradient(ctx, 0, 0, width, height, this.colors.gradientStart, this.colors.gradientEnd);

      // Title
      const emoji = type === 'buy' ? '✅' : '💸';
      const action = type === 'buy' ? 'Buy' : 'Sell';
      this.drawText(ctx, `${emoji} ${action} Order Executed`, 40, 50, 32, 'bold');

      // Token info
      this.drawText(ctx, `Token: ${tokenSymbol}`, 40, 110, 24);
      this.drawText(ctx, `Amount: ${amount}`, 40, 150, 24);
      this.drawText(ctx, `Price: $${price}`, 40, 190, 24);
      this.drawText(ctx, `Value: ${value} CORE`, 40, 230, 24);

      // P&L for sell
      if (type === 'sell' && pnl) {
        const pnlColor = pnl.amount >= 0 ? this.colors.green : this.colors.red;
        const pnlSign = pnl.amount >= 0 ? '+' : '';
        this.drawText(ctx, `P&L: ${pnlSign}${pnl.percentage.toFixed(2)}%`, 40, 290, 32, 'bold', pnlColor);
      }

      // Success
      const successColor = type === 'buy' ? this.colors.green : this.colors.yellow;
      this.drawText(ctx, type === 'buy' ? 'Position Opened!' : 'Position Closed!', width / 2 - 100, 330, 24, 'normal', successColor);

      // Branding
      this.drawText(ctx, 'Core Meme Platform', width - 220, height - 20, 16, 'normal', this.colors.textSecondary);

      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Failed to generate trade result:', error);
      throw error;
    }
  }

  /**
   * Generate token info card
   */
  async generateTokenCard(tokenInfo: any): Promise<Buffer> {
    try {
      const width = 800;
      const height = 500;
      const { canvas, ctx } = this.createBaseCanvas(width, height);

      this.drawVerticalGradient(ctx, 0, 0, width, height, this.colors.gradientStart, this.colors.gradientEnd);

      // Title
      this.drawText(ctx, `${tokenInfo.symbol} / ${tokenInfo.name}`, 40, 50, 32, 'bold');

      // Price + change
      const changeColor = tokenInfo.priceChange24h >= 0 ? this.colors.green : this.colors.red;
      const changeSign = tokenInfo.priceChange24h >= 0 ? '+' : '';

      this.drawLabelValue(ctx, 'Price:', `$${tokenInfo.price.toFixed(8)}`, 40, 110);
      this.drawLabelValue(ctx, '24h Change:', `${changeSign}${tokenInfo.priceChange24h.toFixed(2)}%`, 40, 150, changeColor);

      // Market data
      this.drawLabelValue(ctx, 'Market Cap:', `$${this.formatNumber(tokenInfo.marketCap)}`, 40, 210);
      this.drawLabelValue(ctx, 'Liquidity:', `$${this.formatNumber(tokenInfo.liquidity)}`, 40, 250);
      this.drawLabelValue(ctx, 'Volume 24h:', `$${this.formatNumber(tokenInfo.volume24h)}`, 40, 290);
      this.drawLabelValue(ctx, 'Holders:', tokenInfo.holders.toString(), 40, 330);

      // Risk
      if (tokenInfo.isHoneypot) {
        this.drawText(ctx, '⚠️ HONEYPOT DETECTED', 40, 390, 24, 'bold', this.colors.red);
      }
      if (tokenInfo.rugScore > 50) {
        this.drawText(ctx, `Rug Score: ${tokenInfo.rugScore}/100`, 40, 430, 24, 'bold', this.colors.yellow);
      }

      // Branding
      this.drawText(ctx, 'Core Meme Platform', width - 220, height - 20, 16, 'normal', this.colors.textSecondary);

      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Failed to generate token card:', error);
      throw error;
    }
  }

  // ===== Canvas helpers =====

  private createBaseCanvas(width: number, height: number) {
    const canvas: Canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fill background first to avoid transparent artifacts
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    return { canvas, ctx } as { canvas: Canvas; ctx: SKRSContext2D };
  }

  private drawVerticalGradient(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    startColor: string,
    endColor: string
  ) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }

  private drawText(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    weight: 'normal' | 'bold' = 'normal',
    color: string = this.colors.text
  ) {
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  private drawLabelValue(
    ctx: SKRSContext2D,
    label: string,
    value: string,
    x: number,
    y: number,
    valueColor: string = this.colors.text
  ) {
    this.drawText(ctx, label, x, y, 16, 'normal', this.colors.textSecondary);
    this.drawText(ctx, value, x + 160, y, 24, 'normal', valueColor);
  }

  private drawRoundedRect(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fillColor: string
  ) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  private drawLine(
    ctx: SKRSContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    lineWidth: number = 2
  ) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  /**
   * Format number for display
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(2);
  }
}