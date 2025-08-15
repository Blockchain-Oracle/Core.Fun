import { Markup } from 'telegraf';
import { BotContext } from '../bot';
import { DatabaseService } from '../services/DatabaseService';
import { TradingExecutor } from './TradingExecutor';
import { PositionManager } from './PositionManager';
import { PnLCalculator } from './PnLCalculator';
import { CopyTradeManager } from './CopyTradeManager';
import { ImageGenerator } from '../services/ImageGenerator';
import { createLogger } from '@core-meme/shared';

export class TradingCommands {
  private logger = createLogger({ service: 'trading-commands' });
  private db: DatabaseService;
  private tradingExecutor: TradingExecutor;
  private positionManager: PositionManager;
  private pnlCalculator: PnLCalculator;
  private copyTradeManager: CopyTradeManager;
  private imageGenerator: ImageGenerator;

  constructor(db: DatabaseService) {
    this.db = db;
    this.tradingExecutor = new TradingExecutor(db);
    this.positionManager = new PositionManager(db);
    this.pnlCalculator = new PnLCalculator(db);
    this.copyTradeManager = new CopyTradeManager(db, this.tradingExecutor);
    this.imageGenerator = new ImageGenerator();
  }

  /**
   * Handle /buy command
   */
  async handleBuy(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      return this.showBuyHelp(ctx);
    }

    const tokenAddress = args[0];
    const amount = args[1];

