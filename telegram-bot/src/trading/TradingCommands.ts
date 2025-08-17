import { Markup } from 'telegraf';
import { BotContext } from '../bot';
import { DatabaseService, WalletService } from '@core-meme/shared';
import { TradingExecutor } from './TradingExecutor';
import { PositionManager } from './PositionManager';
import { PnLCalculator } from './PnLCalculator';
import { MemeFactoryCopyTrader } from './MemeFactoryCopyTrader';
import { ImageGenerator } from '../services/ImageGenerator';
import { createLogger } from '@core-meme/shared';
import { ethers } from 'ethers';

export class TradingCommands {
  private logger = createLogger({ service: 'trading-commands' });
  private db: DatabaseService;
  private walletService: WalletService;
  private tradingExecutor: TradingExecutor;
  private positionManager: PositionManager;
  private pnlCalculator: PnLCalculator;
  private copyTrader: MemeFactoryCopyTrader;
  private imageGenerator: ImageGenerator;

  constructor(db: DatabaseService) {
    this.db = db;
    this.walletService = new WalletService(db);
    this.tradingExecutor = new TradingExecutor(db);
    this.positionManager = new PositionManager(db);
    this.pnlCalculator = new PnLCalculator(db);
    this.copyTrader = new MemeFactoryCopyTrader(db);
    this.imageGenerator = new ImageGenerator();
  }

  /**
   * Quick command to buy CMP (platform staking token)
   */
  async handleBuyCMP(ctx: BotContext): Promise<void> {
    const CMP_ADDRESS = process.env.PLATFORM_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);
    const amount = args[0];

    // Check CMP token status first
    try {
      const info = await this.tradingExecutor.getTokenInfo(CMP_ADDRESS);
      if (!info.isOpen) {
        await ctx.reply(
          'ℹ️ CMP is the platform staking token and is not sold via the bonding curve.\n\n' +
          'To stake, you need CMP in your wallet and a little CORE for gas.\n\n' +
          'Options:\n' +
          '• Get CMP from the team faucet/airdrop (dev)\n' +
          '• Receive CMP from another wallet\n' +
          '• Once listed, buy on a DEX',
          { parse_mode: 'Markdown' }
        );
        return;
      }
    } catch {}

    if (!amount) {
      // Show buy panel for CMP with preset buttons
      await this.showBuyPanel(ctx, CMP_ADDRESS);
      return;
    }

