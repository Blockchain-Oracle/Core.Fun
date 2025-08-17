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
import { ApiService } from './services/ApiService';
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
    alertTokenPrice?: number;
    alertTokenSymbol?: string;
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
  private userStates: Map<number, { action: string; tokenAddress?: string }>;
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
    this.userStates = new Map();
    
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

    // Airdrop command - claim initial 1000 CMP
    this.bot.command('claimcmp', authMiddleware, async (ctx) => {
      await this.stakingCommands.handleClaimCMP(ctx);
    });

    // Quick buy CMP command
    this.bot.command('buycmp', authMiddleware, async (ctx) => {
      await this.tradingCommands.handleBuyCMP(ctx);
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
      // Debug logging for session state
      if (ctx.session?.pendingAction || ctx.session?.awaitingInput) {
        this.logger.info('Session state - handling pending action:', {
          pendingAction: ctx.session?.pendingAction,
          awaitingInput: ctx.session?.awaitingInput,
          userId: ctx.session?.userId
        });
      }
      
      // Check if user is in a specific flow
      if (ctx.session?.pendingAction || ctx.session?.awaitingInput) {
        await this.handlePendingAction(ctx);
        return;
      }

      // Handle in-memory custom flows (e.g., custom buy amount)
      const fromId = ctx.from?.id;
      if (fromId && this.userStates?.has(fromId)) {
        const state = this.userStates.get(fromId)!;
        if (state.action === 'buy_custom' && ctx.message && 'text' in ctx.message) {
          const amountText = ctx.message.text.trim();
          const amountNum = parseFloat(amountText);
          if (isNaN(amountNum) || amountNum <= 0) {
            await ctx.reply('❌ Invalid amount. Please enter a positive number.');
            return;
          }
          try {
            await this.tradingCommands.executeBuyWithAmount(ctx, state.tokenAddress!, amountNum.toString());
          } finally {
            this.userStates.delete(fromId);
          }
          return;
        }
        // Handle custom sell percentage
        if (state.action === 'sell_custom' && ctx.message && 'text' in ctx.message) {
          const percentageText = ctx.message.text.trim();
          const percentage = parseFloat(percentageText);
          if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
            await ctx.reply('❌ Invalid percentage. Please enter a number between 1 and 100.');
            return;
          }
          try {
            await this.tradingCommands.executeSellWithPercentage(ctx, state.tokenAddress!, percentage);
          } finally {
            this.userStates.delete(fromId);
          }
          return;
        }
      }

      // Auto-detect token addresses and show preview
      await this.handleTokenAddressDetection(ctx);
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

    // Add withdraw address callback
    this.bot.action('add_withdraw_address', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await this.walletCommands.addWithdrawWallet(ctx);
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

    // Handle withdraw to specific address
    this.bot.action(/^withdraw_to_(.+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const walletId = ctx.match![1];
      await this.walletCommands.processWithdraw(ctx, walletId);
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
    this.bot.action('copy_trading_menu', authMiddleware, async (ctx) => {
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
            [Markup.button.callback('🔙 Cancel', 'copy_trading_menu')]
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

    // Handle buy with specific amount
    this.bot.action(/^buy_amount_([0-9a-fA-Fx]+)_([0-9.]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      const amount = ctx.match[2];
      await this.tradingCommands.executeBuyWithAmount(ctx, tokenAddress, amount);
    });

    // Handle custom buy amount
    this.bot.action(/^buy_custom_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await ctx.reply('💰 Please enter the amount of CORE you want to spend:');
      // Store state for next message
      const userId = ctx.from!.id;
      if (!this.userStates) {
        this.userStates = new Map();
      }
      this.userStates.set(userId, { action: 'buy_custom', tokenAddress });
    });

    // Handle ape buy (max amount)
    this.bot.action(/^buy_ape_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.executeBuyMax(ctx, tokenAddress);
    });

    // Handle chart view
    this.bot.action(/^chart_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.showChart(ctx, tokenAddress);
    });

    // Original buy handler (fallback for simple buy button)
    this.bot.action(/^buy_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.buyToken(ctx, tokenAddress);
    });

    // Handle sell with percentage buttons - MUST BE BEFORE general sell handler
    this.bot.action(/^sell_amount_([0-9a-fA-Fx]+)_([0-9]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      const percentage = parseInt(ctx.match[2]);
      
      // DEBUG LOGGING
      this.logger.info('Sell percentage callback triggered:', {
        tokenAddress: tokenAddress,
        percentage: percentage,
        userId: ctx.session?.userId,
        sessionData: ctx.session,
        callbackData: 'data' in ctx.callbackQuery! ? ctx.callbackQuery.data : undefined
      });
      
      await this.tradingCommands.executeSellWithPercentage(ctx, tokenAddress, percentage);
    });

    // Handle emergency sell - MUST BE BEFORE general sell handler
    this.bot.action(/^sell_emergency_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      // Emergency sell = 100% with slippage tolerance
      await this.tradingCommands.executeSellWithPercentage(ctx, tokenAddress, 100, true);
    });

    // Handle custom sell percentage - MUST BE BEFORE general sell handler
    this.bot.action(/^sell_custom_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await ctx.reply('💰 Please enter the percentage you want to sell (1-100):');
      // Store state for next message
      const userId = ctx.from!.id;
      this.userStates.set(userId, { action: 'sell_custom', tokenAddress });
    });

    // Handle refresh position - MUST BE BEFORE general sell handler
    this.bot.action(/^refresh_position_([0-9a-fA-Fx]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery('Refreshing...');
      const tokenAddress = ctx.match[1];
      await this.tradingCommands.sellToken(ctx, tokenAddress);
    });

    // General sell handler - MUST BE LAST to catch only direct sell buttons
    this.bot.action(/^sell_(0x[0-9a-fA-F]+)$/, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      
      // DEBUG LOGGING
      this.logger.info('Main sell callback triggered:', {
        tokenAddress: tokenAddress,
        userId: ctx.session?.userId,
        sessionData: ctx.session,
        callbackData: 'data' in ctx.callbackQuery! ? ctx.callbackQuery.data : undefined
      });
      
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

    // Create alert from token preview button with full address
    this.bot.action(/^create_alert_([0-9a-fA-Fx]+)$/i, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      await this.alertCommands.createAlertForToken(ctx, tokenAddress);
    });

    // Fallback create alert (from Alerts menu)
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

    // Inline selection for alert direction
    // Handle alert direction selection with quick-pick prices
    this.bot.action(/^alert_direction_(above|below)_([0-9a-fA-Fx]+)$/i, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const direction = ctx.match[1] as 'above' | 'below';
      const tokenAddress = ctx.match[2];
      
      // Get stored price from session or fetch it
      const currentPrice = ctx.session?.alertTokenPrice || null;
      const tokenSymbol = ctx.session?.alertTokenSymbol || 'TOKEN';
      
      if (currentPrice !== null && currentPrice > 0) {
        // Show quick-pick buttons
        const quickPicks = [];
        
        if (direction === 'above') {
          // For above alerts: current, +5%, +10%, +20%
          quickPicks.push(
            { label: `Current ($${currentPrice.toFixed(6)})`, price: currentPrice },
            { label: `+5% ($${(currentPrice * 1.05).toFixed(6)})`, price: currentPrice * 1.05 },
            { label: `+10% ($${(currentPrice * 1.10).toFixed(6)})`, price: currentPrice * 1.10 },
            { label: `+20% ($${(currentPrice * 1.20).toFixed(6)})`, price: currentPrice * 1.20 }
          );
        } else {
          // For below alerts: -20%, -10%, -5%, current
          quickPicks.push(
            { label: `-20% ($${(currentPrice * 0.80).toFixed(6)})`, price: currentPrice * 0.80 },
            { label: `-10% ($${(currentPrice * 0.90).toFixed(6)})`, price: currentPrice * 0.90 },
            { label: `-5% ($${(currentPrice * 0.95).toFixed(6)})`, price: currentPrice * 0.95 },
            { label: `Current ($${currentPrice.toFixed(6)})`, price: currentPrice }
          );
        }
        
        const keyboard = [];
        // Add quick-pick buttons (2 per row)
        for (let i = 0; i < quickPicks.length; i += 2) {
          const row = [];
          row.push(Markup.button.callback(
            quickPicks[i].label,
            `quick_alert_${direction}_${tokenAddress}_${quickPicks[i].price.toFixed(8)}`
          ));
          if (i + 1 < quickPicks.length) {
            row.push(Markup.button.callback(
              quickPicks[i + 1].label,
              `quick_alert_${direction}_${tokenAddress}_${quickPicks[i + 1].price.toFixed(8)}`
            ));
          }
          keyboard.push(row);
        }
        
        // Add custom price button
        keyboard.push([
          Markup.button.callback('✏️ Enter Custom Price', `set_alert_${direction}_${tokenAddress}`)
        ]);
        keyboard.push([Markup.button.callback('❌ Cancel', 'alerts_menu')]);
        
        await ctx.reply(
          `🔔 **Set ${direction === 'above' ? '📈 Above' : '📉 Below'} Alert for ${tokenSymbol}**\n\n` +
          `Current Price: **$${currentPrice.toFixed(6)}**\n\n` +
          `Select a price or enter custom:`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
          }
        );
      } else {
        // No price available, go directly to manual entry
        await ctx.reply(
          `Enter target price in USD for ${direction.toUpperCase()} alert on \`${tokenAddress}\``,
          { parse_mode: 'Markdown' }
        );
        if (ctx.session) {
          ctx.session.awaitingInput = `alert_price_${direction}_${tokenAddress}`;
          ctx.session.pendingAction = `alert_price_${direction}_${tokenAddress}`;
        }
      }
    });

    // Handle quick-pick alert price selection
    this.bot.action(/^quick_alert_(above|below)_([0-9a-fA-Fx]+)_([0-9.]+)$/i, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const direction = ctx.match[1] as 'above' | 'below';
      const tokenAddress = ctx.match[2];
      const price = parseFloat(ctx.match[3]);
      
      try {
        const userId = ctx.from?.id.toString();
        if (!userId) return;
        
        const user = await this.db.getUserByTelegramId(parseInt(userId));
        if (!user) return;
        
        // Get token symbol from session or use default
        const tokenSymbol = ctx.session?.alertTokenSymbol || 'TOKEN';
        
        // Create the alert
        const success = await this.db.createPriceAlert(
          user.id,
          tokenAddress,
          tokenSymbol,
          price,
          direction
        );
        
        if (success) {
          await ctx.reply(
            `✅ **Alert Created Successfully!**\n\n` +
            `Token: **${tokenSymbol}**\n` +
            `Type: ${direction === 'above' ? '📈 Above' : '📉 Below'}\n` +
            `Target Price: **$${price.toFixed(6)}**\n` +
            `Address: \`${tokenAddress}\`\n\n` +
            `You'll be notified when the price ${direction === 'above' ? 'rises above' : 'falls below'} this target.`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📋 View All Alerts', 'view_all_alerts')],
                [Markup.button.callback('🔙 Back to Menu', 'alerts_menu')]
              ])
            }
          );
        } else {
          await ctx.reply('❌ Failed to create alert. You may have reached your alert limit.');
        }
      } catch (error) {
        this.logger.error('Error creating quick alert:', error);
        await ctx.reply('❌ Failed to create alert. Please try again.');
      }
    });

    // Handle manual price entry for alerts
    this.bot.action(/^set_alert_(above|below)_([0-9a-fA-Fx]+)$/i, authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const direction = ctx.match[1] as 'above' | 'below';
      const token = ctx.match[2];
      await ctx.reply(`Enter target price in USD for ${direction.toUpperCase()} alert on \`${token}\``, { parse_mode: 'Markdown' });
      if (ctx.session) {
        ctx.session.awaitingInput = `alert_price_${direction}_${token}`;
        ctx.session.pendingAction = `alert_price_${direction}_${token}`;
      }
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

    // Token list callbacks
    this.bot.action('refresh_tokens', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery('Refreshing...');
      await this.tradingCommands.handleBuy(ctx);
    });

    this.bot.action('view_trending', authMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(
        '📈 *Trending Tokens*\n\n' +
        'Feature coming soon! For now, use:\n' +
        '• `/buy` - View all available tokens\n' +
        '• Paste any token address for instant preview',
        { parse_mode: 'Markdown' }
      );
    });

    // Login callback for unauthenticated users
    this.bot.action('auth_login', async (ctx) => {
      await ctx.answerCbQuery();
      await this.authHandler.handleStart(ctx);
    });
  }

  private async handlePendingAction(ctx: BotContext) {
    const action = ctx.session?.pendingAction;
    
    // Handle snipe actions with token address
    if (action && action.startsWith('snipe_')) {
      const tokenAddress = action.replace('snipe_', '');
      const amount = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      
      if (amount && !isNaN(parseFloat(amount))) {
        // Execute snipe
        await ctx.reply(`⚡ Setting up snipe for ${amount} CORE on token ${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`);
        // TODO: Implement actual snipe execution
        
        // Clear pending action
        if (ctx.session) {
          ctx.session.pendingAction = undefined;
        }
      } else {
        await ctx.reply('❌ Invalid amount. Please enter a valid number.');
      }
      return;
    }
    
    switch (action) {
      case 'import_wallet':
        // Handle wallet import
        break;
      case 'add_withdraw_address':
        // Handle adding withdraw address (validate and save)
        if (!ctx.session?.userId) {
          await ctx.reply('Please /start the bot first');
          break;
        }
        if (!ctx.message || !('text' in ctx.message)) {
          await ctx.reply('❌ Please paste a valid CORE address.');
          break;
        }
        {
          const address = ctx.message.text.trim();
          const isHex40 = /^0x[a-fA-F0-9]{40}$/.test(address);
          if (!isHex40) {
            await ctx.reply('❌ Invalid address format. Please send a CORE address like `0x...`', { parse_mode: 'Markdown' });
            break;
          }
          try {
            // Check if already exists
            const existing = await this.db.getWithdrawWallet(ctx.session.userId, address);
            if (existing) {
              await ctx.reply('ℹ️ This address is already whitelisted for withdrawals.');
            } else {
              await this.db.createWallet({
                userId: ctx.session.userId,
                name: 'Withdraw',
                address: address,
                type: 'withdraw',
                network: 'CORE'
              });
              await ctx.reply(
                `✅ Withdraw address added:\n\`${address}\``,
                {
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📤 Withdraw', 'withdraw')],
                    [Markup.button.callback('🔙 Back', 'wallet_view')]
                  ])
                }
              );
            }
            // Clear flags so future pasted addresses can preview tokens again
            if (ctx.session) {
              ctx.session.pendingAction = undefined;
              ctx.session.awaitingInput = undefined;
            }
          } catch (e) {
            this.logger.error('Failed saving withdraw address:', e);
            await ctx.reply('❌ Failed to save address. Please try again.');
          }
        }
        break;
      case 'buy_amount':
        // Handle buy amount input
        break;
      case 'sell_percentage':
        // Handle sell percentage input
        break;
      default:
        // Handle alert price entry pattern: alert_price_<direction>_<token>
        if (action && action.startsWith('alert_price_')) {
          const parts = action.split('_');
          const direction = parts[2] as 'above' | 'below';
          const tokenAddress = parts.slice(3).join('_');
          const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';
          const target = parseFloat(text);
          if (!isNaN(target) && target > 0) {
            try {
              const userIdStr = ctx.from?.id.toString();
              if (userIdStr) {
                const user = await this.db.getUserByTelegramId(parseInt(userIdStr));
                if (user) {
                  // Try to infer symbol from token info
                  let symbol = 'TOKEN';
                  try {
                    const api = new ApiService();
                    const infoResp = await api.getTokenInfo(tokenAddress);
                    const info = (infoResp as any).data || (infoResp as any).token || infoResp;
                    if (info?.symbol) symbol = info.symbol;
                  } catch {}
                  const ok = await this.db.createPriceAlert(user.id, tokenAddress, symbol, target, direction);
                  if (ok) {
                    await ctx.reply(`✅ Alert set: ${symbol} ${direction.toUpperCase()} $${target.toFixed(6)}\nToken: \`${tokenAddress}\``, { parse_mode: 'Markdown' });
                  } else {
                    await ctx.reply('❌ Could not create alert (maybe limit reached).');
                  }
                }
              }
            } catch (e) {
              // swallow
            }
          } else {
            await ctx.reply('❌ Invalid price. Please enter a positive number.');
            return;
          }
        }
        break;
    }
    
    // Clear pending action
    if (ctx.session) {
      ctx.session.pendingAction = undefined;
    }
  }

  /**
   * Auto-detect token addresses in messages and show preview
   */
  private async handleTokenAddressDetection(ctx: BotContext) {
    if (!ctx.message || !('text' in ctx.message)) return;
    // If user is in any pending input flow, do not auto-preview tokens
    if (ctx.session?.pendingAction || ctx.session?.awaitingInput) return;
    
    const text = ctx.message.text.trim();
    
    // Check if the message is a token address (0x followed by 40 hex characters)
    const tokenAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    
    if (tokenAddressRegex.test(text)) {
      // User pasted a token address, show preview automatically
      await this.showTokenPreview(ctx, text);
    }
  }

  /**
   * Show comprehensive token preview with trading options
   */
  private async showTokenPreview(ctx: BotContext, tokenAddress: string) {
    // Check if user is authenticated for trading actions
    const isAuthenticated = ctx.session?.isAuthenticated;
    
    const loadingMsg = await ctx.reply('🔍 Analyzing token...');

    try {
      // Get token info from trading commands
      const tokenInfo = await this.tradingCommands.getTokenInfo(tokenAddress);
      
      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      
      // Send token image if available
      if (tokenInfo.image_url || tokenInfo.imageUrl || tokenInfo.image) {
        const imageUrl = tokenInfo.image_url || tokenInfo.imageUrl || tokenInfo.image;
        if (imageUrl) {
          try {
            await ctx.replyWithPhoto(imageUrl, {
              caption: `🪙 *${tokenInfo.symbol}* Preview`,
              parse_mode: 'Markdown'
            });
          } catch (imgError) {
            this.logger.warn('Failed to send token image:', imgError);
          }
        }
      }
      
      // Format comprehensive token preview
      let message = `🪙 *${tokenInfo.symbol} - ${tokenInfo.name}*\n`;
      message += `━━━━━━━━━━━━━━━━━━\n\n`;
      
      // Token description
      if (tokenInfo.description) {
        message += `📝 *Description:*\n${tokenInfo.description.substring(0, 200)}${tokenInfo.description.length > 200 ? '...' : ''}\n\n`;
      }
      
      // Market metrics
      message += `📊 *Market Metrics:*\n`;
      message += `├ Price: $${tokenInfo.price?.toFixed(8) || '0.00000000'}\n`;
      message += `├ 24h Change: ${(tokenInfo.priceChange24h || 0) > 0 ? '📈' : '📉'} ${(tokenInfo.priceChange24h || 0).toFixed(2)}%\n`;
      message += `├ Market Cap: $${this.formatLargeNumber(tokenInfo.marketCap || 0)}\n`;
      message += `├ Volume 24h: $${this.formatLargeNumber(tokenInfo.volume24h || 0)}\n`;
      message += `├ Liquidity: $${this.formatLargeNumber(tokenInfo.liquidity || 0)}\n`;
      message += `└ Holders: ${tokenInfo.holders || 0}\n\n`;
      
      // Bonding curve progress (if not launched)
      if (tokenInfo.status === 'CREATED' || !tokenInfo.isLaunched) {
        const progress = tokenInfo.graduationPercentage || 0;
        const raisedAmount = tokenInfo.raised || 0;
        const targetAmount = 3; // Standard target amount for Core
        
        message += `📈 *Bonding Curve:*\n`;
        message += `├ Progress: ${Number(progress).toFixed(1)}% to graduation\n`;
        message += `├ Raised: ${raisedAmount} CORE\n`;
        message += `├ Target: ${targetAmount} CORE\n`;
        message += `└ Status: ${Number(progress) >= 100 ? '✅ Ready to Graduate' : '🔄 Bonding Active'}\n\n`;
      }
      
      // Safety indicators
      if (tokenInfo.isHoneypot || (tokenInfo.rugScore && tokenInfo.rugScore > 50)) {
        message += `⚠️ *Safety Warnings:*\n`;
        if (tokenInfo.isHoneypot) {
          message += `└ 🚫 Honeypot detected\n`;
        }
        if (tokenInfo.rugScore && tokenInfo.rugScore > 50) {
          message += `└ ⚠️ High rug score: ${tokenInfo.rugScore}/100\n`;
        }
        message += `\n`;
      }
      
      message += `📋 *Contract:* \`${tokenAddress}\``;

      // Create action buttons
      const keyboard = [];
      
      // Social links row
      const socialButtons = [];
      if (tokenInfo.twitter) {
        socialButtons.push(Markup.button.url('🐦 Twitter', tokenInfo.twitter));
      }
      if (tokenInfo.telegram) {
        socialButtons.push(Markup.button.url('💬 Telegram', tokenInfo.telegram));
      }
      if (tokenInfo.website) {
        socialButtons.push(Markup.button.url('🌐 Website', tokenInfo.website));
      }
      if (socialButtons.length > 0) {
        keyboard.push(socialButtons);
      }
      
      // Trading buttons (only if authenticated)
      if (isAuthenticated) {
        keyboard.push([
          Markup.button.callback('💰 Buy', `buy_${tokenAddress}`),
          Markup.button.callback('📊 Chart', `chart_${tokenAddress}`),
          Markup.button.callback('🎯 Snipe', `snipe_${tokenAddress}`)
        ]);
      } else {
        keyboard.push([
          Markup.button.callback('🔑 Login to Trade', 'auth_login')
        ]);
      }
      
      // Info buttons
      keyboard.push([
        Markup.button.url('🔍 Explorer', `${process.env.EXPLORER_URL || 'https://scan.test2.btcs.network'}/address/${tokenAddress}`),
        Markup.button.callback('📈 Add Alert', `create_alert_${tokenAddress}`)
      ]);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
      
    } catch (error) {
      this.logger.error('Failed to show token preview:', error);
      try {
        await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      } catch {}
      await ctx.reply('❌ Failed to fetch token information. Please verify the token address.');
    }
  }

  /**
   * Format large numbers for display
   */
  private formatLargeNumber(num: number): string {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(2)}B`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(2);
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
        { command: 'copystop', description: 'Stop copying a trader' },
        { command: 'copylist', description: 'View active copy trades' },
        { command: 'analyze', description: 'Analyze a wallet' },
        { command: 'toptraders', description: 'View top traders' },
        { command: 'alerts', description: 'Manage alerts' },
        { command: 'watchlist', description: 'Your watchlist' },
        { command: 'track', description: 'Track a token' },
        { command: 'snipe', description: 'Snipe on launch (coming soon)' },
        { command: 'trades', description: 'Trade history' },
        { command: 'subscription', description: 'Current subscription' },
        { command: 'subscribe', description: 'Premium features' },
        { command: 'upgrade', description: 'Upgrade plan' },
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