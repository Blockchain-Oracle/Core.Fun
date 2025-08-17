import { Context } from 'telegraf'
import { MemeFactoryCopyTrader } from '../trading/MemeFactoryCopyTrader'
import { DatabaseService, ContractDataService } from '@core-meme/shared'
import { ethers } from 'ethers'
import { ApiService } from '../services/ApiService'

const databaseService = new DatabaseService()
const contractService = new ContractDataService(
  process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com',
  process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa'
)
const apiService = new ApiService()

export class CopyTradingCommands {
  private copyTrader: MemeFactoryCopyTrader

  constructor() {
    this.copyTrader = new MemeFactoryCopyTrader(databaseService)
  }

  async handleStartCopyTrading(ctx: Context) {
    try {
      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        await ctx.reply('❌ Could not identify user')
        return
      }

      // Parse the wallet address from the command
      const text = (ctx as any).message?.text || ''
      const parts = text.split(' ')
      
      if (parts.length < 2) {
        await ctx.reply(
          '📋 *Copy Trading*\n\n' +
          'Usage: `/copytrade <wallet_address>`\n\n' +
          'Start copying trades from a successful trader.\n\n' +
          '⚠️ *Requirements:*\n' +
          '• Active staking subscription\n' +
          '• Available copy slots based on tier:\n' +
          '  • Bronze: 1 slot\n' +
          '  • Silver: 3 slots\n' +
          '  • Gold: 5 slots\n' +
          '  • Platinum: 10 slots',
          { parse_mode: 'Markdown' }
        )
        return
      }

      const targetWallet = parts[1]
      
      // Validate wallet address
      if (!ethers.isAddress(targetWallet)) {
        await ctx.reply('❌ Invalid wallet address. Please provide a valid Ethereum address.')
        return
      }

      // Check user's staking status
      const user = await databaseService.getUserByTelegramId(parseInt(telegramId!))
      if (!user) {
        await ctx.reply('❌ User not found. Please start with /start')
        return
      }

      // Get staking status from API
      const stakingResponse = await apiService.getStakingStatus(user.walletAddress)
      const stakingData: any = stakingResponse.data || stakingResponse
      
      // Check if user has a valid tier (Bronze or higher = tierLevel > 0)
      if (!stakingData?.subscription || stakingData.subscription.tierLevel === 0) {
        await ctx.reply(
          '❌ You need an active staking subscription to use copy trading.\n\n' +
          'Use `/subscribe` to view staking plans.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Check available slots based on tier
      const tierLevel = stakingData.subscription.tierLevel
      const maxSlots = this.getMaxSlotsForTier(tierLevel.toString())
      const currentCopyTrades = await this.getCurrentCopyTrades(telegramId)
      
      if (currentCopyTrades.length >= maxSlots) {
        await ctx.reply(
          `❌ You've reached your copy trading limit.\n\n` +
          `Current tier: *${stakingData.subscription.tier}*\n` +
          `Max slots: ${maxSlots}\n` +
          `Used slots: ${currentCopyTrades.length}\n\n` +
          `Upgrade your subscription for more slots!`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Start copy trading
      await ctx.reply('🔄 Starting copy trading...')
      
      const success = await this.copyTrader.startCopyTrading({
        userId: telegramId,
        targetWallet: targetWallet,
        enabled: true,
        copyBuys: true,
        copySells: true,
        maxAmountPerTrade: 1.0,
        percentageOfWallet: 10,
        minTokenAge: 0,
        maxSlippage: 5,
        blacklistedTokens: [],
        whitelistedTokens: [],
        createdAt: new Date()
      })

      if (success && success.enabled) {
        // Store in database
        await this.storeCopyTradeRelation(telegramId, targetWallet)
        
        await ctx.reply(
          `✅ *Copy Trading Started!*\n\n` +
          `📊 Copying trades from:\n` +
          `\`${targetWallet}\`\n\n` +
          `Slots used: ${currentCopyTrades.length + 1}/${maxSlots}\n\n` +
          `You'll receive notifications when trades are executed.\n` +
          `Use \`/copylist\` to view active copy trades.\n` +
          `Use \`/copystop ${targetWallet}\` to stop copying.`,
          { parse_mode: 'Markdown' }
        )
      } else {
        await ctx.reply('❌ Failed to start copy trading. Please try again.')
      }
    } catch (error) {
      console.error('Error in handleStartCopyTrading:', error)
      await ctx.reply('❌ An error occurred. Please try again later.')
    }
  }

  async handleStopCopyTrading(ctx: Context) {
    try {
      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        await ctx.reply('❌ Could not identify user')
        return
      }

      const text = (ctx as any).message?.text || ''
      const parts = text.split(' ')
      
      if (parts.length < 2) {
        await ctx.reply(
          '📋 Usage: `/copystop <wallet_address>`\n\n' +
          'Stop copying trades from a specific wallet.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      const targetWallet = parts[1]
      
      const user = await databaseService.getUserByTelegramId(parseInt(telegramId!))
      if (!user) {
        await ctx.reply('❌ User not found')
        return
      }

      // Stop copy trading
      try {
        await this.copyTrader.stopCopyTrading(
          user.walletAddress,
          targetWallet
        )
        
        await this.removeCopyTradeRelation(telegramId, targetWallet)
        await ctx.reply(
          `✅ Stopped copying trades from:\n\`${targetWallet}\``,
          { parse_mode: 'Markdown' }
        )
      } catch (error) {
        console.error('Error stopping copy trading:', error)
        await ctx.reply('❌ Failed to stop copy trading or not currently copying this wallet.')
      }
    } catch (error) {
      console.error('Error in handleStopCopyTrading:', error)
      await ctx.reply('❌ An error occurred. Please try again later.')
    }
  }

  async handleListCopyTrades(ctx: Context) {
    try {
      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        await ctx.reply('❌ Could not identify user')
        return
      }

      const user = await databaseService.getUserByTelegramId(parseInt(telegramId!))
      if (!user) {
        await ctx.reply('❌ User not found')
        return
      }

      const copyTrades = await this.getCurrentCopyTrades(telegramId)
      const stakingData = await contractService.getUserStakingBenefits(user.walletAddress)
      const maxSlots = this.getMaxSlotsForTier(stakingData.tier.toString())

      if (copyTrades.length === 0) {
        await ctx.reply(
          `📊 *Your Copy Trading Status*\n\n` +
          `Tier: ${stakingData.tier}\n` +
          `Available slots: ${maxSlots}\n\n` +
          `You're not copying any traders.\n` +
          `Use \`/copytrade <wallet>\` to start!`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      let message = `📊 *Your Copy Trading Status*\n\n`
      message += `Tier: ${stakingData.tier}\n`
      message += `Slots: ${copyTrades.length}/${maxSlots}\n\n`
      message += `*Active Copy Trades:*\n`

      for (const trade of copyTrades) {
        message += `\n• \`${trade.target_wallet}\`\n`
        message += `  Started: ${new Date(trade.created_at).toLocaleDateString()}\n`
      }

      message += `\n\nUse \`/copystop <wallet>\` to stop copying a trader.`

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Error in handleListCopyTrades:', error)
      await ctx.reply('❌ An error occurred. Please try again later.')
    }
  }

  async handleTopTraders(ctx: Context) {
    try {
      await ctx.reply('🔄 Analyzing top traders...')
      
      const topTraders = await this.copyTrader.getTopTraders(10)
      
      if (!topTraders || topTraders.length === 0) {
        await ctx.reply('No top traders found at the moment. Check back later!')
        return
      }

      let message = `🏆 *Top Traders to Copy*\n\n`
      
      for (let i = 0; i < topTraders.length; i++) {
        const trader = topTraders[i]
        message += `${i + 1}. \`${trader.address.slice(0, 6)}...${trader.address.slice(-4)}\`\n`
        message += `   📈 Win Rate: ${(trader.winRate * 100).toFixed(1)}%\n`
        message += `   💰 Total Profit: ${trader.totalProfit.toFixed(2)} CORE\n`
        message += `   🔄 Total Trades: ${trader.totalTrades}\n\n`
      }

      message += `\nUse \`/copytrade <wallet>\` to start copying!`

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Error in handleTopTraders:', error)
      await ctx.reply('❌ An error occurred while fetching top traders.')
    }
  }

  async handleAnalyzeWallet(ctx: Context) {
    try {
      const text = (ctx as any).message?.text || ''
      const parts = text.split(' ')
      
      if (parts.length < 2) {
        await ctx.reply(
          '📋 Usage: `/analyze <wallet_address>`\n\n' +
          'Analyze a wallet\'s trading performance.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      const walletAddress = parts[1]
      
      if (!ethers.isAddress(walletAddress)) {
        await ctx.reply('❌ Invalid wallet address')
        return
      }

      await ctx.reply('🔄 Analyzing wallet performance...')
      
      const analysis = await this.copyTrader.analyzeWallet(walletAddress)
      
      if (!analysis) {
        await ctx.reply('No trading data found for this wallet.')
        return
      }

      const message = `📊 *Wallet Analysis*\n\n` +
        `Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`\n\n` +
        `📈 *Performance:*\n` +
        `• Total Trades: ${analysis.totalTrades}\n` +
        `• Win Rate: ${(analysis.winRate * 100).toFixed(1)}%\n` +
        `• Total Profit: ${analysis.totalProfit.toFixed(4)} CORE\n` +
        `• Avg Profit: ${analysis.avgProfit.toFixed(4)} CORE\n\n` +
        `🎯 *Rating:* ${this.getRatingEmoji(analysis.winRate)}\n\n` +
        `Use \`/copytrade ${walletAddress}\` to copy this trader!`

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Error in handleAnalyzeWallet:', error)
      await ctx.reply('❌ An error occurred while analyzing the wallet.')
    }
  }

  // Helper methods
  private getMaxSlotsForTier(tier: string): number {
    const slots: Record<string, number> = {
      'Bronze': 1,
      'Silver': 3,
      'Gold': 5,
      'Platinum': 10
    }
    return slots[tier] || 0
  }

  private getRatingEmoji(winRate: number): string {
    if (winRate >= 0.8) return '⭐⭐⭐⭐⭐ Excellent'
    if (winRate >= 0.6) return '⭐⭐⭐⭐ Very Good'
    if (winRate >= 0.4) return '⭐⭐⭐ Good'
    if (winRate >= 0.2) return '⭐⭐ Fair'
    return '⭐ Poor'
  }

  private async getCurrentCopyTrades(telegramId: string): Promise<any[]> {
    try {
      // First get the user to get the userId
      const user = await databaseService.getUserByTelegramId(parseInt(telegramId))
      if (!user) {
        return []
      }
      
      // Get active copy trades for this user
      const copyTrades = await databaseService.getUserActiveCopyTrades(user.id)
      return copyTrades
    } catch (error) {
      // Return empty array on error
      return []
    }
  }

  private async storeCopyTradeRelation(telegramId: string, targetWallet: string) {
    try {
      // Get user by telegram ID
      const user = await databaseService.getUserByTelegramId(parseInt(telegramId))
      if (!user) {
        console.error('User not found for telegram ID:', telegramId)
        return
      }

      // Create copy trade settings using the existing method
      const copyTradeSettings = {
        userId: user.id,
        targetWallet: targetWallet,
        enabled: true,
        copyBuys: true,
        copySells: true,
        maxAmountPerTrade: 1.0,
        percentageOfWallet: 10,
        minTokenAge: 0,
        maxSlippage: 5,
        blacklistedTokens: [],
        whitelistedTokens: [],
        createdAt: new Date()
      }

      await databaseService.saveCopyTradeSettings(copyTradeSettings)
    } catch (error) {
      console.error('Error storing copy trade relation:', error)
    }
  }

  private async removeCopyTradeRelation(telegramId: string, targetWallet: string) {
    try {
      // Get user by telegram ID
      const user = await databaseService.getUserByTelegramId(parseInt(telegramId))
      if (!user) {
        console.error('User not found for telegram ID:', telegramId)
        return
      }

      // Update copy trade settings to disable
      await databaseService.updateCopyTradeSettings(user.id, targetWallet, { enabled: false })
    } catch (error) {
      console.error('Error removing copy trade relation:', error)
    }
  }
}