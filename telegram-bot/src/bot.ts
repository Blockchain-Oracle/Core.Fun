import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import { AuthHandler } from './auth/AuthHandler';
import { WalletCommands } from './wallet/WalletCommands';
import { TradingCommands } from './trading/TradingCommands';
import { AlertCommands } from './alerts/AlertCommands';
import { SubscriptionCommands } from './subscription/SubscriptionCommands';
import { SessionManager } from './auth/SessionManager';
import { DatabaseService } from './services/DatabaseService';
import { WebSocketClient } from './services/WebSocketClient';
import { logger } from './utils/logger';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

export interface BotContext extends Context {
  session?: {
    userId?: string;
    telegramId?: number;
    username?: string;
    walletAddress?: string;
    isAuthenticated?: boolean;
    isPremium?: boolean;
    isPro?: boolean;
    pendingAction?: string;
  };
  db?: DatabaseService;
}

class CoreMemeBot {
  private bot: Telegraf<BotContext>;
  private authHandler: AuthHandler;
  private walletCommands: WalletCommands;
  private tradingCommands: TradingCommands;
  private alertCommands: AlertCommands;
  private subscriptionCommands: SubscriptionCommands;
  private sessionManager: SessionManager;
  private db: DatabaseService;
  private wsClient: WebSocketClient;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Telegraf<BotContext>(token);
    this.db = new DatabaseService();
    this.sessionManager = new SessionManager();
    
    // Initialize WebSocket client
    const wsUrl = process.env.WEBSOCKET_URL || 'ws://localhost:3003';
    this.wsClient = new WebSocketClient({ url: wsUrl });
    
