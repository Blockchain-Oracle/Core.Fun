import { Markup } from 'telegraf';
import { BotContext } from '../bot';
import { DatabaseService } from '../services/DatabaseService';
import { WalletService } from './WalletService';
import { logger } from '../utils/logger';

export class WalletCommands {
  private db: DatabaseService;
  private walletService: WalletService;

  constructor(db: DatabaseService) {
    this.db = db;
    this.walletService = new WalletService(db);
  }

  /**
   * Show wallet overview
   */
  async showWallet(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Loading wallet...');

    try {
      // Get primary wallet
      const primaryWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      
      if (!primaryWallet) {
        await ctx.deleteMessage(loadingMsg.message_id);
        await ctx.reply('❌ No wallet found. Please /start to create one.');
        return;
      }

      // Get balance
      const balance = await this.walletService.getBalance(primaryWallet.address);

      // Get trading and withdraw wallets
      const tradingWallets = await this.walletService.getTradingWallets(ctx.session.userId);
      const withdrawWallets = await this.walletService.getWithdrawWallets(ctx.session.userId);

      // Build message
      let message = `💼 *Your Wallet Dashboard*\n\n`;
      message += `*Primary Wallet:*\n`;
      message += `\`${primaryWallet.address}\`\n`;
      message += `Balance: ${balance.core} CORE ($${balance.usd})\n\n`;

      if (tradingWallets.length > 0) {
        message += `*Trading Wallets:* ${tradingWallets.length}\n`;
      }

      if (withdrawWallets.length > 0) {
        message += `*Withdraw Addresses:* ${withdrawWallets.length}\n`;
      }

      // Send message with buttons
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        message,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('💸 Add Funds', 'add_funds'),
              Markup.button.callback('📤 Withdraw', 'withdraw'),
            ],
            [
              Markup.button.callback('📊 Distribute', 'distribute'),
              Markup.button.callback('🔄 Consolidate', 'consolidate'),
            ],
            [
              Markup.button.callback('➕ Add Wallet', 'add_wallet_menu'),
              Markup.button.callback('🔑 Export Key', 'wallet_export'),
            ],
            [
              Markup.button.url(
                '🌐 Wallet Manager',
                `${process.env.FRONTEND_URL}/walletManager?telegramId=${ctx.session.telegramId}`
              ),
            ],
            [
              Markup.button.url(
                '🔍 View on Explorer',
                `https://scan.coredao.org/address/${primaryWallet.address}`
              ),
            ],
          ])
        }
      );
    } catch (error) {
      logger.error('Error showing wallet:', error);
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply('❌ Failed to load wallet. Please try again.');
    }
  }

  /**
   * Show balance
   */
  async showBalance(ctx: BotContext): Promise<void> {
    if (!ctx.session?.walletAddress) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Checking balance...');

    try {
      const balance = await this.walletService.getBalance(ctx.session.walletAddress);

      let message = `💰 *Your Balance*\n\n`;
      message += `🔷 *CORE:* ${balance.core}\n`;
      message += `💵 *USD Value:* $${balance.usd}\n\n`;

      if (balance.tokens && balance.tokens.length > 0) {
        message += `*Token Holdings:*\n`;
        for (const token of balance.tokens) {
          message += `• ${token.symbol}: ${token.balance} ($${token.valueUsd.toFixed(2)})\n`;
        }
      } else {
        message += `_No token holdings yet_`;
      }

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        message,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🔄 Refresh', 'refresh_balance'),
              Markup.button.callback('📊 Portfolio', 'portfolio_view'),
            ],
            [
              Markup.button.callback('💸 Add Funds', 'add_funds'),
              Markup.button.callback('📤 Withdraw', 'withdraw'),
            ],
          ])
        }
      );
    } catch (error) {
      logger.error('Error checking balance:', error);
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply('❌ Failed to check balance. Please try again.');
    }
  }

  /**
   * Handle withdraw
   */
  async handleWithdraw(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    // Get withdraw wallets
    const withdrawWallets = await this.walletService.getWithdrawWallets(ctx.session.userId);

    if (withdrawWallets.length === 0) {
      await ctx.reply(
        `📤 *Withdraw Funds*\n\n` +
        `You haven't added any withdraw addresses yet.\n` +
        `For security, you must add withdraw addresses through the web interface.\n\n` +
        `This ensures addresses are properly validated and whitelisted.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.url(
                '➕ Add Withdraw Address',
                `${process.env.FRONTEND_URL}/walletManager?action=add_withdraw&telegramId=${ctx.session.telegramId}`
              ),
            ],
            [Markup.button.callback('🔙 Back', 'wallet_view')],
          ])
        }
      );
      return;
    }

    // Show withdraw addresses
    let message = `📤 *Select Withdraw Address*\n\n`;
    const buttons = [];

    for (const wallet of withdrawWallets) {
      message += `• ${wallet.name}: \`${this.shortenAddress(wallet.address)}\`\n`;
      buttons.push([
        Markup.button.callback(
          wallet.name,
          `withdraw_to_${wallet.id}`
        ),
      ]);
    }

    buttons.push([
      Markup.button.url(
        '➕ Add New Address',
        `${process.env.FRONTEND_URL}/walletManager?action=add_withdraw`
      ),
    ]);
    buttons.push([Markup.button.callback('🔙 Back', 'wallet_view')]);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  }

  /**
   * Export private key with security warning
   */
  async exportPrivateKey(ctx: BotContext) {
    await ctx.reply(
      `⚠️ *SECURITY WARNING*\n\n` +
      `You are about to export your private key.\n\n` +
      `*NEVER share your private key with anyone!*\n` +
      `• Anyone with your private key can steal your funds\n` +
      `• Core Meme Platform staff will NEVER ask for it\n` +
      `• Store it securely offline\n\n` +
      `Are you absolutely sure you want to continue?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Yes, I understand the risks', 'confirm_export_key'),
            Markup.button.callback('❌ Cancel', 'cancel'),
          ],
        ])
      }
    );
  }

  /**
   * Confirm and export private key
   */
  async confirmExportKey(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId || !ctx.session?.walletAddress || !ctx.session?.telegramId) {
      await ctx.reply('Session expired. Please /start again.');
      return;
    }

    try {
      // Export private key
      const privateKey = await this.walletService.exportPrivateKey(
        ctx.session.userId,
        ctx.session.walletAddress,
        ctx.session.telegramId
      );

      // Send private key (will auto-delete after 30 seconds)
      const keyMessage = await ctx.reply(
        `🔐 *Your Private Key*\n\n` +
        `\`${privateKey}\`\n\n` +
        `⚠️ This message will be deleted in 30 seconds for your security.\n` +
        `Save it immediately in a secure location!`,
        { parse_mode: 'Markdown' }
      );

      // Schedule deletion
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(keyMessage.message_id);
          await ctx.reply(
            '✅ Private key message deleted for security.\n\n' +
            'If you need it again, use /export command.'
          );
        } catch (error) {
          // Message might already be deleted by user
        }
      }, 30000);

    } catch (error) {
      logger.error('Error exporting private key:', error);
      await ctx.reply('❌ Failed to export private key. Please try again.');
    }
  }

  /**
   * Add trading wallet
   */
  async addTradingWallet(ctx: BotContext) {
    await ctx.reply(
      `➕ *Add Trading Wallet*\n\n` +
      `Choose an option:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🆕 Generate New Wallet', 'generate_trading_wallet')],
          [Markup.button.callback('📥 Import Existing Wallet', 'import_trading_wallet')],
          [Markup.button.callback('🔙 Back', 'wallet_view')],
        ])
      }
    );
  }

  /**
   * Add withdraw wallet
   */
  async addWithdrawWallet(ctx: BotContext) {
    const webUrl = `${process.env.FRONTEND_URL}/walletManager?action=add_withdraw&telegramId=${ctx.session?.telegramId}`;
    
    await ctx.reply(
      `📤 *Add Withdraw Address*\n\n` +
      `For security reasons, withdraw addresses must be added through our secure web interface.\n\n` +
      `This ensures:\n` +
      `• Address validation\n` +
      `• Whitelist protection\n` +
      `• 2FA verification (if enabled)\n`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🌐 Open Wallet Manager', webUrl)],
          [Markup.button.callback('🔙 Back', 'wallet_view')],
        ])
      }
    );
  }

  /**
   * Open wallet manager in web
   */
  async openWalletManager(ctx: BotContext) {
    const webUrl = `${process.env.FRONTEND_URL}/walletManager?telegramId=${ctx.session?.telegramId}`;
    
    await ctx.reply(
      `🏦 *Wallet Manager*\n\n` +
      `Access advanced wallet features:\n` +
      `• Manage multiple wallets\n` +
      `• Add withdraw addresses\n` +
      `• Distribute & consolidate funds\n` +
      `• Transaction history\n` +
      `• Export/Import wallets\n`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🌐 Open Wallet Manager', webUrl)],
        ])
      }
    );
  }

  /**
   * Helper: Shorten address
   */
  private shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}