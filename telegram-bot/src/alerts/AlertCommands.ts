import { BotContext } from '../bot';
import { DatabaseService } from '@core-meme/shared';
import { Markup } from 'telegraf';
import { createLogger } from '@core-meme/shared';

export class AlertCommands {
  private db: DatabaseService;
  private logger = createLogger({ service: 'alert-commands' });

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async manageAlerts(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('❌ Unable to identify user');
        return;
      }
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) {
        await ctx.reply('❌ User not found. Please /start the bot first.');
        return;
      }
      
      // Get user's active alerts
      const alerts = await this.db.getUserAlerts(user.id, true);
      const alertCount = alerts.length;
      const userTier = user.subscriptionTier || 'free';
      
      const limits = {
        free: 5,
        premium: 50,
        pro: -1 // unlimited
      };
      
      const userLimit = limits[userTier as keyof typeof limits] || limits.free;
      
      let message = '🔔 **Alert Management**\n\n';
      message += `Active Alerts: ${alertCount}/${userLimit === -1 ? '∞' : userLimit}\n\n`;
      
      if (alerts.length > 0) {
        message += '📊 **Your Active Alerts:**\n';
        alerts.slice(0, 10).forEach((alert: any, index: number) => {
          const symbol = alert.token_symbol || 'Unknown';
          const type = alert.alert_type === 'above' ? '📈' : '📉';
          message += `${index + 1}. ${type} ${symbol} - ${alert.alert_type} $${parseFloat(alert.target_price).toFixed(6)}\n`;
        });
        
        if (alerts.length > 10) {
          message += `\n... and ${alerts.length - 10} more alerts\n`;
        }
      } else {
        message += '📭 No active alerts\n';
      }
      
      message += '\n*Select an option:*';
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Create Alert', 'create_alert'),
          Markup.button.callback('📋 View All', 'view_all_alerts')
        ],
        [
          Markup.button.callback('🗑️ Delete Alert', 'delete_alert'),
          Markup.button.callback('📜 Alert History', 'alert_history')
        ],
        [
          Markup.button.callback('🔙 Back', 'main_menu')
        ]
      ]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      this.logger.error('Error managing alerts:', error);
      await ctx.reply('❌ Error loading alerts. Please try again.');
    }
  }

  async showWatchlist(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('❌ Unable to identify user');
        return;
      }
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) {
        await ctx.reply('❌ User not found. Please /start the bot first.');
        return;
      }
      
      // Get user's positions and alerts
      const positions = await this.db.getUserPositions(user.id);
      const alerts = await this.db.getUserAlerts(user.id, true);
      
      // Get unique tokens from positions and alerts
      const watchedTokens = new Set<string>();
      positions.forEach((pos: any) => {
        if (pos.is_active) {
          watchedTokens.add(`${pos.token_symbol} (${pos.token_address.slice(0, 6)}...${pos.token_address.slice(-4)})`);
        }
      });
      
      alerts.forEach((alert: any) => {
        watchedTokens.add(`${alert.token_symbol || 'Unknown'} (${alert.token_address.slice(0, 6)}...${alert.token_address.slice(-4)})`);
      });
      
      let message = '👀 **Your Watchlist**\n\n';
      
      if (watchedTokens.size > 0) {
        message += '📊 **Watched Tokens:**\n';
        Array.from(watchedTokens).forEach((token, index) => {
          message += `${index + 1}. ${token}\n`;
        });
        
        message += `\nTotal: ${watchedTokens.size} tokens\n`;
      } else {
        message += '📭 Your watchlist is empty\n';
        message += 'Add tokens by:\n';
        message += '• Creating price alerts\n';
        message += '• Making trades\n';
        message += '• Using /track command\n';
      }
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Track Token', 'track_token'),
          Markup.button.callback('🔔 Set Alert', 'create_alert')
        ],
        [
          Markup.button.callback('📊 Portfolio', 'portfolio_view'),
          Markup.button.callback('🔙 Back', 'main_menu')
        ]
      ]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      this.logger.error('Error showing watchlist:', error);
      await ctx.reply('❌ Error loading watchlist. Please try again.');
    }
  }

  async trackToken(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('❌ Unable to identify user');
        return;
      }
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) {
        await ctx.reply('❌ User not found. Please /start the bot first.');
        return;
      }
      
      // Check if user provided token address
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const parts = text.split(' ');
      
      if (parts.length < 2) {
        await ctx.reply(
          '📍 **Track Token**\n\n' +
          'To track a token, use:\n' +
          '`/track [token_address]`\n\n' +
          'Example:\n' +
          '`/track 0x1234...abcd`\n\n' +
          'Once tracked, you can:\n' +
          '• Set price alerts\n' +
          '• View real-time price\n' +
          '• Monitor trading activity\n' +
          '• Get notifications',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      const tokenAddress = parts[1];
      
      // Validate address format
      if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        await ctx.reply('❌ Invalid token address format. Please provide a valid Core address.');
        return;
      }
      
      // Here you would fetch token info from blockchain
      // For now, we'll simulate it
      await ctx.reply(
        `✅ **Token Tracked!**\n\n` +
        `Address: \`${tokenAddress}\`\n\n` +
        `You can now:\n` +
        `• Set price alerts for this token\n` +
        `• View it in your watchlist\n` +
        `• Monitor its activity\n\n` +
        `Use /alerts to set up notifications!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🔔 Set Alert', `set_alert_${tokenAddress.slice(0, 10)}`),
              Markup.button.callback('📊 View Price', `view_price_${tokenAddress.slice(0, 10)}`)
            ],
            [
              Markup.button.callback('👀 View Watchlist', 'view_watchlist'),
              Markup.button.callback('🔙 Back', 'main_menu')
            ]
          ])
        }
      );
    } catch (error) {
      this.logger.error('Error tracking token:', error);
      await ctx.reply('❌ Error tracking token. Please try again.');
    }
  }

  async toggleAlert(ctx: BotContext, alertType: string) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('❌ Unable to identify user');
        return;
      }
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) {
        await ctx.reply('❌ User not found. Please /start the bot first.');
        return;
      }
      
      // Get user's alert settings
      const alertSettings = await this.db.getUserAlertSettings(user.id);
      const currentStatus = alertSettings?.[alertType] || false;
      
      // Toggle the alert type
      await this.db.updateAlertSettings(user.id, alertType, !currentStatus);
      
      const alertTypes: Record<string, string> = {
        'new_tokens': '🆕 New Token Alerts',
        'large_trades': '💰 Large Trade Alerts',
        'whale_activity': '🐋 Whale Activity Alerts',
        'price_changes': '📊 Price Change Alerts',
        'liquidity_changes': '💧 Liquidity Alerts',
        'rug_warnings': '⚠️ Rug Pull Warnings'
      };
      
      const alertName = alertTypes[alertType] || alertType;
      const newStatus = !currentStatus;
      
      await ctx.reply(
        `${newStatus ? '✅' : '❌'} **${alertName}**\n\n` +
        `Alert has been ${newStatus ? 'enabled' : 'disabled'}.\n\n` +
        `${newStatus ? 'You will now receive' : 'You will no longer receive'} ${alertName.toLowerCase()}.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Alert Settings', 'alert_settings')],
            [Markup.button.callback('🔙 Back', 'manage_alerts')]
          ])
        }
      );
    } catch (error) {
      this.logger.error('Error toggling alert:', error);
      await ctx.reply('❌ Error updating alert settings. Please try again.');
    }
  }

  async createPriceAlert(ctx: BotContext, _tokenAddress?: string) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('❌ Unable to identify user');
        return;
      }
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) {
        await ctx.reply('❌ User not found. Please /start the bot first.');
        return;
      }
      
      // Check alert limits
      const alertCount = await this.db.getUserAlertCount(user.id);
      const userTier = user.subscriptionTier || 'free';
      
      const limits = {
        free: 5,
        premium: 50,
        pro: -1
      };
      
      const userLimit = limits[userTier as keyof typeof limits] || limits.free;
      
      if (userLimit !== -1 && alertCount >= userLimit) {
        await ctx.reply(
          `❌ **Alert Limit Reached**\n\n` +
          `You have reached your alert limit (${userLimit} alerts).\n\n` +
          `Upgrade your subscription to create more alerts:\n` +
          `• Premium: 50 alerts\n` +
          `• Pro: Unlimited alerts`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⬆️ Upgrade Plan', 'show_plans')],
              [Markup.button.callback('🔙 Back', 'manage_alerts')]
            ])
          }
        );
        return;
      }
      
      // Store in session for multi-step process
      ctx.session = ctx.session || {};
      ctx.session.pendingAction = 'create_alert';
      
      await ctx.reply(
        '🔔 **Create Price Alert**\n\n' +
        'Step 1: Enter the token address\n\n' +
        'Example: `0x1234...abcd`\n\n' +
        'Or paste the full token address:',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_alert')]
          ])
        }
      );
    } catch (error) {
      this.logger.error('Error creating price alert:', error);
      await ctx.reply('❌ Error creating alert. Please try again.');
    }
  }

  async viewAllAlerts(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      const alerts = await this.db.getUserAlerts(user.id, true);
      
      if (alerts.length === 0) {
        await ctx.reply(
          '📭 **No Active Alerts**\n\n' +
          'You don\'t have any active price alerts.\n\n' +
          'Create your first alert to get notified when token prices reach your targets!',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Create Alert', 'create_alert')],
              [Markup.button.callback('🔙 Back', 'manage_alerts')]
            ])
          }
        );
        return;
      }
      
      let message = '📋 **All Active Alerts**\n\n';
      
      alerts.forEach((alert: any, index: number) => {
        const symbol = alert.token_symbol || 'Unknown';
        const type = alert.alert_type === 'above' ? '📈 Above' : '📉 Below';
        const price = parseFloat(alert.target_price).toFixed(6);
        const created = new Date(alert.created_at).toLocaleDateString();
        
        message += `${index + 1}. **${symbol}**\n`;
        message += `   ${type} $${price}\n`;
        message += `   Created: ${created}\n`;
        message += `   ID: \`${alert.id.slice(0, 8)}\`\n\n`;
      });
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('➕ Create New', 'create_alert'),
            Markup.button.callback('🗑️ Delete Alert', 'delete_alert')
          ],
          [Markup.button.callback('🔙 Back', 'manage_alerts')]
        ])
      });
    } catch (error) {
      this.logger.error('Error viewing all alerts:', error);
      await ctx.reply('❌ Error loading alerts. Please try again.');
    }
  }

  async createAlert(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      // Check user's alert limit
      const alerts = await this.db.getUserAlerts(user.id, true);
      const userTier = user.subscriptionTier || 'free';
      const limits = { free: 5, premium: 50, pro: -1 };
      const userLimit = limits[userTier as keyof typeof limits] || limits.free;
      
      if (userLimit !== -1 && alerts.length >= userLimit) {
        await ctx.reply(
          `❌ **Alert Limit Reached**\n\n` +
          `You have reached your limit of ${userLimit} alerts.\n\n` +
          `Upgrade to Premium for up to 50 alerts or Pro for unlimited alerts!`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💎 Upgrade', 'subscribe_menu')],
              [Markup.button.callback('🔙 Back', 'alerts_menu')]
            ])
          }
        );
        return;
      }
      
      await ctx.reply(
        '🔔 **Create Price Alert**\n\n' +
        'Please send the token address you want to track:\n\n' +
        'Example: `0x123...abc`',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Cancel', 'alerts_menu')]
          ])
        }
      );
      
      // Set session state to expect token address
      if (ctx.session) {
        ctx.session.awaitingInput = 'alert_token_address';
      }
    } catch (error) {
      this.logger.error('Error creating alert:', error);
      await ctx.reply('❌ Error creating alert. Please try again.');
    }
  }

  async deleteAlert(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      const alerts = await this.db.getUserAlerts(user.id, true);
      
      if (alerts.length === 0) {
        await ctx.reply(
          '📭 **No Alerts to Delete**\n\n' +
          'You don\'t have any active alerts.',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Back', 'alerts_menu')]
            ])
          }
        );
        return;
      }
      
      let message = '🗑️ **Delete Alert**\n\n';
      message += 'Select an alert to delete:\n\n';
      
      const buttons = alerts.slice(0, 10).map((alert: any, index: number) => {
        const symbol = alert.token_symbol || 'Unknown';
        const type = alert.alert_type === 'above' ? '📈' : '📉';
        const price = parseFloat(alert.target_price).toFixed(6);
        return [Markup.button.callback(
          `${index + 1}. ${type} ${symbol} $${price}`,
          `delete_alert_${alert.id}`
        )];
      });
      
      buttons.push([Markup.button.callback('🔙 Cancel', 'alerts_menu')]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (error) {
      this.logger.error('Error showing delete menu:', error);
      await ctx.reply('❌ Error loading alerts. Please try again.');
    }
  }

  async confirmDeleteAlert(ctx: BotContext, alertId: string) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      // Delete the alert
      await this.db.deletePriceAlert(user.id, alertId);
      
      await ctx.reply(
        '✅ **Alert Deleted Successfully**',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Alerts', 'alerts_menu')]
          ])
        }
      );
    } catch (error) {
      this.logger.error('Error deleting alert:', error);
      await ctx.reply('❌ Error deleting alert. Please try again.');
    }
  }

  async alertHistory(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      // Get triggered alerts (inactive ones)
      const alerts = await this.db.getUserAlerts(user.id, false);
      
      if (alerts.length === 0) {
        await ctx.reply(
          '📭 **No Alert History**\n\n' +
          'No alerts have been triggered yet.',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Create Alert', 'create_alert')],
              [Markup.button.callback('🔙 Back', 'alerts_menu')]
            ])
          }
        );
        return;
      }
      
      let message = '📜 **Alert History**\n\n';
      message += 'Recently triggered alerts:\n\n';
      
      alerts.slice(0, 20).forEach((alert: any, index: number) => {
        const symbol = alert.token_symbol || 'Unknown';
        const type = alert.alert_type === 'above' ? '📈 Above' : '📉 Below';
        const price = parseFloat(alert.target_price).toFixed(6);
        const triggered = alert.triggered_at ? new Date(alert.triggered_at).toLocaleDateString() : 'N/A';
        
        message += `${index + 1}. **${symbol}**\n`;
        message += `   ${type} $${price}\n`;
        message += `   Triggered: ${triggered}\n\n`;
      });
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'alerts_menu')]
        ])
      });
    } catch (error) {
      this.logger.error('Error showing alert history:', error);
      await ctx.reply('❌ Error loading alert history. Please try again.');
    }
  }
}