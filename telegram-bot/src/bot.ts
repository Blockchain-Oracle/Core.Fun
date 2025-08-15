import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import { AuthHandler } from './auth/AuthHandler';
import { WalletCommands } from './wallet/WalletCommands';
import { TradingCommands } from './trading/TradingCommands';
import { AlertCommands } from './alerts/AlertCommands';
import { StakingCommands } from './staking/StakingCommands';
import { CopyTradingCommands } from './commands/CopyTradingCommands';
import { SessionManager } from './auth/SessionManager';
import { DatabaseService } from '@core-meme/shared';
import { SocketIOClient } from './services/SocketIOClient';
import { WebhookHandler } from './services/WebhookHandler';
import { createLogger } from '@core-meme/shared';
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
    authToken?: string;
    isAuthenticated?: boolean;
    isPremium?: boolean;
    isPro?: boolean;
    pendingAction?: string;
    awaitingInput?: string;
  };
  db?: DatabaseService;
}

class CoreMemeBot {
  private bot: Telegraf<BotContext>;
  private authHandler: AuthHandler;
  private walletCommands: WalletCommands;
  private tradingCommands: TradingCommands;
  private alertCommands: AlertCommands;
  private stakingCommands: StakingCommands;
  private copyTradingCommands: CopyTradingCommands;
  private sessionManager: SessionManager;
  private db: DatabaseService;
  private wsClient: SocketIOClient;
  private webhookHandler: WebhookHandler;
  private logger = createLogger({ service: 'telegram-bot' });

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Telegraf<BotContext>(token);
    this.db = new DatabaseService();
    this.sessionManager = new SessionManager();
    
    // Initialize Socket.IO client
    const wsUrl = process.env.WEBSOCKET_URL || 'http://localhost:8081';
    this.wsClient = new SocketIOClient({ 
      url: wsUrl.replace('ws://', 'http://').replace('wss://', 'https://') 
    });
    
    // Initialize handlers
    this.authHandler = new AuthHandler(this.db, this.sessionManager);
    this.walletCommands = new WalletCommands(this.db);
    this.tradingCommands = new TradingCommands(this.db);
    this.alertCommands = new AlertCommands(this.db);
    this.stakingCommands = new StakingCommands(this.db, this.walletCommands.walletService);
    this.copyTradingCommands = new CopyTradingCommands();
    