    // Initialize handlers
    this.authHandler = new AuthHandler(this.db, this.sessionManager);
    this.walletCommands = new WalletCommands(this.db);
    this.tradingCommands = new TradingCommands(this.db);
    this.alertCommands = new AlertCommands(this.db);
    this.subscriptionCommands = new SubscriptionCommands(this.db);

    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
    this.setupWebSocketHandlers();
  }

  private setupMiddleware() {
    // Add database to context
    this.bot.use((ctx, next) => {
      ctx.db = this.db;
      return next();
    });

    // Session middleware
    this.bot.use(this.sessionManager.middleware());

    // Rate limiting
    this.bot.use(rateLimitMiddleware);

    // Error handling
    this.bot.catch(errorHandler);
  }

  private setupCommands() {
    // Public commands (no auth required)
    this.bot.command('start', async (ctx) => {
      const startPayload = ctx.message.text.split(' ')[1];
      if (startPayload?.startsWith('auth_')) {
        // Handle authentication flow
        await this.authHandler.handleAuthStart(ctx, startPayload);
      } else {
        // Regular start
        await this.authHandler.handleStart(ctx);
      }
    });

    this.bot.command('help', async (ctx) => {
      await this.sendHelpMessage(ctx);
    });

    // Authenticated commands
    this.bot.command('wallet', authMiddleware, async (ctx) => {
      await this.walletCommands.showWallet(ctx);
    });

    this.bot.command('balance', authMiddleware, async (ctx) => {
      await this.walletCommands.showBalance(ctx);
    });

    this.bot.command('withdraw', authMiddleware, async (ctx) => {
      await this.walletCommands.handleWithdraw(ctx);
    });

    this.bot.command('export', authMiddleware, async (ctx) => {
      await this.walletCommands.exportPrivateKey(ctx);
    });

    // Trading commands
    this.bot.command('buy', authMiddleware, async (ctx) => {
      await this.tradingCommands.handleBuy(ctx);
    });

    this.bot.command('sell', authMiddleware, async (ctx) => {
      await this.tradingCommands.handleSell(ctx);
    });

    this.bot.command('snipe', authMiddleware, async (ctx) => {
      await this.tradingCommands.handleSnipe(ctx);
    });

    this.bot.command('portfolio', authMiddleware, async (ctx) => {
      await this.tradingCommands.showPortfolio(ctx);
    });

    this.bot.command('trades', authMiddleware, async (ctx) => {
      await this.tradingCommands.showTradeHistory(ctx);
    });

    // Alert commands
    this.bot.command('alerts', authMiddleware, async (ctx) => {
      await this.alertCommands.manageAlerts(ctx);
    });

    this.bot.command('watchlist', authMiddleware, async (ctx) => {
      await this.alertCommands.showWatchlist(ctx);
    });

    this.bot.command('track', authMiddleware, async (ctx) => {
      await this.alertCommands.trackToken(ctx);
    });

    // Subscription commands
    this.bot.command('subscribe', authMiddleware, async (ctx) => {
      await this.subscriptionCommands.showSubscriptionPlans(ctx);
    });

    this.bot.command('subscription', authMiddleware, async (ctx) => {
      await this.subscriptionCommands.showCurrentSubscription(ctx);
    });

    this.bot.command('upgrade', authMiddleware, async (ctx) => {
      await this.subscriptionCommands.upgradeSubscription(ctx);
    });

    // Admin commands
    this.bot.command('admin', async (ctx) => {
      if (ctx.from?.id.toString() === process.env.ADMIN_TELEGRAM_ID) {
        await this.sendAdminPanel(ctx);
      }
    });

    // Handle text messages
    this.bot.on(message('text'), async (ctx) => {
      // Check if user is in a specific flow
      if (ctx.session?.pendingAction) {
        await this.handlePendingAction(ctx);
      }
    });
  }

  private setupCallbacks() {
    // Wallet callbacks
    this.bot.action('wallet_view', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.showWallet(ctx);
    });

    this.bot.action('wallet_export', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.confirmExportKey(ctx);
    });

    this.bot.action('wallet_add_trading', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.addTradingWallet(ctx);
    });

    this.bot.action('wallet_add_withdraw', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.addWithdrawWallet(ctx);
    });

    this.bot.action('wallet_manager', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.openWalletManager(ctx);
    });

    // Trading callbacks
    this.bot.action(/^buy_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.buyToken(ctx, tokenAddress);
    });

    this.bot.action(/^sell_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.sellToken(ctx, tokenAddress);
    });

    this.bot.action(/^snipe_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.setupSnipe(ctx, tokenAddress);
    });

    // Position and portfolio callbacks
    this.bot.action(/^position_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.viewPosition(ctx, tokenAddress);
    });

    this.bot.action('portfolio_view', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showPortfolio(ctx);
    });

    this.bot.action('refresh_portfolio', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery('Refreshing...');
      await this.tradingCommands.showPortfolio(ctx);
    });

    // P&L chart callbacks
    this.bot.action('view_pnl_chart', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.viewPnLChart(ctx, 7);
    });

    this.bot.action('pnl_chart_7', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.viewPnLChart(ctx, 7);
    });

    this.bot.action('pnl_chart_30', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.viewPnLChart(ctx, 30);
    });

    this.bot.action('pnl_chart_all', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.viewPnLChart(ctx, 365);
    });

    // Alert callbacks
    this.bot.action(/^alert_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const alertType = ctx.match[1];
      await this.alertCommands.toggleAlert(ctx, alertType);
    });

    // Subscription callbacks
    this.bot.action(/^subscribe_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const plan = ctx.match[1];
      await this.subscriptionCommands.processSubscription(ctx, plan);
    });

    // General callbacks
    this.bot.action('cancel', async (ctx) => {
      await ctx.answerCbQuery('Cancelled');
      await ctx.deleteMessage();
    });

    this.bot.action('back', async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendMainMenu(ctx);
    });
  }

  private async handlePendingAction(ctx: BotContext) {
    const action = ctx.session?.pendingAction;
    
    switch (action) {
      case 'import_wallet':
        // Handle wallet import
        break;
      case 'add_withdraw_address':
        // Handle adding withdraw address
        break;
      case 'buy_amount':
        // Handle buy amount input
        break;
      case 'sell_percentage':
        // Handle sell percentage input
        break;
      default:
        break;
    }
    
    // Clear pending action
    if (ctx.session) {
      ctx.session.pendingAction = undefined;
    }
  }

  private async sendHelpMessage(ctx: BotContext) {
    const helpText = `
🚀 *Core Meme Platform Bot*

*Wallet Commands:*
/wallet - View your wallet
/balance - Check balances
/withdraw - Withdraw funds
/export - Export private key

*Trading Commands:*
/buy [token] [amount] - Buy tokens
/sell [token] [%] - Sell tokens
/snipe [token] [amount] - Auto-buy on launch
/portfolio - View your holdings
/trades - Trade history

*Alert Commands:*
/alerts - Manage alerts
/watchlist - Your watchlist
/track [token] - Track a token

*Subscription:*
/subscribe - View plans
/subscription - Current subscription
/upgrade - Upgrade plan

*Other:*
/help - This message
/start - Main menu

*Support:* @CoreMemeSupport
*Website:* corememe.io
`;

    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  }

  private async sendMainMenu(ctx: BotContext) {
    const menuText = `
🎯 *Core Meme Platform*

Welcome to the premier meme token platform on Core Chain!

Select an option to get started:
`;

    const keyboard = [
      [{ text: '💼 Wallet', callback_data: 'wallet_view' }],
      [{ text: '📈 Trade', callback_data: 'trade_menu' }],
      [{ text: '🚨 Alerts', callback_data: 'alerts_menu' }],
      [{ text: '💎 Premium', callback_data: 'subscribe_menu' }],
      [{ text: '📊 Portfolio', callback_data: 'portfolio_view' }],
      [{ text: '⚙️ Settings', callback_data: 'settings_menu' }],
    ];

    await ctx.reply(menuText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  private async sendAdminPanel(ctx: BotContext) {
    const adminText = `
👨‍💼 *Admin Panel*

/broadcast [message] - Send to all users
/stats - Platform statistics
/users - User count
/volume - Trading volume
/tokens - Token statistics
`;

    await ctx.reply(adminText, { parse_mode: 'Markdown' });
  }

  private setupWebSocketHandlers() {
    // Handle WebSocket connection events
    this.wsClient.on('connected', () => {
      logger.info('Connected to WebSocket server');
      
      // Subscribe to channels
      this.wsClient.subscribe('alerts');
      this.wsClient.subscribe('tokens');
      this.wsClient.subscribe('trades', { tokens: ['*'] }); // Subscribe to all trades
      this.wsClient.subscribe('prices', { tokens: ['*'] }); // Subscribe to all price updates
    });

    this.wsClient.on('disconnected', () => {
      logger.warn('Disconnected from WebSocket server');
    });

    // Handle real-time alerts
    this.wsClient.on('alert', async (alert) => {
      try {
        // Get users subscribed to this alert type
        const subscribers = await this.db.getAlertSubscribers(alert.type);
        
        for (const userId of subscribers) {
          try {
            await this.bot.telegram.sendMessage(userId, 
              this.formatAlertMessage(alert), 
              { parse_mode: 'Markdown' }
            );
          } catch (error) {
            logger.error(`Failed to send alert to user ${userId}:`, error);
          }
        }
      } catch (error) {
        logger.error('Error handling alert:', error);
      }
    });

    // Handle new token events
    this.wsClient.on('new-token', async (token) => {
      try {
        // Get users subscribed to new token alerts
        const subscribers = await this.db.getNewTokenSubscribers();
        
        for (const userId of subscribers) {
          try {
            await this.bot.telegram.sendMessage(userId,
              this.formatNewTokenMessage(token),
              { 
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '🔍 View', callback_data: `view_token_${token.address}` },
                    { text: '💰 Buy', callback_data: `buy_${token.address}` },
                    { text: '🎯 Snipe', callback_data: `snipe_${token.address}` }
                  ]]
                }
              }
            );
          } catch (error) {
            logger.error(`Failed to send new token alert to user ${userId}:`, error);
          }
        }
      } catch (error) {
        logger.error('Error handling new token:', error);
      }
    });

    // Handle trade events
    this.wsClient.on('trade', async (trade) => {
      try {
        // Process copy trades
        await this.processCopyTrade(trade);
        
        // Send alerts for large trades
        if (trade.valueUSD > 10000) {
          const subscribers = await this.db.getWhaleAlertSubscribers();
          for (const userId of subscribers) {
            try {
              await this.bot.telegram.sendMessage(userId,
                this.formatTradeMessage(trade),
                { parse_mode: 'Markdown' }
              );
            } catch (error) {
              logger.error(`Failed to send trade alert to user ${userId}:`, error);
            }
          }
        }
      } catch (error) {
        logger.error('Error handling trade:', error);
      }
    });

    // Handle price updates
    this.wsClient.on('price-update', async (priceData) => {
      try {
        // Update cached prices
        await this.db.updateTokenPrice(priceData.tokenAddress, priceData.price);
        
        // Check for price alerts
        const alerts = await this.db.checkPriceAlerts(priceData.tokenAddress, priceData.price);
        
        for (const alert of alerts) {
          try {
            await this.bot.telegram.sendMessage(alert.userId,
              this.formatPriceAlertMessage(alert, priceData),
              { parse_mode: 'Markdown' }
            );
            
            // Mark alert as triggered
            await this.db.markAlertTriggered(alert.id);
          } catch (error) {
            logger.error(`Failed to send price alert to user ${alert.userId}:`, error);
          }
        }
      } catch (error) {
        logger.error('Error handling price update:', error);
      }
    });
  }

  private formatAlertMessage(alert: any): string {
    const emoji = this.getAlertEmoji(alert.type);
    return `${emoji} *${alert.type}*\n\n${alert.message}\n\nToken: \`${alert.tokenAddress}\`\nTime: ${new Date(alert.timestamp).toLocaleString()}`;
  }

  private formatNewTokenMessage(token: any): string {
    return `🆕 *New Token Launched*\n\n` +
           `Name: ${token.name}\n` +
           `Symbol: ${token.symbol}\n` +
           `Address: \`${token.address}\`\n` +
           `Liquidity: $${token.liquidityUSD?.toFixed(2) || '0'}\n` +
           `Security Score: ${token.securityScore || 'N/A'}/100`;
  }

  private formatTradeMessage(trade: any): string {
    const action = trade.type === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    return `${action} *Large Trade Detected*\n\n` +
           `Token: ${trade.tokenSymbol}\n` +
           `Value: $${trade.valueUSD.toFixed(2)}\n` +
           `Price Impact: ${trade.priceImpact?.toFixed(2) || '0'}%\n` +
           `Trader: \`${trade.trader}\``;
  }

  private formatPriceAlertMessage(alert: any, priceData: any): string {
    const direction = priceData.price > alert.targetPrice ? '📈' : '📉';
    return `${direction} *Price Alert Triggered*\n\n` +
           `Token: ${alert.tokenSymbol}\n` +
           `Current Price: $${priceData.price.toFixed(6)}\n` +
           `Target Price: $${alert.targetPrice.toFixed(6)}\n` +
           `24h Change: ${priceData.priceChange24h?.toFixed(2) || '0'}%`;
  }

  private getAlertEmoji(type: string): string {
    const emojis: Record<string, string> = {
      'NEW_TOKEN': '🆕',
      'LARGE_BUY': '🟢',
      'LARGE_SELL': '🔴',
      'WHALE_ACTIVITY': '🐋',
      'RUG_WARNING': '⚠️',
      'LIQUIDITY_ADDED': '💧',
      'LIQUIDITY_REMOVED': '🏃',
    };
    return emojis[type] || '📢';
  }

  private async processCopyTrade(trade: any) {
    // This would be implemented by the CopyTradeManager
    // Placeholder for now
    logger.debug('Processing copy trade:', trade);
  }

  async start() {
    try {
      // Initialize database
      await this.db.initialize();
      
      // Connect to WebSocket server
      this.wsClient.connect();
      
      // Set bot commands
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'wallet', description: 'View your wallet' },
        { command: 'balance', description: 'Check balance' },
        { command: 'buy', description: 'Buy tokens' },
        { command: 'sell', description: 'Sell tokens' },
        { command: 'portfolio', description: 'View portfolio' },
        { command: 'alerts', description: 'Manage alerts' },
        { command: 'subscribe', description: 'Premium features' },
        { command: 'help', description: 'Help and commands' },
      ]);

      // Launch bot
      if (process.env.NODE_ENV === 'production' && process.env.TELEGRAM_WEBHOOK_URL) {
        // Use webhook in production
        const webhookUrl = `${process.env.TELEGRAM_WEBHOOK_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
        await this.bot.telegram.setWebhook(webhookUrl);
        logger.info(`Webhook set to: ${webhookUrl}`);
      } else {
        // Use polling in development
        await this.bot.launch();
        logger.info('Bot started in polling mode');
      }

      // Enable graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));

    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  async stop(signal: string) {
    logger.info(`Stopping bot (${signal})...`);
    this.wsClient.disconnect();
    await this.db.close();
    this.bot.stop(signal);
  }
}

// Start the bot
const bot = new CoreMemeBot();
bot.start().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});