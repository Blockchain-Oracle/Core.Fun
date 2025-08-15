import { BotContext } from '../bot';
import { DatabaseService } from '@core-meme/shared';
import { WalletService } from '@core-meme/shared';
import { Markup } from 'telegraf';
import { createLogger } from '@core-meme/shared';
import { ContractDataService } from '@core-meme/shared';
import { ethers } from 'ethers';

// TIER CONFIGURATION - MUST MATCH STAKING CONTRACT
const STAKING_TIERS = [
  {
    name: 'Bronze',
    minStake: 1000,
    feeDiscount: 1,
    color: '🥉'
  },
  {
    name: 'Silver',
    minStake: 5000,
    feeDiscount: 2,
    color: '🥈'
  },
  {
    name: 'Gold',
    minStake: 10000,
    feeDiscount: 3,
    color: '🥇'
  },
  {
    name: 'Platinum',
    minStake: 50000,
    feeDiscount: 5,
    color: '💎'
  }
];

export class StakingCommands {
  private logger = createLogger({ service: 'staking-commands' });
  private db: DatabaseService;
  private walletService: WalletService;
  private contractService: ContractDataService;
  
  // Contract addresses from deployment
  private readonly STAKING_ADDRESS = process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa';
  private readonly PLATFORM_TOKEN_ADDRESS = process.env.PLATFORM_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
  private readonly TOKEN_SYMBOL = process.env.STAKING_TOKEN_SYMBOL || 'CMP';
  
