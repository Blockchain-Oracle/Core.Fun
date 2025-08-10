import { Markup } from 'telegraf';
import { ethers } from 'ethers';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { BotContext } from '../bot';
import { DatabaseService } from '../services/DatabaseService';
import { SessionManager } from './SessionManager';
import { WalletService } from '../wallet/WalletService';
import { logger } from '../utils/logger';

export class AuthHandler {
  private db: DatabaseService;
  private sessionManager: SessionManager;
  private walletService: WalletService;
  private authCodes: Map<string, { 
    telegramId?: number; 
    expiresAt: Date;
    used: boolean;
  }> = new Map();

  constructor(db: DatabaseService, sessionManager: SessionManager) {
    this.db = db;
    this.sessionManager = sessionManager;
    this.walletService = new WalletService(db);
    
    // Clean up expired auth codes every minute
    setInterval(() => this.cleanupExpiredCodes(), 60000);
  }

  /**
   * Handle /start command
   */
  async handleStart(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || `user_${userId}`;
    const _firstName = ctx.from?.first_name || '';
    
    if (!userId) {
      await ctx.reply('Error: Unable to get user information');
      return;
    }

    try {
      // Check if user exists
      const user = await this.db.getUserByTelegramId(userId);
      
      if (!user) {
        // New user - create account and wallet
        await this.createNewUser(ctx, userId, username);
      } else {
        // Existing user - show main menu
        await this.showMainMenu(ctx, user);
      }
    } catch (error) {
      logger.error('Error in handleStart:', error);
      await ctx.reply('❌ An error occurred. Please try again.');
    }
  }

  /**
   * Handle authentication start with deep link
   */
  async handleAuthStart(ctx: BotContext, payload: string): Promise<void> {
    const authCode = payload.replace('auth_', '');
    const userId = ctx.from?.id;
    const username = ctx.from?.username || `user_${userId}`;
    
    if (!userId) {
      await ctx.reply('Error: Unable to get user information');
      return;
    }

    try {
      // Validate auth code
      const authData = this.authCodes.get(authCode);
      
      if (!authData || authData.used) {
        await ctx.reply(
          '❌ *Invalid or expired authentication code*\n\n' +
          'Please return to the website and try again.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (new Date() > authData.expiresAt) {
        this.authCodes.delete(authCode);
        await ctx.reply(
          '❌ *Authentication code expired*\n\n' +
          'Please return to the website and try again.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Mark code as used
      authData.used = true;
      authData.telegramId = userId;

      // Check if user exists
      let user = await this.db.getUserByTelegramId(userId);
      
      if (!user) {
        // Create new user with wallet
        user = await this.createUserWithWallet(userId, username);
      }

      // Generate login URL
      const loginUrl = await this.generateLoginUrl(authCode, user);

      // Send success message with login button
      await ctx.reply(
        `✅ *Authentication Successful!*\n\n` +
        `👤 Username: @${username}\n` +
        `💼 Wallet: \`${user.walletAddress}\`\n\n` +
        `Click the button below to complete login:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.url('🚀 Complete Login', loginUrl)],
            [Markup.button.callback('💼 View Wallet', 'wallet_view')],
            [Markup.button.callback('📊 Open Dashboard', 'dashboard')],
          ])
        }
      );

      logger.info(`User ${userId} authenticated via deep link`);

    } catch (error) {
      logger.error('Error in handleAuthStart:', error);
      await ctx.reply('❌ Authentication failed. Please try again.');
    }
  }

  /**
   * Create new user with auto-generated wallet
   */
  private async createNewUser(ctx: BotContext, telegramId: number, username: string) {
    const loadingMsg = await ctx.reply('🔄 Creating your account...');
    
    try {
      // Generate new wallet
      const wallet = ethers.Wallet.createRandom();
      
      // Encrypt private key
      const encryptedKey = await this.walletService.encryptPrivateKey(
        wallet.privateKey,
        telegramId
      );

      // Create user in database
      const user = await this.db.createUser({
        telegramId,
        username,
        walletAddress: wallet.address,
        encryptedPrivateKey: encryptedKey,
        createdAt: new Date(),
      });

      // Delete loading message
      await ctx.deleteMessage(loadingMsg.message_id);

      // Send welcome message
      await ctx.reply(
        `🎉 *Welcome to Core Meme Platform!*\n\n` +
        `Your account has been created successfully!\n\n` +
        `👤 *Username:* @${username}\n` +
        `💼 *Wallet Address:*\n\`${wallet.address}\`\n\n` +
        `⚠️ *Important:*\n` +
        `• Your wallet has been automatically created\n` +
        `• Private key is encrypted and stored securely\n` +
        `• Use /export to backup your private key\n` +
        `• Send CORE to this address to start trading\n\n` +
        `🎁 *Get Started:*\n` +
        `• Deposit CORE to your wallet\n` +
        `• Browse trending tokens\n` +
        `• Set up price alerts\n` +
        `• Join our premium tier for advanced features`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💼 View Wallet', 'wallet_view')],
            [Markup.button.callback('📈 Start Trading', 'trade_menu')],
            [Markup.button.callback('🚨 Set Alerts', 'alerts_menu')],
            [Markup.button.callback('💎 Go Premium', 'subscribe_menu')],
            [Markup.button.url('🌐 Open Web App', process.env.FRONTEND_URL || 'https://corememe.io')],
          ])
        }
      );

      // Set session
      if (ctx.session) {
        ctx.session.userId = user.id;
        ctx.session.telegramId = telegramId;
        ctx.session.username = username;
        ctx.session.walletAddress = wallet.address;
        ctx.session.isAuthenticated = true;
      }

      logger.info(`New user created: ${telegramId} with wallet ${wallet.address}`);

    } catch (error) {
      logger.error('Error creating new user:', error);
      await ctx.deleteMessage(loadingMsg.message_id);
      throw error;
    }
  }

