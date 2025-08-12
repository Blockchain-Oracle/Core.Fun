import { Markup } from 'telegraf';
import { ethers } from 'ethers';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { BotContext } from '../bot';
import { DatabaseService } from '../services/DatabaseService';
import { SessionManager } from './SessionManager';
import { WalletService } from '../wallet/WalletService';
import { createLogger } from '@core-meme/shared';

export class AuthHandler {
  private db: DatabaseService;
  private sessionManager: SessionManager;
  private walletService: WalletService;
  private logger = createLogger({ service: 'telegram-bot-auth' });
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
      this.logger.error('Error in handleStart:', error);
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

      // Send success message without URL button (Telegram rejects localhost URLs)
      await ctx.reply(
        `✅ *Authentication Successful!*\n\n` +
        `👤 Username: ${username}\n` +
        `💼 Wallet: ${user.walletAddress}\n\n` +
        `Your account is ready! Use the menu below to continue:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💼 View Wallet', 'wallet_view')],
            [Markup.button.callback('📊 Open Dashboard', 'dashboard')],
          ])
        }
      );

      this.logger.info(`User ${userId} authenticated via deep link`);

    } catch (error) {
      this.logger.error('Error in handleAuthStart:', error);
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
        `👤 *Username:* ${this.escapeMarkdown(username)}\n` +
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
            [Markup.button.callback('🌐 Get Web Link', 'get_web_link')],
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

      this.logger.info(`New user created: ${telegramId} with wallet ${wallet.address}`);

    } catch (error) {
      this.logger.error('Error creating new user:', error);
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
💼 Wallet: ${this.shortenAddress(user.walletAddress)}\n
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
          Markup.button.callback('🌐 Get Web Link', 'get_web_link'),
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
   * Handle Web App authentication request from direct link
   */
  async handleWebAppAuthRequest(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || `user_${userId}`;
    
    if (!userId) {
      await ctx.reply('Error: Unable to get user information');
      return;
    }

    try {
      // Check if user exists, create if not
      let user = await this.db.getUserByTelegramId(userId);
      
      if (!user) {
        // Create new user with wallet
        user = await this.createUserWithWallet(userId, username);
        
        await ctx.reply(
          `✅ *Account Created!*\n\n` +
          `👤 Username: ${username}\n` +
          `💼 Wallet: ${user.walletAddress}\n\n` +
          `Your account and wallet have been created successfully!`,
          { parse_mode: 'Markdown' }
        );
      }

      // Generate direct login URL (fallback method)
      const loginUrl = await this.generateDirectLoginUrl(user);

      // Send success message with the login URL for user to copy
      await ctx.reply(
        `🚀 *Ready for Web Access!*\n\n` +
        `👤 *Username:* ${this.escapeMarkdown(username)}\n` +
        `💼 *Wallet:* \`${this.shortenAddress(user.walletAddress)}\`\n\n` +
        `🌐 *Web Access URL:*\n\`${loginUrl}\`\n\n` +
        `Copy the URL above and paste it in your browser to access the web interface.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💼 View Wallet', 'wallet_view')],
            [Markup.button.callback('📊 Dashboard', 'dashboard')],
          ])
        }
      );

      this.logger.info(`Web app auth request handled for user ${userId}`);

    } catch (error) {
      this.logger.error('Error in handleWebAppAuthRequest:', error);
      await ctx.reply('❌ Authentication setup failed. Please try again.');
    }
  }

  /**
   * Handle Web App authentication request (legacy method)
   */
  async handleWebAppAuth(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || `user_${userId}`;
    
    if (!userId) {
      await ctx.reply('Error: Unable to get user information');
      return;
    }

    try {
      // Check if user exists, create if not
      let user = await this.db.getUserByTelegramId(userId);
      
      if (!user) {
        // Create new user with wallet
        user = await this.createUserWithWallet(userId, username);
        
        await ctx.reply(
          `✅ *Account Created!*\n\n` +
          `👤 Username: ${username}\n` +
          `💼 Wallet: ${user.walletAddress}\n\n` +
          `Your account and wallet have been created successfully!`,
          { parse_mode: 'Markdown' }
        );
      }

      // Create session token for Web App
      const sessionToken = await this.sessionManager.generateToken({
        userId: user.id,
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress,
      });

      // Send Web App authentication data back
      await ctx.reply(
        `🔐 *Authentication Complete*\n\n` +
        `Your wallet is now connected to the web app!\n\n` +
        `💼 Wallet: ${this.shortenAddress(user.walletAddress)}\n` +
        `🔑 Session active for 7 days`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌐 Get Web Link', callback_data: 'get_web_link' }],
              [{ text: '💼 View Wallet', callback_data: 'wallet_view' }],
            ]
          }
        }
      );

      this.logger.info(`Web App auth successful for user ${userId}`);

    } catch (error) {
      this.logger.error('Error in handleWebAppAuth:', error);
      await ctx.reply('❌ Authentication failed. Please try again.');
    }
  }

  /**
   * Handle Web App data from frontend
   */
  async processWebAppData(webAppData: any): Promise<{
    success: boolean;
    user?: any;
    token?: string;
    error?: string;
  }> {
    try {
      // Verify the Web App data is valid
      if (!this.verifyWebAppData(webAppData)) {
        return {
          success: false,
          error: 'Invalid Web App data signature'
        };
      }

      const telegramUser = JSON.parse(webAppData.user);
      const userId = telegramUser.id;
      const username = telegramUser.username || `user_${userId}`;

      // Check if user exists, create if not
      let user = await this.db.getUserByTelegramId(userId);
      
      if (!user) {
        // Create new user with wallet
        user = await this.createUserWithWallet(userId, username);
      }

      // Generate session token
      const token = await this.sessionManager.generateToken({
        userId: user.id,
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress,
      });

      return {
        success: true,
        user: {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: telegramUser.photo_url,
          walletAddress: user.walletAddress,
          createdAt: user.createdAt,
          subscriptionTier: user.subscriptionTier || 'FREE',
          isActive: true,
        },
        token
      };

    } catch (error) {
      this.logger.error('Error processing Web App data:', error);
      return {
        success: false,
        error: 'Failed to process authentication'
      };
    }
  }

  /**
   * Verify Web App data signature
   */
  private verifyWebAppData(webAppData: any): boolean {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        this.logger.warn('TELEGRAM_BOT_TOKEN not set, skipping Web App validation');
        return true; // Skip validation in development
      }

      // Create the data check string
      const { hash, ...data } = webAppData;
      const dataCheckArr = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key]}`);
      const dataCheckString = dataCheckArr.join('\n');

      // Create secret key
      const secretKey = crypto
        .createHash('sha256')
        .update(botToken)
        .digest();

      // Calculate hash
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      return calculatedHash === hash;
    } catch (error) {
      this.logger.error('Web App data verification error:', error);
      return false;
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
   * Generate direct login URL (without auth code flow)
   */
  private async generateDirectLoginUrl(user: any): Promise<string> {
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

    // Generate a simple auth code for this session
    const authCode = crypto.randomBytes(16).toString('hex');

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
      username: user.username || `user_${user.telegramId}`,
      telegramId: user.telegramId.toString(),
    });

    return `${baseUrl}/auth/callback?${params.toString()}`;
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
   * Escape markdown characters in text
   */
  private escapeMarkdown(text: string): string {
    // Remove @ symbol and escape other markdown characters
    return text.replace(/@/g, '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
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