    // Validate token address
    if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
      await ctx.reply('❌ Invalid token address');
      return;
    }

    // If amount not specified, show buy panel
    if (!amount) {
      return this.showBuyPanel(ctx, tokenAddress);
    }

    // Execute buy
    await this.executeBuyTrade(ctx, tokenAddress, amount);
  }

  /**
   * Show buy panel with token info
   */
  private async showBuyPanel(ctx: BotContext, tokenAddress: string) {
    const loadingMsg = await ctx.reply('🔄 Loading complete token data...');

    try {
      // Get COMPLETE token info including ALL metadata
      const tokenInfo = await this.tradingExecutor.getTokenInfo(tokenAddress);
      
      // Delete loading message first
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      
      // CRITICAL: Display token image if available
      if (tokenInfo.image_url || tokenInfo.imageUrl || tokenInfo.image) {
        const imageUrl = tokenInfo.image_url || tokenInfo.imageUrl || tokenInfo.image;
        if (imageUrl) {
          try {
            await ctx.replyWithPhoto(imageUrl, {
              caption: `🖼️ *${tokenInfo.symbol}* Token Image`,
              parse_mode: 'Markdown'
            });
          } catch (imgError) {
            this.logger.warn('Failed to send token image:', imgError);
          }
        }
      }
      
      // Format COMPLETE message with ALL data
      let message = `💰 *${tokenInfo.symbol} / ${tokenInfo.name}*\n`;
      message += `━━━━━━━━━━━━━━━━━━\n\n`;
      
      // DESCRIPTION - MUST SHOW
      if (tokenInfo.description) {
        message += `📝 *Description:*\n${tokenInfo.description}\n\n`;
      }
      
      // MARKET DATA
      message += `📊 *Market Data:*\n`;
      message += `├ Price: $${tokenInfo.price?.toFixed(8) || '0.00'}\n`;
      message += `├ 24h: ${(tokenInfo.priceChange24h || 0) > 0 ? '📈' : '📉'} ${(tokenInfo.priceChange24h || 0).toFixed(2)}%\n`;
      message += `├ Market Cap: $${this.formatNumber(tokenInfo.marketCap || 0)}\n`;
      message += `├ Liquidity: $${this.formatNumber(tokenInfo.liquidity || 0)}\n`;
      message += `├ Volume 24h: $${this.formatNumber(tokenInfo.volume24h || 0)}\n`;
      message += `└ Holders: ${tokenInfo.holders || 0}\n\n`;
      
      // BONDING CURVE PROGRESS - MUST SHOW
      const isCreated = tokenInfo.status === 'CREATED';
      const isLaunched = tokenInfo.status === 'LAUNCHED' || tokenInfo.status === 'GRADUATED';
      
      if (isCreated || !isLaunched) {
        // Get bonding curve data with safe fallbacks
        const bondingCurve = tokenInfo.bondingCurve || { raisedAmount: 0, targetAmount: 3, progress: 0 };
        const raisedAmount = tokenInfo.raised || 
                          (bondingCurve && 'raisedAmount' in bondingCurve ? bondingCurve.raisedAmount : 0);
        const targetAmount = (bondingCurve && 'targetAmount' in bondingCurve ? bondingCurve.targetAmount : 3);
        const progress = tokenInfo.graduationPercentage || 
                        (bondingCurve && 'progress' in bondingCurve ? bondingCurve.progress : 0) || 
                        (raisedAmount / targetAmount * 100);
                        
        message += `📈 *Bonding Curve:*\n`;
        message += `├ Progress: ${Number(progress).toFixed(1)}% to graduation\n`;
        message += `├ Raised: ${raisedAmount} CORE\n`;
        message += `├ Target: ${targetAmount} CORE\n`;
        message += `└ Status: ${Number(progress) >= 100 ? '✅ Ready to Graduate' : '🔄 Bonding Active'}\n\n`;
      }
      
      // TRADING CONTROLS - MUST SHOW
      if (tokenInfo.maxWallet || tokenInfo.maxTransaction || tokenInfo.tradingEnabled !== undefined) {
        message += `🔒 *Trading Controls:*\n`;
        message += `├ Trading: ${tokenInfo.tradingEnabled ? '✅ Enabled' : '🔴 Disabled'}\n`;
        if (tokenInfo.maxWallet && tokenInfo.maxWallet !== '0') {
          message += `├ Max Wallet: ${(Number(tokenInfo.maxWallet) / 1e18).toFixed(2)} tokens\n`;
        }
        if (tokenInfo.maxTransaction && tokenInfo.maxTransaction !== '0') {
          message += `├ Max TX: ${(Number(tokenInfo.maxTransaction) / 1e18).toFixed(2)} tokens\n`;
        }
        message += `\n`;
      }
      
      // SAFETY WARNINGS
      if (tokenInfo.isHoneypot) {
        message += `⚠️ *WARNING: HONEYPOT DETECTED*\n`;
      }
      if (tokenInfo.rugScore && tokenInfo.rugScore > 50) {
        message += `⚠️ *High Rug Score: ${tokenInfo.rugScore}/100*\n`;
      }
      
      message += `\n📋 *Contract:* \`${tokenAddress}\``;

      // Create COMPLETE keyboard with social links and buy buttons
      const keyboard = [];
      
      // SOCIAL LINK BUTTONS - MUST HAVE
      const socialButtons = [];
      if (tokenInfo.twitter) {
        socialButtons.push(
          Markup.button.url('🐦 Twitter', tokenInfo.twitter)
        );
      }
      if (tokenInfo.telegram) {
        socialButtons.push(
          Markup.button.url('💬 Telegram', tokenInfo.telegram)
        );
      }
      if (tokenInfo.website) {
        socialButtons.push(
          Markup.button.url('🌐 Website', tokenInfo.website)
        );
      }
      if (socialButtons.length > 0) {
        keyboard.push(socialButtons);
      }
      
      // Buy amount buttons
      keyboard.push([
        Markup.button.callback('0.1 CORE', `buy_amount_${tokenAddress}_0.1`),
        Markup.button.callback('0.25 CORE', `buy_amount_${tokenAddress}_0.25`),
        Markup.button.callback('0.5 CORE', `buy_amount_${tokenAddress}_0.5`),
      ]);
      keyboard.push([
        Markup.button.callback('1 CORE', `buy_amount_${tokenAddress}_1`),
        Markup.button.callback('2 CORE', `buy_amount_${tokenAddress}_2`),
        Markup.button.callback('5 CORE', `buy_amount_${tokenAddress}_5`),
      ]);
      keyboard.push([
        Markup.button.callback('💰 Custom Amount', `buy_custom_${tokenAddress}`),
        Markup.button.callback('🦍 Ape (Max)', `buy_ape_${tokenAddress}`),
      ]);
      keyboard.push([
        Markup.button.callback('📊 Chart', `chart_${tokenAddress}`),
        Markup.button.url('🔍 Explorer', `https://scan.coredao.org/address/${tokenAddress}`),
      ]);
      keyboard.push([
        Markup.button.callback('❌ Cancel', 'cancel'),
      ]);

      // Send the complete message with all data
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      this.logger.error('Failed to show buy panel:', error);
      // Try to delete loading message if it still exists
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      } catch {}
      await ctx.reply('❌ Failed to load token info');
    }
  }

  /**
   * Execute buy trade
   */
  private async executeBuyTrade(ctx: BotContext, tokenAddress: string, amount: string) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('⏳ Executing buy order...');

    try {
      const result = await this.tradingExecutor.executeBuy({
        userId: ctx.session.userId,
        walletAddress: ctx.session.walletAddress!,
        tokenAddress,
        amount,
        type: 'buy',
      });

      if (result.success) {
        // Generate trade result image
        const tokenInfo = await this.tradingExecutor.getTokenInfo(tokenAddress);

        // Delete loading message
        await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

        // Send trade result image
        const keyboard = [
          [
            Markup.button.callback('📊 View Position', `position_${tokenAddress}`),
            Markup.button.callback('💸 Sell', `sell_${tokenAddress}`),
          ],
          [
            Markup.button.url('🔍 View TX', `https://scan.coredao.org/tx/${result.transactionHash}`),
          ],
        ];

        // Send success message (image generation currently disabled)
        await ctx.reply(`✅ *Buy Order Executed!*\n${tokenInfo.symbol} purchased successfully\n\n` +
                        `Amount: ${result.amountOut}\n` +
                        `Price: $${result.price}\n` +
                        `Total: ${result.amountIn} CORE\n` +
                        `Transaction: [View](https://scan.coredao.org/tx/${result.transactionHash})`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          `❌ Buy order failed: ${result.error}`
        );
      }
    } catch (error) {
      this.logger.error('Buy trade failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to execute buy order'
      );
    }
  }

  /**
   * Handle /sell command
   */
  async handleSell(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      return this.showSellPositions(ctx);
    }

    const tokenAddress = args[0];
    const percentage = args[1];

    if (!percentage) {
      return this.showSellPanel(ctx, tokenAddress);
    }

    await this.executeSellTrade(ctx, tokenAddress, parseFloat(percentage));
  }

  /**
   * Show sell positions
   */
  private async showSellPositions(ctx: BotContext) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const positions = await this.positionManager.getUserPositions(ctx.session.userId);

    if (positions.length === 0) {
      await ctx.reply('❌ You have no positions to sell');
      return;
    }

    let message = `📊 *Your Positions*\n━━━━━━━━━━━━━━━━━━\n`;
    const buttons = [];

    for (const position of positions.slice(0, 10)) {
      const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
      const pnlSign = position.pnl >= 0 ? '+' : '';

      message += `\n*${position.tokenSymbol}*\n`;
      message += `Value: ${position.currentValue.toFixed(2)} CORE\n`;
      message += `${pnlEmoji} P&L: ${pnlSign}${position.pnlPercentage.toFixed(2)}%\n`;

      buttons.push([
        Markup.button.callback(
          `Sell ${position.tokenSymbol}`,
          `sell_${position.tokenAddress}`
        ),
      ]);
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  /**
   * Show sell panel with position image
   */
  private async showSellPanel(ctx: BotContext, tokenAddress: string) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Loading position...');
    const position = await this.positionManager.getPosition(ctx.session.userId, tokenAddress);

    if (!position) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ You have no position in this token'
      );
      return;
    }

    try {
      // Generate position card image
      let positionImage;
      try {
        positionImage = await this.imageGenerator.generatePositionCard(position);
      } catch (imageError) {
        this.logger.warn('Image generation failed, using text response:', imageError);
        positionImage = null;
      }

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

      const keyboard = [
        [
          Markup.button.callback('Sell 25%', `sell_amount_${tokenAddress}_25`),
          Markup.button.callback('Sell 50%', `sell_amount_${tokenAddress}_50`),
          Markup.button.callback('Sell 75%', `sell_amount_${tokenAddress}_75`),
        ],
        [
          Markup.button.callback('Sell 100%', `sell_amount_${tokenAddress}_100`),
          Markup.button.callback('🚨 Emergency Sell', `sell_emergency_${tokenAddress}`),
        ],
        [
          Markup.button.callback('💰 Custom %', `sell_custom_${tokenAddress}`),
          Markup.button.callback('🔄 Refresh', `refresh_position_${tokenAddress}`),
        ],
      ];

      const pnlSign = position.pnl >= 0 ? '+' : '';
      const caption = `💸 *${position.tokenSymbol} Position*\n` +
        `P&L: ${pnlSign}${position.pnlPercentage.toFixed(2)}%\n\n` +
        `Amount: ${position.amount}\n` +
        `Current Value: ${position.currentValue.toFixed(2)} CORE\n` +
        `Entry Price: $${position.avgBuyPrice}\n` +
        `Current Price: $${position.currentPrice}`;

      if (positionImage) {
        await ctx.replyWithPhoto(
          { source: positionImage },
          {
            caption,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard },
          }
        );
      } else {
        await ctx.reply(caption, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      }
    } catch (error) {
      this.logger.error('Failed to show position:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to load position'
      );
    }
  }

  /**
   * Execute sell trade
   */
  private async executeSellTrade(ctx: BotContext, tokenAddress: string, percentage: number) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('⏳ Executing sell order...');

    try {
      const result = await this.tradingExecutor.executeSell({
        userId: ctx.session.userId,
        walletAddress: ctx.session.walletAddress!,
        tokenAddress,
        amount: '0',
        type: 'sell',
        percentage,
      });

      if (result.success) {
        // Get position for P&L calculation
        const position = await this.positionManager.getPosition(ctx.session.userId, tokenAddress);
        
        // Generate trade result image with P&L
        const tokenInfo = await this.tradingExecutor.getTokenInfo(tokenAddress);
        const pnl = position ? {
          amount: position.pnl * (percentage / 100),
          percentage: position.pnlPercentage
        } : undefined;
        
        // Trade image generation removed - handled by text message above

        // Delete loading message
        await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

        // Send trade result image
        const keyboard = [
          [
            Markup.button.callback('📊 View P&L', 'view_pnl'),
            Markup.button.callback('💼 Portfolio', 'portfolio_view'),
          ],
          [
            Markup.button.url('🔍 View TX', `https://scan.coredao.org/tx/${result.transactionHash}`),
          ],
        ];

        // Send success message (image generation currently disabled)
        await ctx.reply(`✅ *Sell Order Executed!*\n${tokenInfo.symbol} sold successfully\n\n` +
                        `Amount: ${result.amountIn}\n` +
                        `Price: $${result.price}\n` +
                        `Total: ${result.amountOut} CORE\n` +
                        `Transaction: [View](https://scan.coredao.org/tx/${result.transactionHash})`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          `❌ Sell order failed: ${result.error}`
        );
      }
    } catch (error) {
      this.logger.error('Sell trade failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to execute sell order'
      );
    }
  }

  /**
   * Handle /snipe command
   */
  async handleSnipe(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length < 2) {
      await ctx.reply(
        `🎯 *Snipe Usage:*\n\n` +
        `\`/snipe [token_address] [amount]\`\n\n` +
        `Example: \`/snipe 0x123... 1\`\n\n` +
        `This will auto-buy when liquidity is added.`,
        { parse_mode: 'Markdown' }
      );
    }

    const tokenAddress = args[0];
    const amount = args[1];

    // Create snipe order
    await ctx.reply(
      `🎯 *Snipe Order Created*\n\n` +
      `Token: \`${tokenAddress}\`\n` +
      `Amount: ${amount} CORE\n\n` +
      `I'll execute this as soon as liquidity is detected!`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Show portfolio with custom image
   */
  async showPortfolio(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Generating portfolio...');

    try {
      const summary = await this.positionManager.getPositionSummary(ctx.session.userId);
      const positions = await this.positionManager.getUserPositions(ctx.session.userId);

      if (positions.length === 0) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          `💼 *Your Portfolio*\n\n` +
          `You have no open positions.\n` +
          `Use /buy to start trading!`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

      // Send portfolio summary (image generation disabled)
      const keyboard = [
        [
          Markup.button.callback('📊 View Positions', 'positions_detailed'),
          Markup.button.callback('📈 P&L Chart', 'view_pnl_chart'),
        ],
        [
          Markup.button.callback('🔄 Refresh', 'refresh_portfolio'),
          Markup.button.callback('📤 Share', 'share_portfolio'),
        ],
      ];

      const pnlSign = summary.totalPnL >= 0 ? '+' : '';
      const caption = `💼 *Portfolio Overview*\n\n` +
        `Positions: ${summary.totalPositions}\n` +
        `Total Value: ${summary.totalValue.toFixed(2)} CORE\n` +
        `Total P&L: ${pnlSign}${summary.totalPnL.toFixed(2)} CORE`;

      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      this.logger.error('Failed to show portfolio:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to load portfolio'
      );
    }
  }

  /**
   * Show trade history with P&L chart
   */
  async showTradeHistory(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Generating P&L report...');

    try {
      const pnlData = await this.pnlCalculator.calculateUserPnL(ctx.session.userId, 7);
      
      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

      // Send P&L chart
      const keyboard = [
        [
          Markup.button.callback('📅 7 Days', 'pnl_7d'),
          Markup.button.callback('📅 30 Days', 'pnl_30d'),
          Markup.button.callback('📅 All Time', 'pnl_all'),
        ],
        [
          Markup.button.callback('📊 Details', 'pnl_details'),
          Markup.button.callback('📤 Export', 'export_trades'),
        ],
      ];

      const summary = `📊 *P&L Performance*\n` +
        `Win Rate: ${pnlData.winRate.toFixed(1)}% (${pnlData.winningTrades}W/${pnlData.losingTrades}L)\n` +
        `Total: ${pnlData.totalPnL >= 0 ? '+' : ''}${pnlData.totalPnL.toFixed(2)} CORE`;

      // Send P&L summary (image generation disabled)
      await ctx.reply(summary, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      this.logger.error('Failed to show trade history:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to load trade history'
      );
    }
  }

  /**
   * Handle buy button callbacks
   */
  async buyToken(ctx: BotContext, tokenAddress: string) {
    await this.showBuyPanel(ctx, tokenAddress);
  }

  /**
   * Handle sell button callbacks
   */
  async sellToken(ctx: BotContext, tokenAddress: string) {
    await this.showSellPanel(ctx, tokenAddress);
  }

  /**
   * Setup snipe order
   */
  async setupSnipe(ctx: BotContext, tokenAddress: string) {
    await ctx.reply(
      `🎯 *Setup Snipe*\n\n` +
      `Token: \`${tokenAddress}\`\n\n` +
      `Enter the amount of CORE to snipe with:`,
      { parse_mode: 'Markdown' }
    );

    if (ctx.session) {
      ctx.session.pendingAction = `snipe_${tokenAddress}`;
    }
  }

  /**
   * Show buy help
   */
  private async showBuyHelp(ctx: BotContext) {
    await ctx.reply(
      `💸 *Buy Command*\n\n` +
      `Usage: \`/buy [token_address] [amount]\`\n\n` +
      `Examples:\n` +
      `\`/buy 0x123...abc\` - Shows buy panel\n` +
      `\`/buy 0x123...abc 1\` - Buy with 1 CORE\n\n` +
      `You can also use:\n` +
      `• /ape [token] - Max buy with high slippage\n` +
      `• /snipe [token] [amount] - Auto-buy on launch`,
      { parse_mode: 'Markdown' }
    );
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

  /**
   * Handle view position with image
   */
  async viewPosition(ctx: BotContext, tokenAddress: string): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Loading position...');
    const position = await this.positionManager.getPosition(ctx.session.userId, tokenAddress);

    if (!position) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ No position found'
      );
      return;
    }

    try {
      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

      const keyboard = [
        [
          Markup.button.callback('💸 Sell', `sell_${tokenAddress}`),
          Markup.button.callback('🔄 Refresh', `refresh_position_${tokenAddress}`),
        ],
        [
          Markup.button.callback('📊 Portfolio', 'portfolio_view'),
        ],
      ];

      const pnlSign = position.pnl >= 0 ? '+' : '';
      const caption = `📊 *${position.tokenSymbol} Position*\n\n` +
        `Amount: ${position.amount}\n` +
        `Current Value: ${position.currentValue.toFixed(2)} CORE\n` +
        `Entry Price: $${position.avgBuyPrice}\n` +
        `Current Price: $${position.currentPrice}\n` +
        `P&L: ${pnlSign}${position.pnlPercentage.toFixed(2)}%`;

      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      this.logger.error('Failed to show position:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to load position'
      );
    }
  }

  /**
   * Handle P&L chart view
   */
  async viewPnLChart(ctx: BotContext, days: number = 7): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Generating P&L chart...');

    try {
      const pnlData = await this.pnlCalculator.calculateUserPnL(ctx.session.userId, days);

      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

      const keyboard = [
        [
          Markup.button.callback('📅 7D', 'pnl_chart_7'),
          Markup.button.callback('📅 30D', 'pnl_chart_30'),
          Markup.button.callback('📅 All', 'pnl_chart_all'),
        ],
        [
          Markup.button.callback('📊 Portfolio', 'portfolio_view'),
        ],
      ];

      const pnlSign = pnlData.totalPnL >= 0 ? '+' : '';
      const caption = `📈 *P&L Chart (${days} days)*\n\n` +
        `Total P&L: ${pnlSign}${pnlData.totalPnL.toFixed(2)} CORE\n` +
        `Win Rate: ${pnlData.winRate.toFixed(1)}%\n` +
        `Trades: ${pnlData.totalTrades} (${pnlData.winningTrades}W/${pnlData.losingTrades}L)`;

      await ctx.reply(caption, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      this.logger.error('Failed to show P&L chart:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to generate chart'
      );
    }
  }

  /**
   * Show trading menu
   */
  async showTradingMenu(ctx: BotContext): Promise<void> {
    const menuText = `📈 *Trading Hub*\n\n` +
      `Welcome to Core Meme Trading! Choose your action:`;

    const keyboard = [
      [
        { text: '💰 Buy Token', callback_data: 'trading_buy' },
        { text: '💸 Sell Token', callback_data: 'trading_sell' },
      ],
      [
        { text: '🎯 Snipe Token', callback_data: 'trading_snipe' },
        { text: '📊 Portfolio', callback_data: 'portfolio_view' },
      ],
      [
        { text: '📜 Trade History', callback_data: 'trade_history' },
        { text: '📈 P&L Chart', callback_data: 'view_pnl_chart' },
      ],
      [
        { text: '🔙 Main Menu', callback_data: 'back' },
      ],
    ];

    await ctx.reply(menuText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}