  /**
   * Create user with wallet (for auth flow)
   */
  private async createUserWithWallet(telegramId: number, username: string) {
    // Generate new wallet
    const wallet = ethers.Wallet.createRandom();
    
    // Encrypt private key
    const encryptedKey = await this.walletService.encryptPrivateKey(
      wallet.privateKey,
      telegramId
    );

    // Create user in database
    const user = await this.db.createUser({
      telegramId,
      username,
      walletAddress: wallet.address,
      encryptedPrivateKey: encryptedKey,
      createdAt: new Date(),
    });

    return user;
  }

  /**
   * Show main menu for existing user
   */
  private async showMainMenu(ctx: BotContext, user: any) {
    const menuText = `
👋 *Welcome back, ${user.username}!*\n\n
💼 Wallet: \`${this.shortenAddress(user.walletAddress)}\`\n
📊 Portfolio Value: $${user.portfolioValue || '0.00'}\n
🎯 Subscription: ${user.subscriptionTier || 'Free'}\n\n
What would you like to do today?
`;

    await ctx.reply(menuText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('💼 Wallet', 'wallet_view'),
          Markup.button.callback('📈 Trade', 'trade_menu'),
        ],
        [
          Markup.button.callback('📊 Portfolio', 'portfolio_view'),
          Markup.button.callback('🚨 Alerts', 'alerts_menu'),
        ],
        [
          Markup.button.callback('💎 Premium', 'subscribe_menu'),
          Markup.button.callback('⚙️ Settings', 'settings_menu'),
        ],
        [
          Markup.button.url('🌐 Open Web App', process.env.FRONTEND_URL || 'https://corememe.io'),
        ],
      ])
    });

    // Set session
    if (ctx.session) {
      ctx.session.userId = user.id;
      ctx.session.telegramId = user.telegramId;
      ctx.session.username = user.username;
      ctx.session.walletAddress = user.walletAddress;
      ctx.session.isAuthenticated = true;
      ctx.session.isPremium = user.subscriptionTier === 'premium';
      ctx.session.isPro = user.subscriptionTier === 'pro';
    }
  }

  /**
   * Generate authentication code for web login
   */
  async generateAuthCode(): Promise<string> {
    const code = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    this.authCodes.set(code, {
      expiresAt,
      used: false,
    });

    return code;
  }

  /**
   * Generate login URL for web authentication
   */
  private async generateLoginUrl(authCode: string, user: any): Promise<string> {
    if (!user) {
      throw new Error('User not found for login URL generation');
    }
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Generate JWT token
    const token = await this.sessionManager.generateToken({
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      walletAddress: user.walletAddress,
    });

    // Generate signature
    const signature = this.generateSignature({
      authCode,
      telegramId: user.telegramId,
      walletAddress: user.walletAddress,
      timestamp: Date.now(),
    });

    // Build URL with parameters
    const params = new URLSearchParams({
      code: authCode,
      token,
      signature,
      address: user.walletAddress,
      username: user.username,
      telegramId: user.telegramId.toString(),
    });

    return `${baseUrl}/auth/callback?${params.toString()}`;
  }

  /**
   * Generate HMAC signature for authentication
   */
  private generateSignature(data: any): string {
    const secret = process.env.SIGNATURE_SECRET || 'default_secret';
    const message = JSON.stringify(data);
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  /**
   * Verify Telegram authentication data
   */
  verifyTelegramAuth(authData: any): boolean {
    const { hash, ...data } = authData;
    
    // Create data-check-string
    const dataCheckArr = Object.keys(data)
      .sort()
      .map(key => `${key}=${data[key]}`);
    const dataCheckString = dataCheckArr.join('\n');
    
    // Calculate secret key
    const secretKey = crypto
      .createHash('sha256')
      .update(process.env.TELEGRAM_BOT_TOKEN!)
      .digest();
    
    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return calculatedHash === hash;
  }

  /**
   * Shorten address for display
   */
  private shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Clean up expired authentication codes
   */
  private cleanupExpiredCodes() {
    const now = new Date();
    for (const [code, data] of this.authCodes.entries()) {
      if (now > data.expiresAt) {
        this.authCodes.delete(code);
      }
    }
  }
}