    // Initialize webhook handler for Web App authentication
    const webhookPort = parseInt(process.env.WEBHOOK_PORT || '3002');
    this.webhookHandler = new WebhookHandler(this.db, this.sessionManager, webhookPort);

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
        // Handle authentication flow from web app
        await this.authHandler.handleAuthStart(ctx, startPayload);
      } else if (startPayload === 'webapp_auth') {
        // Handle web app authentication request
        await this.authHandler.handleWebAppAuthRequest(ctx);
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

    // Subscription commands (now using staking)
    this.bot.command('subscription', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleSubscription(ctx);
    });
    
    // Add /subscribe alias for convenience
    this.bot.command('subscribe', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleSubscription(ctx);
    });

    // Staking commands
    this.bot.command('stake', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleStake(ctx);
    });

    this.bot.command('unstake', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleUnstake(ctx);
    });

    this.bot.command('claim', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleClaim(ctx);
    });

    this.bot.command('tiers', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleTiers(ctx);
    });

    // Copy Trading commands - FULLY EXPOSED!
    this.bot.command('copytrade', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleStartCopyTrading(ctx);
    });

    this.bot.command('copystop', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleStopCopyTrading(ctx);
    });

    this.bot.command('copylist', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleListCopyTrades(ctx);
    });

    this.bot.command('toptraders', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleTopTraders(ctx);
    });

    this.bot.command('analyze', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleAnalyzeWallet(ctx);
    });

    // Legacy aliases for compatibility
    this.bot.command('follow', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleStartCopyTrading(ctx);
    });

    this.bot.command('unfollow', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleStopCopyTrading(ctx);
    });

    this.bot.command('following', authMiddleware, async (ctx) => {
      await this.copyTradingCommands.handleListCopyTrades(ctx);
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

    this.bot.action('get_web_link', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.authHandler.handleWebAppAuthRequest(ctx);
    });

    // Menu callbacks
    this.bot.action('trade_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showTradingMenu(ctx);
    });

    // Copy Trading callbacks
    this.bot.action('copy_trading_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
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
            [Markup.button.callback('🏆 View Top Traders', 'view_top_traders')],
            [Markup.button.callback('📋 My Copy Trades', 'view_copy_list')],
            [Markup.button.callback('🔙 Back', 'trade_menu')]
          ])
        }
      );
    });

    this.bot.action('view_top_traders', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.copyTradingCommands.handleTopTraders(ctx);
    });

    this.bot.action('view_copy_list', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.copyTradingCommands.handleListCopyTrades(ctx);
    });

    this.bot.action('alerts_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.manageAlerts(ctx);
    });

    this.bot.action('subscribe_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.stakingCommands.handleSubscription(ctx); // Use staking-based subscription system
    });

    this.bot.action('settings_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendSettingsMenu(ctx);
    });

    this.bot.action('settings_notifications', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔔 **Notification Settings**\n\n' +
        '• New Tokens: ✅ Enabled\n' +
        '• Price Alerts: ✅ Enabled\n' +
        '• Trade Confirmations: ✅ Enabled\n' +
        '• Large Transactions: ⚠️ Premium Only\n' +
        '• Whale Alerts: ⚠️ Pro Only\n\n' +
        'Click on any option to toggle on/off',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'settings_menu')]
          ])
        }
      );
    });

    this.bot.action('settings_security', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🔒 **Security Settings**\n\n' +
        '• Two-Factor Auth: ❌ Disabled\n' +
        '• Transaction PIN: ❌ Disabled\n' +
        '• Auto-Lock: 15 minutes\n' +
        '• IP Whitelist: ❌ Disabled\n\n' +
        'Security features help protect your account',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔐 Export Private Key', 'wallet_export')],
            [Markup.button.callback('🔙 Back', 'settings_menu')]
          ])
        }
      );
    });

    this.bot.action('settings_trading', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📊 **Trading Settings**\n\n' +
        '• Default Slippage: 5%\n' +
        '• Gas Price: Standard\n' +
        '• Max Gas: 0.01 CORE\n' +
        '• Auto-Approve: ✅ Enabled\n' +
        '• MEV Protection: ⚠️ Pro Only\n\n' +
        'Adjust your default trading parameters',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'settings_menu')]
          ])
        }
      );
    });

    this.bot.action('dashboard', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendMainMenu(ctx);
    });

    // Wallet action callbacks
    this.bot.action('add_funds', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.showAddFunds(ctx);
    });

    this.bot.action('withdraw', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.handleWithdraw(ctx);
    });

    this.bot.action('add_wallet_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.addTradingWallet(ctx);
    });

    this.bot.action('confirm_export_key', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.confirmExportKey(ctx);
    });

    this.bot.action('refresh_balance', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery('Refreshing...');
      await this.walletCommands.showBalance(ctx);
    });

    // Copy Trading callbacks
    this.bot.action('copytrade_menu', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.handleCopyTradeMenu(ctx);
    });

    this.bot.action('view_following', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showFollowing(ctx);
    });

    this.bot.action('view_toptraders', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showTopTraders(ctx);
    });

    this.bot.action('start_copy', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📋 *Start Copy Trading*\n\n' +
        'Enter the wallet address you want to copy:\n\n' +
        'Example: `0x123...abc`',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Cancel', 'copytrade_menu')]
          ])
        }
      );
      if (ctx.session) {
        ctx.session.awaitingInput = 'copy_wallet_address';
      }
    });

    this.bot.action(/^follow_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = ctx.match[1];
      await this.tradingCommands.followWallet(ctx, wallet);
    });

    this.bot.action(/^unfollow_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = ctx.match[1];
      await this.tradingCommands.unfollowWallet(ctx, wallet);
    });

    this.bot.action(/^copysettings_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = ctx.match[1];
      await this.tradingCommands.showCopySettings(ctx, wallet);
    });

    this.bot.action('view_copyhistory', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showCopyHistory(ctx);
    });

    // Trading callbacks
    this.bot.action('trading_buy', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '💰 **Buy Token**\n\n' +
        'Please send the token address you want to buy:\n\n' +
        'Example: `0x123...abc`',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Cancel', 'trade_menu')]
          ])
        }
      );
      if (ctx.session) {
        ctx.session.awaitingInput = 'buy_token_address';
      }
    });

    this.bot.action('trading_sell', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showPortfolio(ctx);
    });

    this.bot.action('trading_snipe', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '🎯 **Snipe Token**\n\n' +
        'Enter the token address to snipe on launch:\n\n' +
        'Example: `0x123...abc`',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Cancel', 'trade_menu')]
          ])
        }
      );
      if (ctx.session) {
        ctx.session.awaitingInput = 'snipe_token_address';
      }
    });

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

    // Trade history callback
    this.bot.action('trade_history', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.tradingCommands.showTradeHistory(ctx);
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

    this.bot.action('create_alert', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.createAlert(ctx);
    });

    this.bot.action('view_all_alerts', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.viewAllAlerts(ctx);
    });

    this.bot.action('delete_alert', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.deleteAlert(ctx);
    });

    this.bot.action('alert_history', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.alertHistory(ctx);
    });

    this.bot.action(/^delete_alert_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const alertId = ctx.match[1];
      await this.alertCommands.confirmDeleteAlert(ctx, alertId);
    });

    this.bot.action('track_token', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.trackToken(ctx);
    });

    this.bot.action('manage_alerts', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.alertCommands.manageAlerts(ctx);
    });

    // Staking callbacks (replacing old subscription system)
    this.bot.action('stake_more', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.stakingCommands.handleStake(ctx);
    });

    this.bot.action('unstake_tokens', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.stakingCommands.handleUnstake(ctx);
    });

    this.bot.action('claim_rewards', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.stakingCommands.handleClaim(ctx);
    });

    this.bot.action('view_tiers', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.stakingCommands.handleTiers(ctx);
    });

    this.bot.action('refresh_staking', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.stakingCommands.handleSubscription(ctx);
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

*Copy Trading:*
/copytrade [wallet] - Start copying a trader
/copystop [wallet] - Stop copying a trader
/copylist - View active copy trades
/toptraders - See top traders to copy
/analyze [wallet] - Analyze trader performance
/follow [wallet] - Follow a trader (alias)
/unfollow [wallet] - Stop following (alias)

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

  private async sendSettingsMenu(ctx: BotContext) {
    const settingsText = `
⚙️ *Settings*

Manage your account settings and preferences:
`;

    const keyboard = [
      [
        { text: '🔔 Notifications', callback_data: 'settings_notifications' },
        { text: '🔒 Security', callback_data: 'settings_security' },
      ],
      [
        { text: '📊 Trading Settings', callback_data: 'settings_trading' },
        { text: '💎 Subscription', callback_data: 'subscribe_menu' },
      ],
      [
        { text: '🔙 Back', callback_data: 'back' },
      ],
    ];

    await ctx.reply(settingsText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  private setupWebSocketHandlers() {
    // Handle WebSocket connection events
    this.wsClient.on('connected', () => {
      this.logger.info('Connected to WebSocket server');
      
      // Subscribe to channels
      this.wsClient.subscribe('alerts');
      this.wsClient.subscribe('tokens');
      this.wsClient.subscribe('trades'); // Subscribe to all trades
      this.wsClient.subscribe('prices'); // Subscribe to all price updates
    });

    this.wsClient.on('disconnected', () => {
      this.logger.warn('Disconnected from WebSocket server');
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
            this.logger.error(`Failed to send alert to user ${userId}:`, error);
          }
        }
      } catch (error) {
        this.logger.error('Error handling alert:', error);
      }
    });

    // Handle new token events
    this.wsClient.on('token:created', async (token) => {
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
            this.logger.error(`Failed to send new token alert to user ${userId}:`, error);
          }
        }
      } catch (error) {
        this.logger.error('Error handling new token:', error);
      }
    });

    // Handle trade events
    this.wsClient.on('token:traded', async (trade) => {
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
              this.logger.error(`Failed to send trade alert to user ${userId}:`, error);
            }
          }
        }
      } catch (error) {
        this.logger.error('Error handling trade:', error);
      }
    });

    // Handle price updates
    this.wsClient.on('price:update', async (priceData) => {
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
            this.logger.error(`Failed to send price alert to user ${alert.userId}:`, error);
          }
        }
      } catch (error) {
        this.logger.error('Error handling price update:', error);
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
    this.logger.debug('Processing copy trade:', trade);
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
        { command: 'copytrade', description: '🔥 Copy top traders' },
        { command: 'toptraders', description: 'View top traders' },
        { command: 'alerts', description: 'Manage alerts' },
        { command: 'subscribe', description: 'Premium features' },
        { command: 'help', description: 'Help and commands' },
      ]);

      // Launch bot
      if (process.env.NODE_ENV === 'production' && process.env.TELEGRAM_WEBHOOK_URL) {
        // Use webhook in production
        const webhookUrl = `${process.env.TELEGRAM_WEBHOOK_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
        await this.bot.telegram.setWebhook(webhookUrl);
        this.logger.info(`Webhook set to: ${webhookUrl}`);
      } else {
        // Use polling in development
        await this.bot.launch();
        this.logger.info('Bot started in polling mode');
      }

      // Enable graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));

    } catch (error) {
      this.logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  async stop(signal: string) {
    this.logger.info(`Stopping bot (${signal})...`);
    this.wsClient.disconnect();
    await this.db.close();
    this.bot.stop(signal);
  }
}

// Start the bot
const bot = new CoreMemeBot();
const logger = createLogger({ service: 'telegram-bot-main' });
bot.start().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});