    // Execute a direct buy of CMP
    await this.executeBuyTrade(ctx, CMP_ADDRESS, amount);
  }

  /**
   * Handle /buy command
   */
  async handleBuy(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      return this.showAvailableTokens(ctx);
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
        Markup.button.url('🔍 Explorer', `${process.env.EXPLORER_URL || 'https://scan.test2.btcs.network'}/address/${tokenAddress}`),
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
            Markup.button.url('🔍 View TX', `${process.env.EXPLORER_URL || 'https://scan.test2.btcs.network'}/tx/${result.transactionHash}`),
          ],
        ];

        // Send success message (image generation currently disabled)
        await ctx.reply(`✅ *Buy Order Executed!*\n${tokenInfo.symbol} purchased successfully\n\n` +
                        `Amount: ${result.amountOut}\n` +
                        `Price: $${result.price}\n` +
                        `Total: ${result.amountIn} CORE\n` +
                        `Transaction: [View](${process.env.EXPLORER_URL || 'https://scan.test2.btcs.network'}/tx/${result.transactionHash})`, {
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
    
    // DEBUG LOGGING
    this.logger.info('ShowSellPanel - Looking up position:', {
      userId: ctx.session.userId,
      tokenAddress: tokenAddress,
      sessionData: ctx.session
    });
    
    const position = await this.positionManager.getPosition(ctx.session.userId, tokenAddress);
    
    // DEBUG LOGGING
    this.logger.info('ShowSellPanel - Position lookup result:', {
      found: !!position,
      position: position ? {
        id: position.id,
        tokenAddress: position.tokenAddress,
        amount: position.amount,
        tokenSymbol: position.tokenSymbol
      } : null
    });

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
            Markup.button.url('🔍 View TX', `${process.env.EXPLORER_URL || 'https://scan.test2.btcs.network'}/tx/${result.transactionHash}`),
          ],
        ];

        // Send success message (image generation currently disabled)
        await ctx.reply(`✅ *Sell Order Executed!*\n${tokenInfo.symbol} sold successfully\n\n` +
                        `Amount: ${result.amountIn}\n` +
                        `Price: $${result.price}\n` +
                        `Total: ${result.amountOut} CORE\n` +
                        `Transaction: [View](${process.env.EXPLORER_URL || 'https://scan.test2.btcs.network'}/tx/${result.transactionHash})`, {
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
    await ctx.reply(
      '🎯 Snipe is coming soon!\n\n' +
      'We\'re finalizing the liquidity-detection and auto-execution flow.\n' +
      'You\'ll be able to pre-arm a buy that triggers on launch.',
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
   * Execute sell with percentage
   */
  async executeSellWithPercentage(ctx: BotContext, tokenAddress: string, percentage: number, isEmergency: boolean = false) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    // DEBUG LOGGING
    this.logger.info('ExecuteSellWithPercentage - Called with:', {
      userId: ctx.session.userId,
      tokenAddress: tokenAddress,
      percentage: percentage,
      isEmergency: isEmergency,
      sessionData: ctx.session
    });

    // Check if user has a position
    const position = await this.positionManager.getPosition(ctx.session.userId, tokenAddress);
    
    // DEBUG LOGGING
    this.logger.info('ExecuteSellWithPercentage - Position lookup result:', {
      found: !!position,
      position: position ? {
        id: position.id,
        tokenAddress: position.tokenAddress,
        amount: position.amount,
        tokenSymbol: position.tokenSymbol
      } : null
    });
    
    if (!position) {
      await ctx.reply('❌ You have no position in this token');
      return;
    }

    // For emergency sell, use higher slippage tolerance
    if (isEmergency) {
      await ctx.reply('🚨 Executing emergency sell with 15% slippage tolerance...');
    }

    await this.executeSellTrade(ctx, tokenAddress, percentage);
  }

  /**
   * Setup snipe order
   */
  async setupSnipe(ctx: BotContext, tokenAddress: string) {
    await ctx.reply(
      '🎯 Snipe is coming soon!\n\n' +
      'We\'re finalizing the liquidity-detection and auto-execution flow.\n' +
      'You\'ll be able to pre-arm a buy that triggers on launch.',
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Show available tokens for trading
   */
  private async showAvailableTokens(ctx: BotContext) {
    const loadingMsg = await ctx.reply('🔍 Loading available tokens...');

    try {
      // Fetch tokens from the API (we'll use the API client)
      const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/tokens`);
      const data = await response.json();

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);

      const responseData = data as any;
      if (!responseData.success || !responseData.tokens || responseData.tokens.length === 0) {
        await ctx.reply(
          '📭 *No Tokens Available*\n\n' +
          'No tokens are currently available for trading.\n\n' +
          'You can still trade by pasting a token address directly into the chat.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Show top 10 tokens with trading buttons
      const tokens = responseData.tokens.slice(0, 10);
      
      let message = `🛒 *Available Tokens*\n\n`;
      message += `Choose a token to trade:\n\n`;

      const keyboard = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const progress = token.graduationPercentage || 0;
        const status = progress >= 100 ? '✅' : progress >= 80 ? '🔥' : '📈';
        
        message += `${i + 1}. ${status} *${token.symbol}*\n`;
        message += `   ${token.name}\n`;
        message += `   Price: ${this.formatTokenPrice(token.price)}\n`;
        message += `   Progress: ${progress.toFixed(1)}%\n\n`;

        // Add buy button for each token
        keyboard.push([
          Markup.button.callback(`💰 Buy ${token.symbol}`, `buy_${token.address}`)
        ]);
      }

      message += `\n💡 *Tip:* You can also paste any token address directly to get a preview!`;

      // Add navigation buttons
      keyboard.push([
        Markup.button.callback('🔄 Refresh', 'refresh_tokens'),
        Markup.button.callback('📊 Top Tokens', 'view_trending')
      ]);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });

    } catch (error) {
      this.logger.error('Failed to fetch available tokens:', error);
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      } catch {}
      await ctx.reply(
        '❌ Failed to load available tokens.\n\n' +
        'You can still trade by pasting a token address directly into the chat.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Format token price in a human-readable way
   */
  private formatTokenPrice(price: number): string {
    if (!price || price === 0) {
      return '$0.00';
    }
    
    // For very small prices, show in a readable format
    if (price < 0.00001) {
      // Show as "X tokens per $1" for tiny prices
      const tokensPerDollar = 1 / price;
      if (tokensPerDollar > 1000000000) {
        return `${(tokensPerDollar / 1000000000).toFixed(2)}B per $1`;
      } else if (tokensPerDollar > 1000000) {
        return `${(tokensPerDollar / 1000000).toFixed(2)}M per $1`;
      } else if (tokensPerDollar > 1000) {
        return `${Math.floor(tokensPerDollar).toLocaleString()} per $1`;
      }
    }
    
    // For small but reasonable prices
    if (price < 0.01) {
      return `$${price.toFixed(6)}`;
    } else if (price < 1) {
      return `$${price.toFixed(4)}`;
    } else if (price < 100) {
      return `$${price.toFixed(2)}`;
    } else if (price < 1000000) {
      return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
    
    // For very large prices (probably an error)
    return `$${price.toExponential(2)}`;
  }

  /**
   * Public method to get token info (for bot.ts)
   */
  async getTokenInfo(tokenAddress: string): Promise<any> {
    return await this.tradingExecutor.getTokenInfo(tokenAddress);
  }

  /**
   * Execute buy with specific amount
   */
  async executeBuyWithAmount(ctx: any, tokenAddress: string, amount: string) {
    try {
      // Resolve internal user id (UUID) from session or telegram id
      let userId = ctx.session?.userId as string | undefined;
      if (!userId) {
        const tgUser = await this.db.getUserByTelegramId(ctx.from!.id);
        if (!tgUser) {
          await ctx.reply('❌ Please /start the bot first to create your account.');
          return;
        }
        userId = tgUser.id;
      }
      const amountNum = parseFloat(amount);
      
      if (isNaN(amountNum) || amountNum <= 0) {
        await ctx.reply('❌ Invalid amount. Please try again.');
        return;
      }

      // Show loading message
      const loadingMsg = await ctx.reply('🔄 Processing your buy order...');
      
      // Balance validation (ensure user has enough CORE for amount + gas)
      try {
        const user = await this.db.getUserById(userId);
        if (!user || !user.walletAddress) {
          await ctx.reply('❌ No wallet found. Please set up your wallet first with /wallet');
          return;
        }
        const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network');
        const balance = await provider.getBalance(user.walletAddress);
        const balanceInCore = parseFloat(ethers.formatEther(balance));
        const gasBuffer = 0.005; // leave small buffer for gas
        if (balanceInCore < amountNum + gasBuffer) {
          await ctx.reply(`❌ Insufficient balance. Available: ${balanceInCore.toFixed(4)} CORE`);
          return;
        }
      } catch {}

      // Execute the buy
      const result = await this.tradingExecutor.executeBuy({
        userId,
        tokenAddress,
        amount: amountNum.toString(),
        type: 'buy',
        slippage: 5
      });
      
      // Delete loading message
      await ctx.deleteMessage(loadingMsg.message_id);
      
      if (result.success) {
        const explorer = process.env.EXPLORER_URL || 'https://scan.test2.btcs.network';
        const txUrl = `${explorer}/tx/${result.txHash || result.transactionHash}`;
        await ctx.reply(
          `✅ Buy order executed!\n` +
          `💰 Spent: ${result.amountIn} CORE\n` +
          `📈 Received: ${result.amountOut} tokens\n` +
          `📋 TX: ${txUrl}`
        );
      } else {
        await ctx.reply(`❌ Buy failed: ${result.error}`);
      }
    } catch (error) {
      this.logger.error('Error executing buy with amount:', error);
      await ctx.reply('❌ Failed to execute buy order. Please try again.');
    }
  }

  /**
   * Execute buy with maximum available balance
   */
  async executeBuyMax(ctx: any, tokenAddress: string) {
    try {
      // Resolve internal user id (UUID) from session or telegram id
      let userId = ctx.session?.userId as string | undefined;
      if (!userId) {
        const tgUser = await this.db.getUserByTelegramId(ctx.from!.id);
        if (!tgUser) {
          await ctx.reply('❌ Please /start the bot first to create your account.');
          return;
        }
        userId = tgUser.id;
      }
      
      // Get user's wallet info
      const user = await this.db.getUserById(userId);
      if (!user || !user.walletAddress) {
        await ctx.reply('❌ No wallet found. Please set up your wallet first with /wallet');
        return;
      }
      
      // Get balance from wallet
      const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network');
      const balance = await provider.getBalance(user.walletAddress);
      const balanceInCore = parseFloat(ethers.formatEther(balance));
      
      if (balanceInCore <= 0.01) {
        await ctx.reply('❌ Insufficient balance. Please add funds first.');
        return;
      }
      
      // Use 95% of balance to leave some for gas
      const maxAmount = balanceInCore * 0.95;
      
      await ctx.reply(
        `🦍 Aping in with ${maxAmount.toFixed(4)} CORE!\n` +
        `⚠️ This will use 95% of your balance.\n\n` +
        `Confirm?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Confirm', callback_data: `buy_amount_${tokenAddress}_${maxAmount}` },
                { text: '❌ Cancel', callback_data: 'cancel' }
              ]
            ]
          }
        }
      );
    } catch (error) {
      this.logger.error('Error executing max buy:', error);
      await ctx.reply('❌ Failed to check balance. Please try again.');
    }
  }

  /**
   * Show token chart
   */
  async showChart(ctx: any, tokenAddress: string) {
    try {
      await ctx.reply('📊 Chart feature coming soon!');
      // TODO: Implement chart generation
    } catch (error) {
      this.logger.error('Error showing chart:', error);
      await ctx.reply('❌ Failed to load chart.');
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
      `\`/buy\` - Show available tokens\n` +
      `\`/buy 0x123...abc\` - Shows buy panel\n` +
      `\`/buy 0x123...abc 1\` - Buy with 1 CORE\n\n` +
      `You can also:\n` +
      `• Paste any token address for instant preview\n` +
      `• Use /ape [token] - Max buy with high slippage\n` +
      `• Use /snipe [token] [amount] - Auto-buy on launch`,
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
        { text: '🤝 Copy Trading', callback_data: 'copy_trading_menu' },
        { text: '🏆 Top Traders', callback_data: 'view_top_traders' },
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

  /**
   * Copy Trading Methods
   */
  async handleCopyTradeMenu(ctx: BotContext): Promise<void> {
    await ctx.reply(
      '🤝 *Copy Trading*\n\n' +
      'Copy successful traders automatically!\n\n' +
      '• Start copying: `/copytrade <wallet>`\n' +
      '• Stop copying: `/copystop <wallet>`\n' +
      '• View active: `/copylist`\n' +
      '• Top traders: `/toptraders`\n' +
      '• Analyze wallet: `/analyze <wallet>`\n\n' +
      '⚡ Copy slots based on staking tier:\n' +
      '• Bronze: 1 slot\n' +
      '• Silver: 3 slots\n' +
      '• Gold: 5 slots\n' +
      '• Platinum: 10 slots',
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏆 View Top Traders', 'view_toptraders')],
          [Markup.button.callback('📋 My Copy Trades', 'view_following')],
          [Markup.button.callback('🔙 Back', 'trade_menu')]
        ])
      }
    );
  }

  async showFollowing(ctx: BotContext): Promise<void> {
    await ctx.reply(
      '📋 *Your Copy Trades*\n\n' +
      'Use `/copylist` command to view your active copy trades.\n\n' +
      'Or use the dedicated copy trading commands:\n' +
      '• `/copytrade <wallet>` - Start copying\n' +
      '• `/copystop <wallet>` - Stop copying',
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'copy_trading_menu')]
        ])
      }
    );
  }

  async showTopTraders(ctx: BotContext): Promise<void> {
    await ctx.reply(
      '🏆 *Top Traders*\n\n' +
      'Use `/toptraders` command to view the best performing traders.\n\n' +
      'You can also analyze any wallet with:\n' +
      '• `/analyze <wallet>` - View performance stats',
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'copy_trading_menu')]
        ])
      }
    );
  }

  async followWallet(ctx: BotContext, wallet: string): Promise<void> {
    await ctx.reply(
      `🤝 *Follow Wallet*\n\n` +
      `Wallet: \`${wallet}\`\n\n` +
      `Use \`/copytrade ${wallet}\` to start copying this trader.`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'copy_trading_menu')]
        ])
      }
    );
  }

  async unfollowWallet(ctx: BotContext, wallet: string): Promise<void> {
    await ctx.reply(
      `🚫 *Unfollow Wallet*\n\n` +
      `Wallet: \`${wallet}\`\n\n` +
      `Use \`/copystop ${wallet}\` to stop copying this trader.`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'copy_trading_menu')]
        ])
      }
    );
  }

  async showCopySettings(ctx: BotContext, wallet: string): Promise<void> {
    await ctx.reply(
      `⚙️ *Copy Settings*\n\n` +
      `Wallet: \`${wallet}\`\n\n` +
      `Copy trading settings will be available in future updates.\n` +
      `For now, use the basic copy commands.`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'copy_trading_menu')]
        ])
      }
    );
  }

  async showCopyHistory(ctx: BotContext): Promise<void> {
    await ctx.reply(
      '📊 *Copy Trading History*\n\n' +
      'Your copy trading history will be displayed here.\n\n' +
      'Use `/copylist` to view active copy trades.',
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'copy_trading_menu')]
        ])
      }
    );
  }
}