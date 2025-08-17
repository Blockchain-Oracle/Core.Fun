import { BotContext } from '../bot';
import { DatabaseService } from '@core-meme/shared';
import { WalletService } from '@core-meme/shared';
import { Markup } from 'telegraf';
import { createLogger } from '@core-meme/shared';
import { ApiService } from '../services/ApiService';

// TIER CONFIGURATION - FETCHED FROM BACKEND
interface StakingTier {
  name: string;
  minStake: number;
  feeDiscount: number;
  color: string;
  maxAlerts: number;
  copyTradeSlots: number;
  apiAccess: boolean;
  apy: number;
}

export class StakingCommands {
  private logger = createLogger({ service: 'staking-commands' });
  private db: DatabaseService;
  private walletService: WalletService;
  private apiService: ApiService;
  private tiersCache: StakingTier[] | null = null;
  private tiersCacheTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // Token symbol from env
  private readonly TOKEN_SYMBOL = process.env.STAKING_TOKEN_SYMBOL || 'CMP';
  
  constructor(db: DatabaseService, walletService: WalletService) {
    this.db = db;
    this.walletService = walletService;
    this.apiService = new ApiService();
  }

  /**
   * Get tiers from backend with caching
   */
  private async getTiers(): Promise<StakingTier[]> {
    const now = Date.now();
    if (this.tiersCache && (now - this.tiersCacheTime) < this.CACHE_DURATION) {
      return this.tiersCache;
    }

    try {
      const response = await this.apiService.getStakingTiers();
      if (response.success && response.data) {
        // Add color emojis to tiers
        const tiersWithColors = response.data.map((tier: any) => ({
          ...tier,
          color: this.getTierEmoji(tier.name),
          minStake: parseFloat(tier.requiredAmount),
        }));
        
        this.tiersCache = tiersWithColors;
        this.tiersCacheTime = now;
        return tiersWithColors;
      }
    } catch (error) {
      this.logger.error('Failed to fetch tiers from backend:', error);
    }

    // Fallback to default tiers if backend fails
    return [
      {
        name: 'Bronze',
        minStake: 1000,
        feeDiscount: 1,
        color: '🥉',
        maxAlerts: 10,
        copyTradeSlots: 1,
        apiAccess: false,
        apy: 10,
      },
      {
        name: 'Silver',
        minStake: 5000,
        feeDiscount: 2,
        color: '🥈',
        maxAlerts: 25,
        copyTradeSlots: 3,
        apiAccess: false,
        apy: 15,
      },
      {
        name: 'Gold',
        minStake: 10000,
        feeDiscount: 3,
        color: '🥇',
        maxAlerts: 50,
        copyTradeSlots: 5,
        apiAccess: true,
        apy: 20,
      },
      {
        name: 'Platinum',
        minStake: 50000,
        feeDiscount: 5,
        color: '💎',
        maxAlerts: -1, // Unlimited
        copyTradeSlots: 10,
        apiAccess: true,
        apy: 25,
      },
    ];
  }

  private getTierEmoji(tierName: string): string {
    const emojis: Record<string, string> = {
      'Free': '🆓',
      'Bronze': '🥉',
      'Silver': '🥈',
      'Gold': '🥇',
      'Platinum': '💎',
    };
    return emojis[tierName] || '🎖️';
  }

