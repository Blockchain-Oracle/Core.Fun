import { createCanvas, registerFont } from 'canvas';
import type { Canvas, CanvasRenderingContext2D } from 'canvas';
import path from 'path';
import { Position } from '../trading/PositionManager';
import { PnLData, DailyPnL } from '../trading/PnLCalculator';
import { createLogger } from '@core-meme/shared';

const logger = createLogger({ service: 'image-generator' });

// Register custom fonts if available
try {
  // You can add custom fonts here
  // registerFont(path.join(__dirname, '../assets/fonts/Inter-Bold.ttf'), { family: 'Inter', weight: 'bold' });
  // registerFont(path.join(__dirname, '../assets/fonts/Inter-Regular.ttf'), { family: 'Inter', weight: 'normal' });
} catch (error) {
  logger.warn('Custom fonts not found, using system fonts');
}

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

  /**
   * Generate position card image
   */
  async generatePositionCard(position: Position): Promise<Buffer> {
    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background gradient
    this.drawBackground(ctx, width, height);

    // Card background
    this.drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 16, this.colors.cardBg);

    // Header section
    this.drawHeader(ctx, position, width);

    // Price section
    this.drawPriceSection(ctx, position, width);

    // P&L section
    this.drawPnLSection(ctx, position, width);

    // Footer info
    this.drawFooter(ctx, position, width, height);

    // Add decorative elements
    this.addDecorations(ctx, position, width, height);

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate portfolio summary image
   */
  async generatePortfolioCard(positions: Position[], totalValue: number, totalPnL: number): Promise<Buffer> {
    const width = 600;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    this.drawBackground(ctx, width, height);

    // Card
    this.drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 16, this.colors.cardBg);

    // Title
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText('💼 Portfolio Overview', 40, 60);

    // Total value
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`${totalValue.toFixed(2)} CORE`, 40, 110);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText('Total Value', 40, 135);

    // P&L
    const pnlColor = totalPnL >= 0 ? this.colors.green : this.colors.red;
    const pnlSign = totalPnL >= 0 ? '+' : '';
    const pnlPercentage = totalValue > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0;
    
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = pnlColor;
    ctx.fillText(`${pnlSign}${totalPnL.toFixed(2)} CORE (${pnlSign}${pnlPercentage.toFixed(2)}%)`, 40, 180);

    // Positions list
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText('Top Positions', 40, 230);

    let yPos = 260;
    for (const position of positions.slice(0, 5)) {
      this.drawMiniPosition(ctx, position, 40, yPos, width - 80);
      yPos += 45;
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate P&L chart image
   */
  async generatePnLChart(pnlData: PnLData): Promise<Buffer> {
    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    this.drawBackground(ctx, width, height);

    // Card
    this.drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 16, this.colors.cardBg);

    // Title
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText('📊 P&L Performance', 40, 60);

    // Summary stats
    this.drawPnLSummary(ctx, pnlData, width);

    // Chart
    if (pnlData.dailyPnL.length > 0) {
      this.drawDailyChart(ctx, pnlData.dailyPnL, 40, 200, width - 80, 150);
    }

    return canvas.toBuffer('image/png');
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
    const width = 500;
    const height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    this.drawBackground(ctx, width, height);

    // Card
    this.drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 16, this.colors.cardBg);

    // Status icon and title
    const emoji = type === 'buy' ? '✅' : '💰';
    const action = type === 'buy' ? 'Buy' : 'Sell';
    const color = type === 'buy' ? this.colors.green : this.colors.yellow;

    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = color;
    ctx.fillText(`${emoji} ${action} Executed`, 40, 60);

    // Token info
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(tokenSymbol, 40, 100);

    // Trade details
    ctx.font = '16px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText(`Amount: ${amount}`, 40, 140);
    ctx.fillText(`Price: $${price}`, 40, 165);
    ctx.fillText(`Value: ${value} CORE`, 40, 190);

    // P&L for sells
    if (type === 'sell' && pnl) {
      const pnlColor = pnl.amount >= 0 ? this.colors.green : this.colors.red;
      const pnlSign = pnl.amount >= 0 ? '+' : '';
      
      ctx.font = 'bold 18px Arial';
      ctx.fillStyle = pnlColor;
      ctx.fillText(
        `P&L: ${pnlSign}${pnl.amount.toFixed(2)} CORE (${pnlSign}${pnl.percentage.toFixed(2)}%)`,
        40,
        230
      );
    }

    // Success badge
    this.drawSuccessBadge(ctx, width - 100, 40, type);

    return canvas.toBuffer('image/png');
  }

  /**
   * Generate token info card
   */
  async generateTokenCard(tokenInfo: any): Promise<Buffer> {
    const width = 600;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    this.drawBackground(ctx, width, height);

    // Card
    this.drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 16, this.colors.cardBg);

    // Token header
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`${tokenInfo.symbol}`, 40, 60);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText(tokenInfo.name, 40, 85);

    // Price and change
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`$${this.formatPrice(tokenInfo.price)}`, 40, 130);

    const changeColor = tokenInfo.priceChange24h >= 0 ? this.colors.green : this.colors.red;
    const changeSign = tokenInfo.priceChange24h >= 0 ? '+' : '';
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = changeColor;
    ctx.fillText(`${changeSign}${tokenInfo.priceChange24h.toFixed(2)}%`, 40, 165);

    // Market stats grid
    this.drawTokenStats(ctx, tokenInfo, 40, 200, width - 80);

    // Safety indicators
    this.drawSafetyIndicators(ctx, tokenInfo, 40, 340, width - 80);

    return canvas.toBuffer('image/png');
  }

  // Helper methods

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, this.colors.gradientStart);
    gradient.addColorStop(1, this.colors.gradientEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: string
  ) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  private drawHeader(ctx: CanvasRenderingContext2D, position: Position, width: number) {
    // Token symbol and name
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(position.tokenSymbol, 40, 70);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    const tokenName = position.tokenName.length > 20 
      ? position.tokenName.substring(0, 20) + '...' 
      : position.tokenName;
    ctx.fillText(tokenName, 40, 95);

    // Amount held
    ctx.font = '18px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.textAlign = 'right';
    ctx.fillText(`${this.formatAmount(position.amount)} tokens`, width - 40, 70);
    ctx.textAlign = 'left';
  }

  private drawPriceSection(ctx: CanvasRenderingContext2D, position: Position, width: number) {
    const yStart = 130;
    
    // Current value
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`${position.currentValue.toFixed(2)} CORE`, 40, yStart);

    // Price comparison
    ctx.font = '14px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText('Entry', 40, yStart + 35);
    ctx.fillText('Current', 200, yStart + 35);

    ctx.font = '16px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`$${this.formatPrice(position.avgBuyPrice)}`, 40, yStart + 55);
    ctx.fillText(`$${this.formatPrice(position.currentPrice)}`, 200, yStart + 55);
  }

  private drawPnLSection(ctx: CanvasRenderingContext2D, position: Position, width: number) {
    const yStart = 240;
    const isProfit = position.pnl >= 0;
    const pnlColor = isProfit ? this.colors.green : this.colors.red;
    const pnlSign = isProfit ? '+' : '';

    // P&L box
    const boxWidth = width - 80;
    this.drawRoundedRect(ctx, 40, yStart, boxWidth, 70, 12, isProfit ? '#00D87A20' : '#FF3B6920');

    // P&L amount
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = pnlColor;
    ctx.fillText(
      `${pnlSign}${position.pnl.toFixed(2)} CORE`,
      60,
      yStart + 35
    );

    // P&L percentage
    ctx.font = 'bold 20px Arial';
    ctx.fillText(
      `(${pnlSign}${position.pnlPercentage.toFixed(2)}%)`,
      60,
      yStart + 60
    );

    // P&L indicator arrow
    const arrowX = width - 100;
    const arrowY = yStart + 35;
    ctx.beginPath();
    if (isProfit) {
      ctx.moveTo(arrowX, arrowY + 10);
      ctx.lineTo(arrowX + 15, arrowY - 10);
      ctx.lineTo(arrowX + 30, arrowY + 10);
    } else {
      ctx.moveTo(arrowX, arrowY - 10);
      ctx.lineTo(arrowX + 15, arrowY + 10);
      ctx.lineTo(arrowX + 30, arrowY - 10);
    }
    ctx.strokeStyle = pnlColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  private drawFooter(ctx: CanvasRenderingContext2D, position: Position, width: number, height: number) {
    const yStart = height - 70;

    ctx.font = '14px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    
    // Hold time
    ctx.fillText(`⏱ ${this.formatTimeDiff(position.firstBuyTime)}`, 40, yStart);
    
    // Trades count
    ctx.fillText(`📊 ${position.trades} trades`, 200, yStart);
    
    // Last update
    const updateTime = new Date(position.lastUpdateTime).toLocaleTimeString();
    ctx.fillText(`Updated: ${updateTime}`, width - 180, yStart);
  }

  private drawMiniPosition(
    ctx: CanvasRenderingContext2D,
    position: Position,
    x: number,
    y: number,
    width: number
  ) {
    // Background
    const bgColor = position.pnl >= 0 ? '#00D87A10' : '#FF3B6910';
    this.drawRoundedRect(ctx, x, y, width, 40, 8, bgColor);

    // Symbol
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(position.tokenSymbol, x + 15, y + 25);

    // Value
    ctx.font = '14px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText(`${position.currentValue.toFixed(2)} CORE`, x + 150, y + 25);

    // P&L
    const pnlColor = position.pnl >= 0 ? this.colors.green : this.colors.red;
    const pnlSign = position.pnl >= 0 ? '+' : '';
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = pnlColor;
    ctx.textAlign = 'right';
    ctx.fillText(`${pnlSign}${position.pnlPercentage.toFixed(2)}%`, x + width - 15, y + 25);
    ctx.textAlign = 'left';
  }

  private drawPnLSummary(ctx: CanvasRenderingContext2D, pnlData: PnLData, width: number) {
    const yStart = 100;

    // Total P&L
    const totalColor = pnlData.totalPnL >= 0 ? this.colors.green : this.colors.red;
    const totalSign = pnlData.totalPnL >= 0 ? '+' : '';
    
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = totalColor;
    ctx.fillText(
      `${totalSign}${pnlData.totalPnL.toFixed(2)} CORE (${totalSign}${pnlData.totalPnLPercentage.toFixed(2)}%)`,
      40,
      yStart
    );

    // Win rate
    ctx.font = '16px Arial';
    ctx.fillStyle = this.colors.text;
    ctx.fillText(`Win Rate: ${pnlData.winRate.toFixed(1)}%`, 40, yStart + 35);
    ctx.fillText(`Trades: ${pnlData.totalTrades}`, 200, yStart + 35);
    ctx.fillText(`${pnlData.winningTrades}W / ${pnlData.losingTrades}L`, 320, yStart + 35);
  }

  private drawDailyChart(
    ctx: CanvasRenderingContext2D,
    dailyPnL: DailyPnL[],
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const days = dailyPnL.slice(-7); // Last 7 days
    if (days.length === 0) return;

    const barWidth = width / days.length * 0.6;
    const spacing = width / days.length * 0.4;
    const maxValue = Math.max(...days.map(d => Math.abs(d.total)));

    days.forEach((day, _index) => {
      const barX = x + _index * (barWidth + spacing);
      const barHeight = (Math.abs(day.total) / maxValue) * height * 0.7;
      const barY = day.total >= 0 ? y + height - barHeight : y + height;

      // Bar
      ctx.fillStyle = day.total >= 0 ? this.colors.green : this.colors.red;
      ctx.fillRect(barX, barY - (day.total >= 0 ? barHeight : 0), barWidth, barHeight);

      // Day label
      ctx.font = '12px Arial';
      ctx.fillStyle = this.colors.textSecondary;
      ctx.textAlign = 'center';
      const date = new Date(day.date);
      const label = date.toLocaleDateString('en', { weekday: 'short' });
      ctx.fillText(label, barX + barWidth / 2, y + height + 15);
      ctx.textAlign = 'left';
    });
  }

  private drawTokenStats(ctx: CanvasRenderingContext2D, tokenInfo: any, x: number, y: number, width: number) {
    const stats = [
      { label: 'Market Cap', value: `$${this.formatNumber(tokenInfo.marketCap)}` },
      { label: 'Liquidity', value: `$${this.formatNumber(tokenInfo.liquidity)}` },
      { label: '24h Volume', value: `$${this.formatNumber(tokenInfo.volume24h)}` },
      { label: 'Holders', value: tokenInfo.holders.toString() },
    ];

    const boxWidth = width / 2 - 10;
    stats.forEach((stat, index) => {
      const boxX = x + (index % 2) * (boxWidth + 20);
      const boxY = y + Math.floor(index / 2) * 60;

      // Box
      this.drawRoundedRect(ctx, boxX, boxY, boxWidth, 50, 8, '#1E2341');

      // Label
      ctx.font = '12px Arial';
      ctx.fillStyle = this.colors.textSecondary;
      ctx.fillText(stat.label, boxX + 10, boxY + 20);

      // Value
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = this.colors.text;
      ctx.fillText(stat.value, boxX + 10, boxY + 40);
    });
  }

  private drawSafetyIndicators(ctx: CanvasRenderingContext2D, tokenInfo: any, x: number, y: number, width: number) {
    // Honeypot indicator
    const isHoneypot = tokenInfo.isHoneypot;
    const honeypotColor = isHoneypot ? this.colors.red : this.colors.green;
    const honeypotText = isHoneypot ? '⚠️ HONEYPOT' : '✅ SAFE';

    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = honeypotColor;
    ctx.fillText(honeypotText, x, y);

    // Rug score
    const rugScore = tokenInfo.rugScore || 0;
    const rugColor = rugScore > 70 ? this.colors.red : rugScore > 40 ? this.colors.yellow : this.colors.green;
    
    ctx.font = '14px Arial';
    ctx.fillStyle = this.colors.textSecondary;
    ctx.fillText('Rug Score:', x + 150, y);
    
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = rugColor;
    ctx.fillText(`${rugScore}/100`, x + 230, y);

    // Score bar
    const barX = x + 300;
    const barWidth = 200;
    const barHeight = 10;
    
    // Background
    ctx.fillStyle = '#1E2341';
    ctx.fillRect(barX, y - 10, barWidth, barHeight);
    
    // Fill
    ctx.fillStyle = rugColor;
    ctx.fillRect(barX, y - 10, (rugScore / 100) * barWidth, barHeight);
  }

  private drawSuccessBadge(ctx: CanvasRenderingContext2D, x: number, y: number, type: 'buy' | 'sell') {
    const color = type === 'buy' ? this.colors.green : this.colors.yellow;
    
    // Circle
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = color + '20';
    ctx.fill();
    
    // Check mark or dollar sign
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(type === 'buy' ? '✓' : '$', x, y + 8);
    ctx.textAlign = 'left';
  }

  private addDecorations(ctx: CanvasRenderingContext2D, position: Position, width: number, height: number) {
    // Profit/Loss corner badge
    const isProfit = position.pnl >= 0;
    const badgeColor = isProfit ? this.colors.green : this.colors.red;
    
    ctx.save();
    ctx.translate(width - 40, 40);
    ctx.rotate(Math.PI / 4);
    
    ctx.fillStyle = badgeColor + '30';
    ctx.fillRect(-30, -10, 60, 20);
    
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = badgeColor;
    ctx.textAlign = 'center';
    ctx.fillText(isProfit ? 'PROFIT' : 'LOSS', 0, 4);
    
    ctx.restore();
  }

  private formatPrice(price: number): string {
    if (price < 0.00001) return price.toExponential(2);
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  }

  private formatAmount(amount: number): string {
    if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(2)}B`;
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`;
    return amount.toFixed(2);
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  }

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