  constructor(db: DatabaseService, walletService: WalletService) {
    this.db = db;
    this.walletService = walletService;
    
    // Initialize contract service
    this.contractService = new ContractDataService(
      process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network',
      process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
      this.STAKING_ADDRESS
    );
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

      // Get COMPLETE staking data from contract
      const stakingData = await this.contractService.getUserStakingBenefits(userWallet.address);
      
      // Format comprehensive status message
      let message = `🏆 *Your Staking Status*\n`;
      message += `━━━━━━━━━━━━━━━━━━\n\n`;
      
      // STAKING AMOUNT
      message += `💰 *Staked Amount:*\n`;
      message += `${ethers.formatEther(stakingData.userStake || '0')} ${this.TOKEN_SYMBOL}\n\n`;
      
      // CURRENT TIER
      const currentTier = this.getTierFromStake(Number(ethers.formatEther(stakingData.userStake || '0')));
      message += `🎖️ *Current Tier:*\n`;
      message += `${currentTier.color} ${currentTier.name}\n`;
      message += `├ Fee Discount: ${currentTier.feeDiscount}%\n`;
      message += `└ Status: ${stakingData.tier > 0 ? '✅ Active' : '❌ Inactive'}\n\n`;
      
      // PENDING REWARDS
      message += `🎁 *Pending Rewards:*\n`;
      message += `${ethers.formatEther(stakingData.pendingRewards || '0')} ${this.TOKEN_SYMBOL}\n\n`;
      
      // PROGRESS TO NEXT TIER
      const nextTier = this.getNextTier(Number(ethers.formatEther(stakingData.userStake || '0')));
      if (nextTier) {
        const currentStake = Number(ethers.formatEther(stakingData.userStake || '0'));
        const progress = (currentStake / nextTier.minStake) * 100;
        message += `📈 *Progress to ${nextTier.name}:*\n`;
        message += this.createProgressBar(progress);
        message += `\n${currentStake.toFixed(2)} / ${nextTier.minStake} ${this.TOKEN_SYMBOL}`;
        message += ` (${progress.toFixed(1)}%)\n\n`;
      }
      
      // TIER BENEFITS
      message += `🎯 *Your Benefits:*\n`;
      message += `├ Trading Fee: ${stakingData.feeDiscount || 0}% OFF\n`;
      message += `├ Copy Trade Slots: ${this.getCopyTradeSlots(stakingData.tier)}\n`;
      message += `├ Alert Limits: ${this.getAlertLimit(stakingData.tier)}\n`;
      message += `└ Priority Support: ${stakingData.tier >= 2 ? '✅' : '❌'}\n\n`;
      
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
        '❌ Failed to load staking status'
      );
    }
  }

  /**
   * Handle /stake command - Interactive staking with approval
   */
  async handleStake(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      return this.showStakePanel(ctx);
    }

    const amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return;
    }

    await this.executeStake(ctx, amount);
  }

  /**
   * Show staking panel with amount options
   */
  private async showStakePanel(ctx: BotContext) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    // Get user's token balance
    const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
    if (!userWallet) {
      await ctx.reply('❌ No wallet found. Please use /wallet to create one.');
      return;
    }

    // Get token balance
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
    const tokenContract = new ethers.Contract(
      this.PLATFORM_TOKEN_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const balance = await tokenContract.balanceOf(userWallet.address);
    const balanceFormatted = ethers.formatEther(balance);

    let message = `💎 *Stake ${this.TOKEN_SYMBOL} Tokens*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `📊 *Your Balance:* ${balanceFormatted} ${this.TOKEN_SYMBOL}\n\n`;
    message += `Select amount to stake or enter custom amount:\n`;

    const keyboard = [
      [
        Markup.button.callback('1,000 CMP', 'stake_amount_1000'),
        Markup.button.callback('5,000 CMP', 'stake_amount_5000'),
      ],
      [
        Markup.button.callback('10,000 CMP', 'stake_amount_10000'),
        Markup.button.callback('50,000 CMP', 'stake_amount_50000'),
      ],
      [
        Markup.button.callback('💰 Custom Amount', 'stake_custom'),
        Markup.button.callback('🔄 Max', `stake_amount_${balanceFormatted}`),
      ],
      [
        Markup.button.callback('❌ Cancel', 'cancel'),
      ]
    ];

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Execute stake transaction
   */
  private async executeStake(ctx: BotContext, amount: number) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('⏳ Processing stake transaction...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      // Create provider and signer
      const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
      
      // Get user's telegram ID for decryption
      const user = await this.db.getUserById(ctx.session.userId);
      if (!user || !user.telegramId) {
        throw new Error('Could not find user telegram ID');
      }
      
      // Decrypt the private key
      const privateKey = await this.walletService.decryptPrivateKey(userWallet.encryptedPrivateKey || '', user.telegramId);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Token contract for approval
      const tokenContract = new ethers.Contract(
        this.PLATFORM_TOKEN_ADDRESS,
        [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function allowance(address owner, address spender) view returns (uint256)'
        ],
        wallet
      );
      
      // Staking contract
      const stakingContract = new ethers.Contract(
        this.STAKING_ADDRESS,
        ['function stake(uint256 amount) external'],
        wallet
      );

      const amountWei = ethers.parseEther(amount.toString());

      // Check allowance
      const allowance = await tokenContract.allowance(userWallet.address, this.STAKING_ADDRESS);
      
      // Approve if needed
      if (allowance < amountWei) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          '✅ Approving tokens for staking...'
        );
        
        const approveTx = await tokenContract.approve(this.STAKING_ADDRESS, amountWei);
        await approveTx.wait();
      }

      // Execute stake
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        '⏳ Staking tokens...'
      );
      
      const stakeTx = await stakingContract.stake(amountWei);
      const receipt = await stakeTx.wait();

      // Update database
      await this.db.updateUserSubscription(ctx.session.userId, this.getTierFromStake(amount).name.toLowerCase());

      // Success message
      let successMsg = `✅ *Successfully Staked!*\n\n`;
      successMsg += `Amount: ${amount} ${this.TOKEN_SYMBOL}\n`;
      successMsg += `TX: \`${receipt.hash}\`\n\n`;
      successMsg += `Your new tier benefits are now active!`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        successMsg,
        { parse_mode: 'Markdown' }
      );
    } catch (error: any) {
      this.logger.error('Stake transaction failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Stake failed: ${error.message}`
      );
    }
  }

  /**
   * Handle /unstake command - Unstake with confirmation
   */
  async handleUnstake(ctx: BotContext): Promise<void> {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = text.split(' ').slice(1);

    if (args.length === 0) {
      return this.showUnstakePanel(ctx);
    }

    const amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.');
      return;
    }

    await this.executeUnstake(ctx, amount);
  }

  /**
   * Show unstake panel
   */
  private async showUnstakePanel(ctx: BotContext) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
    if (!userWallet) {
      await ctx.reply('❌ No wallet found.');
      return;
    }

    const stakingData = await this.contractService.getUserStakingBenefits(userWallet.address);
    const stakedAmount = ethers.formatEther(stakingData.userStake || '0');

    let message = `💸 *Unstake ${this.TOKEN_SYMBOL} Tokens*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    message += `📊 *Currently Staked:* ${stakedAmount} ${this.TOKEN_SYMBOL}\n\n`;
    message += `⚠️ *Warning:* Unstaking will reduce your tier benefits!\n\n`;
    message += `Select amount to unstake:`;

    const keyboard = [
      [
        Markup.button.callback('25%', `unstake_percent_25`),
        Markup.button.callback('50%', `unstake_percent_50`),
        Markup.button.callback('75%', `unstake_percent_75`),
      ],
      [
        Markup.button.callback('100% (All)', `unstake_percent_100`),
        Markup.button.callback('Custom', 'unstake_custom'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'cancel'),
      ]
    ];

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Execute unstake transaction
   */
  private async executeUnstake(ctx: BotContext, amount: number) {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('⏳ Processing unstake transaction...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
      
      // Get user's telegram ID for decryption
      const user = await this.db.getUserById(ctx.session.userId);
      if (!user || !user.telegramId) {
        throw new Error('Could not find user telegram ID');
      }
      
      // Decrypt the private key
      const privateKey = await this.walletService.decryptPrivateKey(userWallet.encryptedPrivateKey || '', user.telegramId);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      const stakingContract = new ethers.Contract(
        this.STAKING_ADDRESS,
        ['function unstake(uint256 amount) external'],
        wallet
      );

      const amountWei = ethers.parseEther(amount.toString());
      const unstakeTx = await stakingContract.unstake(amountWei);
      const receipt = await unstakeTx.wait();

      // Check new tier
      const newStakingData = await this.contractService.getUserStakingBenefits(userWallet.address);
      const newStake = Number(ethers.formatEther(newStakingData.userStake || '0'));
      const newTier = this.getTierFromStake(newStake);

      // Update database
      await this.db.updateUserSubscription(ctx.session.userId, newTier.name.toLowerCase());

      let successMsg = `✅ *Successfully Unstaked!*\n\n`;
      successMsg += `Amount: ${amount} ${this.TOKEN_SYMBOL}\n`;
      successMsg += `Remaining Stake: ${newStake} ${this.TOKEN_SYMBOL}\n`;
      successMsg += `New Tier: ${newTier.color} ${newTier.name}\n`;
      successMsg += `TX: \`${receipt.hash}\``;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        successMsg,
        { parse_mode: 'Markdown' }
      );
    } catch (error: any) {
      this.logger.error('Unstake transaction failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Unstake failed: ${error.message}`
      );
    }
  }

  /**
   * Handle /claim command - Claim ALL pending rewards
   */
  async handleClaim(ctx: BotContext): Promise<void> {
    if (!ctx.session?.userId) {
      await ctx.reply('Please /start the bot first');
      return;
    }

    const loadingMsg = await ctx.reply('⏳ Claiming rewards...');

    try {
      const userWallet = await this.walletService.getPrimaryWallet(ctx.session.userId);
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      // Check pending rewards first
      const stakingData = await this.contractService.getUserStakingBenefits(userWallet.address);
      const pendingRewards = ethers.formatEther(stakingData.pendingRewards || '0');
      
      if (parseFloat(pendingRewards) === 0) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          loadingMsg.message_id,
          undefined,
          '❌ No rewards to claim'
        );
        return;
      }

      const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
      
      // Get user's telegram ID for decryption
      const user = await this.db.getUserById(ctx.session.userId);
      if (!user || !user.telegramId) {
        throw new Error('Could not find user telegram ID');
      }
      
      // Decrypt the private key
      const privateKey = await this.walletService.decryptPrivateKey(userWallet.encryptedPrivateKey || '', user.telegramId);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      const stakingContract = new ethers.Contract(
        this.STAKING_ADDRESS,
        ['function claimRewards() external'],
        wallet
      );

      const claimTx = await stakingContract.claimRewards();
      const receipt = await claimTx.wait();

      let successMsg = `✅ *Rewards Claimed!*\n\n`;
      successMsg += `Amount: ${pendingRewards} ${this.TOKEN_SYMBOL}\n`;
      successMsg += `TX: \`${receipt.hash}\`\n\n`;
      successMsg += `Rewards have been sent to your wallet!`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        successMsg,
        { parse_mode: 'Markdown' }
      );
    } catch (error: any) {
      this.logger.error('Claim rewards failed:', error);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        `❌ Claim failed: ${error.message}`
      );
    }
  }

  /**
   * Handle /tiers command - Show ALL tier benefits
   */
  async handleTiers(ctx: BotContext): Promise<void> {
    let message = `🏆 *Staking Tiers & Benefits*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    for (const tier of STAKING_TIERS) {
      message += `${tier.color} *${tier.name} Tier*\n`;
      message += `├ Min Stake: ${tier.minStake.toLocaleString()} ${this.TOKEN_SYMBOL}\n`;
      message += `├ Fee Discount: ${tier.feeDiscount}%\n`;
      message += `├ Copy Trades: ${this.getCopyTradeSlots(STAKING_TIERS.indexOf(tier))}\n`;
      message += `├ Alert Limit: ${this.getAlertLimit(STAKING_TIERS.indexOf(tier))}\n`;
      message += `└ Priority Support: ${STAKING_TIERS.indexOf(tier) >= 2 ? '✅' : '❌'}\n\n`;
    }
    
    message += `💡 *Additional Benefits:*\n`;
    message += `• Earn staking rewards\n`;
    message += `• Revenue sharing from platform fees\n`;
    message += `• Governance voting rights\n`;
    message += `• Early access to new features\n\n`;
    
    message += `Start staking with /stake command!`;

    const keyboard = [
      [Markup.button.callback('💎 Start Staking', 'start_staking')],
      [Markup.button.callback('📊 My Status', 'my_subscription')]
    ];

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  // Helper functions
  private getTierFromStake(stakeAmount: number): typeof STAKING_TIERS[0] {
    for (let i = STAKING_TIERS.length - 1; i >= 0; i--) {
      if (stakeAmount >= STAKING_TIERS[i].minStake) {
        return STAKING_TIERS[i];
      }
    }
    return { name: 'Free', minStake: 0, feeDiscount: 0, color: '🆓' };
  }

  private getNextTier(stakeAmount: number): typeof STAKING_TIERS[0] | null {
    for (const tier of STAKING_TIERS) {
      if (stakeAmount < tier.minStake) {
        return tier;
      }
    }
    return null;
  }

  private getCopyTradeSlots(tierIndex: number): number {
    const slots = [0, 3, 5, 10, 20];
    return slots[Math.min(tierIndex + 1, slots.length - 1)];
  }

  private getAlertLimit(tierIndex: number): number {
    const limits = [5, 10, 25, 50, 100];
    return limits[Math.min(tierIndex + 1, limits.length - 1)];
  }

  private createProgressBar(percentage: number): string {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }
}