  /**
   * Handle /claimcmp command - Claim initial 1000 CMP airdrop
   */
  async handleClaimCMP(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🎁 Processing your CMP airdrop claim...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          '❌ No wallet found. Please use /wallet to create one first.'
        );
        return;
      }

      // Set authentication
      if (ctx.session?.telegramId) {
        this.apiService.setTelegramId(ctx.session.telegramId);
      }

      // Try to claim airdrop
      const response = await this.apiService.claimAirdrop();
      
      if (response.success && response.data) {
        const data = response.data;
        
        let message = `🎉 *Airdrop Claimed Successfully!*\n`;
        message += `━━━━━━━━━━━━━━━━━━\n\n`;
        message += `💰 *Amount:* ${data.amount} CMP\n`;
        message += `📊 *New Balance:* ${data.newBalance} CMP\n`;
        message += `🎖️ *New Tier:* ${data.newTier}\n\n`;
        message += `📝 *Transaction:* \`${data.txHash}\`\n\n`;
        message += `✨ You are now ${data.newTier} tier with all its benefits!\n\n`;
        message += `💡 *Next Steps:*\n`;
        message += `• Use /subscription to see your tier benefits\n`;
        message += `• Want higher tier? Use /buycmp to get more CMP\n`;
        message += `• Start trading meme tokens with fee discounts!`;

        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          message,
          { parse_mode: 'Markdown' }
        );
      } else {
        const errorMsg = response.error || 'Failed to claim airdrop';
        
        // Check if already claimed
        if (errorMsg.includes('already claimed')) {
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            undefined,
            '❌ You have already claimed your initial 1000 CMP tokens!\n\nUse /subscription to check your current tier.'
          );
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            undefined,
            `❌ ${errorMsg}`
          );
        }
      }
    } catch (error: any) {
      this.logger.error('Claim CMP failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Failed to claim airdrop: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Handle /subscription command - Show COMPLETE staking status with tier
   */
  async handleSubscription(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Loading your staking status...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          '❌ No wallet found. Please use /wallet to create one.'
        );
        return;
      }

      // Get staking status from backend API
      const response = await this.apiService.getStakingStatus(userWallet.address);
      
      // Handle both response formats (wrapped and unwrapped)
      const stakingData: any = response.data || response;
      if (!stakingData || (!stakingData.subscription && !stakingData.cmpBalance)) {
        throw new Error(response.error || 'Failed to fetch staking status');
      }
      
      // Normalize the data structure
      if (stakingData.subscription) {
        // Use subscription data as primary source
        stakingData.cmpBalance = stakingData.subscription.cmpBalance;
        stakingData.tier = stakingData.subscription.tier;
        stakingData.feeDiscount = stakingData.subscription.feeDiscount;
      }
      const tiers = await this.getTiers();
      
      // Format comprehensive status message
      let message = `🏆 *Your Tier Status*\n`;
      message += `━━━━━━━━━━━━━━━━━━\n\n`;
      
      // CMP BALANCE (not staked, just balance)
      const cmpBalance = stakingData.cmpBalance || stakingData.stakedAmount || '0';
      message += `💰 *CMP Balance:*\n`;
      message += `${parseFloat(cmpBalance).toLocaleString()} ${this.TOKEN_SYMBOL}\n\n`;
      
      // CURRENT TIER
      const currentTier = tiers.find(t => t.name === stakingData.tier) || tiers[0];
      message += `🎖️ *Current Tier:*\n`;
      message += `${currentTier.color} ${currentTier.name}\n`;
      message += `├ Fee Discount: ${stakingData.feeDiscount || 0}%\n`;
      message += `└ Status: ${parseFloat(cmpBalance) >= 1000 ? '✅ Active' : '❌ Inactive'}\n\n`;
      
      // Check if airdrop is available
      const hasBalance = parseFloat(cmpBalance) > 0;
      if (!hasBalance) {
        message += `🎁 *Get Started:*\n`;
        message += `Use /claimcmp to claim your initial 1000 CMP tokens!\n\n`;
      }
      
      if (stakingData.lastClaimTime > 0) {
        const lastClaim = new Date(stakingData.lastClaimTime * 1000);
        message += `└ Last Claim: ${lastClaim.toLocaleDateString()}\n`;
      }
      message += '\n';
      
      // LOCK STATUS
      if (stakingData.lockEndTime > Date.now() / 1000) {
        const unlockDate = new Date(stakingData.lockEndTime * 1000);
        message += `🔒 *Lock Status:*\n`;
        message += `Locked until: ${unlockDate.toLocaleDateString()}\n`;
        message += `${stakingData.canUnstake ? '✅ Can unstake' : '⏰ Wait for unlock'}\n\n`;
      }
      
      // PROGRESS TO NEXT TIER
      const nextTierIndex = tiers.findIndex(t => t.name === stakingData.tier) + 1;
      const nextTier = nextTierIndex < tiers.length ? tiers[nextTierIndex] : null;
      
      if (nextTier) {
        const currentStake = parseFloat(stakingData.stakedAmount);
        const progress = (currentStake / nextTier.minStake) * 100;
        message += `📈 *Progress to ${nextTier.name}:*\n`;
        message += this.createProgressBar(progress);
        message += `\n${currentStake.toLocaleString()} / ${nextTier.minStake.toLocaleString()} ${this.TOKEN_SYMBOL}`;
        message += ` (${progress.toFixed(1)}%)\n\n`;
      }
      
      // TIER BENEFITS
      message += `🎯 *Your Benefits:*\n`;
      message += `├ Trading Fee: ${stakingData.feeDiscount}% OFF\n`;
      message += `├ Copy Trade Slots: ${stakingData.copyTradeSlots}\n`;
      message += `├ Alert Limits: ${stakingData.maxAlerts === -1 ? 'Unlimited' : stakingData.maxAlerts}\n`;
      message += `├ API Access: ${stakingData.hasApiAccess ? '✅' : '❌'}\n`;
      message += `└ Priority Support: ${currentTier.name === 'Gold' || currentTier.name === 'Platinum' ? '✅' : '❌'}\n\n`;
      
      message += `💡 *Tip:* Stake more ${this.TOKEN_SYMBOL} to unlock higher tiers!`;

      // Create action buttons
      const keyboard = [
        [
          Markup.button.callback('➕ Stake More', 'stake_more'),
          Markup.button.callback('➖ Unstake', 'unstake_tokens'),
        ],
        [
          Markup.button.callback('💸 Claim Rewards', 'claim_rewards'),
          Markup.button.callback('📊 View Tiers', 'view_tiers'),
        ],
        [
          Markup.button.callback('🔄 Refresh', 'refresh_staking'),
        ]
      ];

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    } catch (error) {
      this.logger.error('Failed to show subscription status:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '❌ Failed to load staking status. Please try again later.'
      );
    }
  }

  /**
   * Handle /stake command - Now shows balance-based tier message
   */
  async handleStake(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    let message = `📢 *Staking System Update!*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `✨ *No more staking required!*\n\n`;
    message += `Your tier is now automatically determined by your CMP token balance.\n\n`;
    message += `🎖️ *Tier Requirements:*\n`;
    message += `• 🥉 Bronze: 1,000+ CMP\n`;
    message += `• 🥈 Silver: 5,000+ CMP\n`;
    message += `• 🥇 Gold: 10,000+ CMP\n`;
    message += `• 💎 Platinum: 50,000+ CMP\n\n`;
    message += `💡 *How to get CMP:*\n`;
    message += `• Use /claimcmp to get your initial 1000 CMP (one-time)\n`;
    message += `• Use /buycmp to purchase more CMP tokens\n\n`;
    message += `📊 Check your current tier with /subscription`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /unstake command - Now shows balance-based tier message
   */
  async handleUnstake(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    let message = `📢 *No Unstaking Needed!*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `✨ The new tier system is based on your CMP balance, not staked amounts.\n\n`;
    message += `You can freely:\n`;
    message += `• 💸 Transfer CMP tokens anytime\n`;
    message += `• 📈 Trade CMP on DEX\n`;
    message += `• 🔄 Send CMP to other wallets\n\n`;
    message += `Your tier automatically adjusts based on your balance!\n\n`;
    message += `📊 Check your current tier with /subscription`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /claim command - Now redirects to /claimcmp for initial airdrop
   */
  async handleClaim(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    let message = `📢 *Claim System Update!*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `🎁 *Initial CMP Airdrop Available!*\n\n`;
    message += `You can claim 1000 CMP tokens (one-time only) to get started.\n\n`;
    message += `Use /claimcmp to claim your initial tokens!\n\n`;
    message += `💡 *Note:* There are no staking rewards in the new system.\n`;
    message += `Your tier benefits are automatic based on your CMP balance.`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /tiers command - Show all tiers
   */
  async handleTiers(ctx: BotContext): Promise<void> {
    const tiers = await this.getTiers();
    
    let message = `🏆 *CMP Balance Tiers & Benefits*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const tier of tiers) {
      message += `${tier.color} *${tier.name} Tier*\n`;
      message += `├ Min Balance: ${tier.minStake.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      message += `├ Trading Fee: ${tier.feeDiscount}% OFF\n`;
      message += `├ Copy Trades: ${tier.copyTradeSlots} slots\n`;
      message += `├ Price Alerts: ${tier.maxAlerts === -1 ? 'Unlimited' : tier.maxAlerts}\n`;
      message += `├ API Access: ${tier.apiAccess ? '✅' : '❌'}\n`;
      message += `└ Priority Support: ${tier.name === 'Gold' || tier.name === 'Platinum' ? '✅' : '❌'}\n\n`;
    }
    
    message += `💡 *How it works:*\n`;
    message += `• Hold ${this.TOKEN_SYMBOL} tokens to unlock benefits\n`;
    message += `• Higher balance = Better rewards\n`;
    message += `• No staking required - just hold!\n`;
    message += `• Tier updates automatically\n\n`;
    message += `Use /claimcmp to get your initial 1000 CMP!`;
    
    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            Markup.button.callback('💎 Start Staking', 'stake_more'),
            Markup.button.callback('📊 My Status', 'refresh_staking'),
          ]
        ]
      }
    });
  }

  /**
   * Helper function to create progress bar
   */
  private createProgressBar(percentage: number): string {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '▰'.repeat(Math.min(filled, 10)) + '▱'.repeat(Math.max(empty, 0));
  }

  private formatStakeError(message?: string): string {
    const CMP = process.env.PLATFORM_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
    if (!message) return '❌ Staking failed: Unknown error';
    const lower = message.toLowerCase();
    if (lower.includes('authentication required') || lower.includes('auth')) {
      return '🔒 Please /start the bot to authenticate, then try staking again.';
    }
    if (lower.includes('invalid amount')) {
      return '❌ Invalid amount. Please enter a positive number.';
    }
    if (lower.includes('insufficient token balance')) {
      return `❌ Insufficient CMP balance. You need CMP to stake.\n\nQuick actions:\n• /buycmp 1 — Buy 1 CORE worth of CMP\n• /buy ${CMP} — Open CMP buy panel`;
    }
    return `❌ Staking failed: ${message}`;
  }
}