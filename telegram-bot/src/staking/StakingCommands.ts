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
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch staking status');
      }

      const stakingData = response.data;
      const tiers = await this.getTiers();
      
      // Format comprehensive status message
      let message = `🏆 *Your Staking Status*\n`;
      message += `━━━━━━━━━━━━━━━━━━\n\n`;
      
      // STAKING AMOUNT
      message += `💰 *Staked Amount:*\n`;
      message += `${parseFloat(stakingData.stakedAmount).toLocaleString()} ${this.TOKEN_SYMBOL}\n\n`;
      
      // CURRENT TIER
      const currentTier = tiers.find(t => t.name === stakingData.tier) || tiers[0];
      message += `🎖️ *Current Tier:*\n`;
      message += `${currentTier.color} ${currentTier.name}\n`;
      message += `├ Fee Discount: ${stakingData.feeDiscount}%\n`;
      message += `├ APY: ${stakingData.apy}%\n`;
      message += `└ Status: ${parseFloat(stakingData.stakedAmount) > 0 ? '✅ Active' : '❌ Inactive'}\n\n`;
      
      // PENDING REWARDS
      message += `🎁 *Pending Rewards:*\n`;
      message += `${parseFloat(stakingData.rewards).toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      
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
   * Handle /stake command
   */
  async handleStake(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      const tiers = await this.getTiers();
      let message = `💎 *Stake ${this.TOKEN_SYMBOL} Tokens*\n\n`;
      message += `Choose your staking amount to unlock tier benefits:\n\n`;
      
      for (const tier of tiers) {
        message += `${tier.color} *${tier.name} Tier*\n`;
        message += `├ Min Stake: ${tier.minStake.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
        message += `├ Fee Discount: ${tier.feeDiscount}%\n`;
        message += `├ APY: ${tier.apy}%\n`;
        message += `└ Copy Trades: ${tier.copyTradeSlots} slots\n\n`;
      }
      
      message += `📝 *Usage:* /stake [amount]\n`;
      message += `Example: /stake 5000`;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }

    const amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return;
    }

    const loadingMsg = await ctx.reply(`🔄 Staking ${amount} ${this.TOKEN_SYMBOL}...`);

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      // Set auth token for the API service
      const authToken = ctx.session.authToken || ''; // You'll need to implement auth token management
      this.apiService.setAuthToken(authToken);

      // Execute stake through backend API
      const response = await this.apiService.stake(amount.toString());
      
      if (!response.success) {
        throw new Error(response.error || 'Staking failed');
      }

      const tiers = await this.getTiers();
      const newTier = tiers.find(t => amount >= t.minStake) || tiers[0];
      
      let successMessage = `✅ *Staking Successful!*\n\n`;
      successMessage += `Amount: ${amount.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      successMessage += `Transaction: \`${response.data?.txHash}\`\n\n`;
      successMessage += `🎖️ Your tier: ${newTier.color} ${newTier.name}\n`;
      successMessage += `Benefits unlocked:\n`;
      successMessage += `• ${newTier.feeDiscount}% trading fee discount\n`;
      successMessage += `• ${newTier.copyTradeSlots} copy trade slots\n`;
      successMessage += `• ${newTier.maxAlerts === -1 ? 'Unlimited' : newTier.maxAlerts} price alerts\n`;
      successMessage += `• ${newTier.apy}% APY rewards`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        successMessage,
        { parse_mode: 'Markdown' }
      );

    } catch (error: any) {
      this.logger.error('Stake failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Staking failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Handle /unstake command
   */
  async handleUnstake(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      await ctx.reply(
        `📝 *Usage:* /unstake [amount]\n\nExample: /unstake 1000\n\nUse /unstake all to unstake everything`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Processing unstake request...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      // Get current staking status
      const statusResponse = await this.apiService.getStakingStatus(userWallet.address);
      if (!statusResponse.success || !statusResponse.data) {
        throw new Error('Failed to get staking status');
      }

      const currentStake = parseFloat(statusResponse.data.stakedAmount);
      let unstakeAmount: number;

      if (args[0].toLowerCase() === 'all') {
        unstakeAmount = currentStake;
      } else {
        unstakeAmount = parseFloat(args[0]);
        if (isNaN(unstakeAmount) || unstakeAmount <= 0) {
          throw new Error('Invalid amount');
        }
        if (unstakeAmount > currentStake) {
          throw new Error(`You only have ${currentStake} ${this.TOKEN_SYMBOL} staked`);
        }
      }

      // Check if user can unstake (lock period)
      if (!statusResponse.data.canUnstake) {
        const unlockDate = new Date(statusResponse.data.lockEndTime * 1000);
        throw new Error(`Your tokens are locked until ${unlockDate.toLocaleDateString()}`);
      }

      // Set auth token
      const authToken = ctx.session.authToken || '';
      this.apiService.setAuthToken(authToken);

      // Execute unstake through backend API
      const response = await this.apiService.unstake(unstakeAmount.toString());
      
      if (!response.success) {
        throw new Error(response.error || 'Unstaking failed');
      }

      let successMessage = `✅ *Unstaking Successful!*\n\n`;
      successMessage += `Amount: ${unstakeAmount.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      successMessage += `Transaction: \`${response.data?.txHash}\`\n\n`;
      successMessage += `Remaining Staked: ${(currentStake - unstakeAmount).toLocaleString()} ${this.TOKEN_SYMBOL}`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        successMessage,
        { parse_mode: 'Markdown' }
      );

    } catch (error: any) {
      this.logger.error('Unstake failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Unstaking failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Handle /claim command
   */
  async handleClaim(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('🔄 Claiming rewards...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      // Get current rewards
      const statusResponse = await this.apiService.getStakingStatus(userWallet.address);
      if (!statusResponse.success || !statusResponse.data) {
        throw new Error('Failed to get staking status');
      }

      const pendingRewards = parseFloat(statusResponse.data.rewards);
      if (pendingRewards <= 0) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          '❌ No rewards to claim yet. Keep staking to earn rewards!'
        );
        return;
      }

      // Set auth token
      const authToken = ctx.session.authToken || '';
      this.apiService.setAuthToken(authToken);

      // Execute claim through backend API
      const response = await this.apiService.claimRewards();
      
      if (!response.success) {
        throw new Error(response.error || 'Claim failed');
      }

      let successMessage = `✅ *Rewards Claimed!*\n\n`;
      successMessage += `Amount: ${pendingRewards.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      successMessage += `Transaction: \`${response.data?.txHash}\`\n\n`;
      successMessage += `🎯 Keep staking to earn more rewards!`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        successMessage,
        { parse_mode: 'Markdown' }
      );

    } catch (error: any) {
      this.logger.error('Claim failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Claim failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Handle /tiers command - Show all tiers
   */
  async handleTiers(ctx: BotContext): Promise<void> {
    const tiers = await this.getTiers();
    
    let message = `🏆 *Staking Tiers & Benefits*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const tier of tiers) {
      message += `${tier.color} *${tier.name} Tier*\n`;
      message += `├ Min Stake: ${tier.minStake.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      message += `├ Trading Fee: ${tier.feeDiscount}% OFF\n`;
      message += `├ APY: ${tier.apy}%\n`;
      message += `├ Copy Trades: ${tier.copyTradeSlots} slots\n`;
      message += `├ Price Alerts: ${tier.maxAlerts === -1 ? 'Unlimited' : tier.maxAlerts}\n`;
      message += `├ API Access: ${tier.apiAccess ? '✅' : '❌'}\n`;
      message += `└ Priority Support: ${tier.name === 'Gold' || tier.name === 'Platinum' ? '✅' : '❌'}\n\n`;
    }
    
    message += `💡 *How it works:*\n`;
    message += `• Stake ${this.TOKEN_SYMBOL} tokens to unlock benefits\n`;
    message += `• Higher tiers = Better rewards\n`;
    message += `• Earn APY on your staked tokens\n`;
    message += `• Unstake anytime (after lock period)\n\n`;
    message += `Use /stake to start earning!`;
    
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
}