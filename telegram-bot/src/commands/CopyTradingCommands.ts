import { Context } from 'telegraf'
import { MemeFactoryCopyTrader } from '../trading/MemeFactoryCopyTrader'
import { DatabaseService } from '../../../shared/src/services/DatabaseService'
import { StakingService } from '../../../shared/src/services/StakingService'
import { ethers } from 'ethers'

const databaseService = DatabaseService.getInstance()
const stakingService = StakingService.getInstance()

export class CopyTradingCommands {
  private copyTrader: MemeFactoryCopyTrader

  constructor() {
    const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com')
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider)
    this.copyTrader = new MemeFactoryCopyTrader(wallet)
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
      const user = await databaseService.getUser(telegramId)
      if (!user) {
        await ctx.reply('❌ User not found. Please start with /start')
        return
      }

      const stakingData = await stakingService.getUserStakingData(user.wallet_address)
      if (!stakingData.isStaked) {
        await ctx.reply(
          '❌ You need an active staking subscription to use copy trading.\n\n' +
          'Use `/subscribe` to view staking plans.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Check available slots based on tier
      const maxSlots = this.getMaxSlotsForTier(stakingData.tier)
      const currentCopyTrades = await this.getCurrentCopyTrades(telegramId)
      
      if (currentCopyTrades.length >= maxSlots) {
        await ctx.reply(
          `❌ You've reached your copy trading limit.\n\n` +
          `Current tier: *${stakingData.tier}*\n` +
          `Max slots: ${maxSlots}\n` +
          `Used slots: ${currentCopyTrades.length}\n\n` +
          `Upgrade your subscription for more slots!`,
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Start copy trading
      await ctx.reply('🔄 Starting copy trading...')
      
      const success = await this.copyTrader.startCopyTrading(
        user.wallet_address,
        targetWallet
      )

      if (success) {
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
      
      const user = await databaseService.getUser(telegramId)
      if (!user) {
        await ctx.reply('❌ User not found')
        return
      }

      // Stop copy trading
      const success = await this.copyTrader.stopCopyTrading(
        user.wallet_address,
        targetWallet
      )

      if (success) {
        await this.removeCopyTradeRelation(telegramId, targetWallet)
        await ctx.reply(
          `✅ Stopped copying trades from:\n\`${targetWallet}\``,
          { parse_mode: 'Markdown' }
        )
      } else {
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

      const user = await databaseService.getUser(telegramId)
      if (!user) {
        await ctx.reply('❌ User not found')
        return
      }

      const copyTrades = await this.getCurrentCopyTrades(telegramId)
      const stakingData = await stakingService.getUserStakingData(user.wallet_address)
      const maxSlots = this.getMaxSlotsForTier(stakingData.tier)

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
        `• Win Rate: ${(analysis.winRate * 100).toFixed(1)}%\n` +
        `• Total Trades: ${analysis.totalTrades}\n` +
        `• Profitable: ${analysis.profitableTrades}\n` +
        `• Total Profit: ${analysis.totalProfit.toFixed(4)} CORE\n` +
        `• Avg Profit: ${analysis.averageProfit.toFixed(4)} CORE\n\n` +
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
      const query = `
        SELECT * FROM copy_trades 
        WHERE telegram_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `
      const result = await databaseService.query(query, [telegramId])
      return result.rows
    } catch (error) {
      // Table might not exist yet
      return []
    }
  }

  private async storeCopyTradeRelation(telegramId: string, targetWallet: string) {
    try {
      // Create table if it doesn't exist
      await databaseService.query(`
        CREATE TABLE IF NOT EXISTS copy_trades (
          id SERIAL PRIMARY KEY,
          telegram_id VARCHAR(255) NOT NULL,
          target_wallet VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Insert the relationship
      await databaseService.query(
        `INSERT INTO copy_trades (telegram_id, target_wallet) VALUES ($1, $2)`,
        [telegramId, targetWallet]
      )
    } catch (error) {
      console.error('Error storing copy trade relation:', error)
    }
  }

  private async removeCopyTradeRelation(telegramId: string, targetWallet: string) {
    try {
      await databaseService.query(
        `UPDATE copy_trades SET is_active = false, updated_at = CURRENT_TIMESTAMP 
         WHERE telegram_id = $1 AND target_wallet = $2`,
        [telegramId, targetWallet]
      )
    } catch (error) {
      console.error('Error removing copy trade relation:', error)
    }
  }
}