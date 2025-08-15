import { BotContext } from '../bot';
import { DatabaseService } from '@core-meme/shared';
import { Markup } from 'telegraf';
import { createLogger } from '@core-meme/shared';

interface SubscriptionPlan {
  name: string;
  tier: string;
  price: number;
  features: string[];
  alertLimit: number;
  copyTradeLimit: number;
}

export class SubscriptionCommands {
  private logger = createLogger({ service: 'subscription-commands' });
  private db: DatabaseService;
  
  private readonly plans: SubscriptionPlan[] = [
    {
      name: '🆓 Free',
      tier: 'free',
      price: 0,
      features: [
        '✅ Basic trading features',
        '✅ 5 price alerts',
        '✅ Portfolio tracking',
        '✅ Basic market data',
        '❌ Copy trading',
        '❌ Whale alerts',
        '❌ Priority support'
      ],
      alertLimit: 5,
      copyTradeLimit: 0
    },
    {
      name: '⭐ Premium',
      tier: 'premium',
      price: 9.99,
      features: [
        '✅ All Free features',
        '✅ 50 price alerts',
        '✅ New token notifications',
        '✅ Advanced analytics',
        '✅ 3 copy trade slots',
        '✅ Email support',
        '❌ Whale alerts'
      ],
      alertLimit: 50,
      copyTradeLimit: 3
    },
    {
      name: '💎 Pro',
      tier: 'pro',
      price: 29.99,
      features: [
        '✅ All Premium features',
        '✅ Unlimited price alerts',
        '✅ Whale activity alerts',
        '✅ 10 copy trade slots',
        '✅ API access',
        '✅ Priority support 24/7',
        '✅ Custom alert conditions',
        '✅ Advanced copy trade filters'
      ],
      alertLimit: -1, // unlimited
      copyTradeLimit: 10
    }
  ];

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async showSubscriptionPlans(ctx: BotContext) {
    try {
      let message = '🎯 **Core Meme Platform Subscription Plans**\n\n';
      
      for (const plan of this.plans) {
        message += `${plan.name} ${plan.price > 0 ? `($${plan.price}/month)` : ''}\n`;
        message += plan.features.join('\n') + '\n\n';
      }
      
      message += '💡 *Upgrade to unlock more features and remove limits!*\n\n';
      message += 'Choose a plan to continue:';
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('⭐ Upgrade to Premium', 'subscribe_premium'),
          Markup.button.callback('💎 Upgrade to Pro', 'subscribe_pro')
        ],
        [
          Markup.button.callback('📊 View My Subscription', 'view_subscription'),
          Markup.button.callback('❌ Cancel', 'cancel')
        ]
      ]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      this.logger.error('Error showing subscription plans:', error);
      await ctx.reply('❌ Error displaying subscription plans. Please try again.');
    }
  }

  async showCurrentSubscription(ctx: BotContext) {
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
      
      // Get current subscription details
      const subscription = await this.db.getUserSubscription(user.id);
      const alertCount = await this.db.getUserAlertCount(user.id);
      const currentPlan = this.plans.find(p => p.tier === (user.subscriptionTier || 'free'));
      
      let message = '📊 **Your Subscription Status**\n\n';
      message += `Current Plan: ${currentPlan?.name || 'Free'}\n`;
      
      if (subscription && subscription.status === 'active') {
        message += `Status: ✅ Active\n`;
        message += `Started: ${new Date(subscription.started_at).toLocaleDateString()}\n`;
        
        if (subscription.expires_at) {
          const expiryDate = new Date(subscription.expires_at);
          const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          message += `Expires: ${expiryDate.toLocaleDateString()} (${daysLeft} days left)\n`;
        }
      } else {
        message += `Status: Free Plan\n`;
      }
      
      message += `\n📈 **Usage Statistics**\n`;
      message += `Price Alerts: ${alertCount}/${currentPlan?.alertLimit === -1 ? '∞' : currentPlan?.alertLimit}\n`;
      
      // Get copy trade count
      const copyTrades = await this.db.getUserCopyTrades(user.id);
      message += `Copy Trade Slots: ${copyTrades.length}/${currentPlan?.copyTradeLimit || 0}\n`;
      
      message += `\n💡 *Tip: Upgrade your plan to unlock more features!*`;
      
      const keyboard = currentPlan?.tier === 'free' 
        ? Markup.inlineKeyboard([
            [Markup.button.callback('⬆️ Upgrade Plan', 'show_plans')],
            [Markup.button.callback('🔙 Back', 'cancel')]
          ])
        : currentPlan?.tier === 'premium'
        ? Markup.inlineKeyboard([
            [Markup.button.callback('💎 Upgrade to Pro', 'subscribe_pro')],
            [Markup.button.callback('❌ Cancel Subscription', 'cancel_subscription')],
            [Markup.button.callback('🔙 Back', 'cancel')]
          ])
        : Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel Subscription', 'cancel_subscription')],
            [Markup.button.callback('🔙 Back', 'cancel')]
          ]);
      
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      this.logger.error('Error showing current subscription:', error);
      await ctx.reply('❌ Error fetching subscription details. Please try again.');
    }
  }

  async upgradeSubscription(ctx: BotContext) {
    try {
      await ctx.reply(
        '🔄 **Upgrade Your Subscription**\n\n' +
        'Choose your preferred payment method:',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('⭐ Telegram Stars', 'pay_stars'),
            Markup.button.callback('🪙 Crypto (CORE)', 'pay_crypto')
          ],
          [
            Markup.button.callback('💳 Card (Coming Soon)', 'pay_card_soon'),
          ],
          [
            Markup.button.callback('🔙 Back', 'show_plans')
          ]
        ])
      );
    } catch (error) {
      this.logger.error('Error in upgrade subscription:', error);
      await ctx.reply('❌ Error processing upgrade. Please try again.');
    }
  }

  async processSubscription(ctx: BotContext, plan: string) {
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
      
      const selectedPlan = this.plans.find(p => p.tier === plan);
      if (!selectedPlan) {
        await ctx.reply('❌ Invalid plan selected');
        return;
      }
      
      // For now, we'll simulate the subscription process
      // In production, integrate with payment provider
      
      await ctx.reply(
        `🎯 **Subscribing to ${selectedPlan.name}**\n\n` +
        `Price: $${selectedPlan.price}/month\n\n` +
        `Payment Options:\n` +
        `1️⃣ Pay with Telegram Stars\n` +
        `2️⃣ Pay with CORE tokens\n` +
        `3️⃣ Pay with Credit Card (Coming Soon)\n\n` +
        `Please confirm your subscription upgrade.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirm Subscription', `confirm_sub_${plan}`)],
          [Markup.button.callback('❌ Cancel', 'cancel')]
        ])
      );
    } catch (error) {
      this.logger.error('Error processing subscription:', error);
      await ctx.reply('❌ Error processing subscription. Please try again.');
    }
  }

  async confirmSubscription(ctx: BotContext, tier: string) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      // Update user's subscription tier
      await this.db.updateUserSubscription(user.id, tier);
      
      // Create subscription record
      await this.db.createSubscription({
        user_id: user.id,
        tier: tier,
        payment_method: 'telegram_stars',
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      });
      
      const plan = this.plans.find(p => p.tier === tier);
      
      await ctx.reply(
        `✅ **Subscription Activated!**\n\n` +
        `Welcome to ${plan?.name}!\n\n` +
        `Your new features are now active:\n` +
        `${plan?.features.filter(f => f.startsWith('✅')).join('\n')}\n\n` +
        `Thank you for upgrading! 🚀`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📊 View Subscription', 'view_subscription')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      );
    } catch (error) {
      this.logger.error('Error confirming subscription:', error);
      await ctx.reply('❌ Error activating subscription. Please contact support.');
    }
  }

  async cancelSubscription(ctx: BotContext) {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) return;
      
      const user = await this.db.getUserByTelegramId(parseInt(userId));
      if (!user) return;
      
      await ctx.reply(
        '⚠️ **Cancel Subscription**\n\n' +
        'Are you sure you want to cancel your subscription?\n\n' +
        'You will lose access to:\n' +
        '• Premium features\n' +
        '• Extended alert limits\n' +
        '• Copy trading slots\n' +
        '• Priority support\n\n' +
        '*Your subscription will remain active until the end of the billing period.*',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Yes, Cancel', 'confirm_cancel_sub'),
            Markup.button.callback('❌ No, Keep It', 'view_subscription')
          ]
        ])
      );
    } catch (error) {
      this.logger.error('Error in cancel subscription:', error);
      await ctx.reply('❌ Error processing cancellation. Please contact support.');
    }
  }
}