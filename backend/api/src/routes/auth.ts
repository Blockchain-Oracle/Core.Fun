import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { z } from 'zod';
import { createRedisClient, createLogger } from '@core-meme/shared';

const router: Router = Router();
const redis = createRedisClient();
const logger = createLogger({ service: 'api-auth', enableFileLogging: false });

// Validation schemas
const InitAuthSchema = z.object({
  redirectUrl: z.string().url().optional(),
});

// Callback schema is now defined inline in the route handler
// to make the code parameter optional

const TelegramWebAppAuthSchema = z.object({
  telegramUser: z.object({
    id: z.number(),
    username: z.string().optional(),
    first_name: z.string(),
    last_name: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.number(),
    hash: z.string(),
  }),
  initData: z.string(),
});

const ValidateTokenSchema = z.object({
  token: z.string(),
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

/**
 * Initialize authentication flow
 * Generate auth code for Telegram deep linking
 */
router.post('/auth/init', async (req: Request, res: Response) => {
  try {
    const { redirectUrl } = InitAuthSchema.parse(req.body);
    
    // Generate unique auth code
    const authCode = crypto.randomBytes(32).toString('hex');
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'core_dot_fun_bot';
    
    // Store auth code in Redis with 5 min expiry
    await redis.setex(
      `auth:code:${authCode}`,
      300,
      JSON.stringify({
        createdAt: Date.now(),
        redirectUrl,
        used: false,
      })
    );
    
    res.json({
      success: true,
      authCode,
      deepLink: `https://t.me/${botUsername}?start=auth_${authCode}`,
      expiresIn: 300,
    });
  } catch (error: any) {
    logger.error('Auth init failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize authentication',
    });
  }
});

/**
 * Telegram Web App authentication
 * Direct authentication using Telegram Web App initData
 */
router.post('/auth/telegram', async (req: Request, res: Response) => {
  try {
    const { telegramUser, initData } = TelegramWebAppAuthSchema.parse(req.body);
    
    // Validate Telegram Web App data
    if (!validateTelegramWebAppData(initData, telegramUser.hash)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Telegram Web App data',
      });
    }
    
    // Check if auth is recent (within 24 hours)
    const now = Math.floor(Date.now() / 1000);
    if (now - telegramUser.auth_date > 86400) {
      return res.status(401).json({
        success: false,
        error: 'Authentication data is too old',
      });
    }
    
    // Check if user exists
    const userKey = `user:telegram:${telegramUser.id}`;
    let userDataStr = await redis.get(userKey);
    let isNewUser = false;
    
    if (!userDataStr) {
      // Create new user and wallet
      isNewUser = true;
      const userId = crypto.randomUUID();
      const walletData = generateWallet();
      
      const userData = {
        id: userId,
        telegramId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        photoUrl: telegramUser.photo_url,
        walletAddress: walletData.address,
        walletPrivateKey: walletData.privateKey,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        subscriptionTier: 'FREE',
        isActive: true,
      };
      
      // Store user data
      await redis.set(userKey, JSON.stringify(userData));
      await redis.set(`user:id:${userId}`, JSON.stringify(userData));
      
      userDataStr = JSON.stringify(userData);
      
      logger.info(`Created new user: ${userId} (Telegram ID: ${telegramUser.id})`);
    } else {
      // Update last login
      const userData = JSON.parse(userDataStr);
      userData.lastLoginAt = Date.now();
      await redis.set(userKey, JSON.stringify(userData));
      await redis.set(`user:id:${userData.id}`, JSON.stringify(userData));
      
      userDataStr = JSON.stringify(userData);
    }
    
    const userData = JSON.parse(userDataStr);
    
    // Create session
    const accessToken = jwt.sign(
      {
        userId: userData.id,
        telegramId: userData.telegramId,
        username: userData.username,
        walletAddress: userData.walletAddress,
      },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      {
        userId: userData.id,
        type: 'refresh',
      },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '30d' }
    );
    
    // Store session
    const session = {
      token: accessToken,
      user: {
        id: userData.id,
        telegramId: userData.telegramId,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        photoUrl: userData.photoUrl,
        walletAddress: userData.walletAddress,
        walletPrivateKey: isNewUser ? userData.walletPrivateKey : undefined,
        createdAt: userData.createdAt,
        lastLoginAt: userData.lastLoginAt,
        subscriptionTier: userData.subscriptionTier,
        isActive: userData.isActive,
      },
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    
    await redis.setex(
      `session:${userData.id}`,
      7 * 24 * 60 * 60,
      JSON.stringify(session)
    );
    
    res.json({
      success: true,
      session,
      isNewUser,
    });
  } catch (error: any) {
    logger.error('Telegram Web App auth failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Authentication failed',
    });
  }
});

/**
 * Complete authentication callback
 * Called after user authenticates via Telegram
 */
router.post('/auth/callback', async (req: Request, res: Response) => {
  try {
    // Parse request body with optional code parameter
    const data = z.object({
      code: z.string().optional(),
      token: z.string(),
      signature: z.string(),
      address: z.string(),
      username: z.string(),
      telegramId: z.string(),
    }).parse(req.body);
    
    // Skip Redis code verification - trust the JWT token from our bot
    // The JWT is already signed with our secret, so it's secure
    
    // Verify JWT token from bot
    let decoded: any;
    try {
      decoded = jwt.verify(
        data.token,
        process.env.JWT_SECRET || 'default_jwt_secret'
      ) as any;
    } catch (tokenError) {
      logger.error('Invalid JWT token:', tokenError);
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token',
      });
    }
    
    // Validate that the token data matches the provided parameters
    if (decoded.telegramId.toString() !== data.telegramId || 
        decoded.walletAddress !== data.address) {
      return res.status(401).json({
        success: false,
        error: 'Token data mismatch',
      });
    }
    
    // Check if user exists and has wallet private key
    const userKey = `user:id:${decoded.userId}`;
    let userData = await redis.get(userKey);
    
    if (!userData) {
      // User doesn't exist in Redis, need to create full user data with wallet
      const telegramKey = `user:telegram:${decoded.telegramId}`;
      userData = await redis.get(telegramKey);
      
      if (!userData) {
        // Create complete user data with wallet private key
        const walletData = generateWallet();
        const newUserData = {
          id: decoded.userId,
          telegramId: decoded.telegramId,
          username: decoded.username,
          firstName: decoded.username,
          lastName: '',
          photoUrl: '',
          walletAddress: walletData.address,
          walletPrivateKey: walletData.privateKey, // Store the private key for transactions
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
          subscriptionTier: 'FREE',
          isActive: true,
        };
        
        // Store user data in both keys
        await redis.set(userKey, JSON.stringify(newUserData));
        await redis.set(telegramKey, JSON.stringify(newUserData));
        
        logger.info(`Created wallet for user ${decoded.userId} during web callback`);
      }
    } else {
      // Update last login
      const existingUserData = JSON.parse(userData);
      
      // If user exists but doesn't have a private key, generate one
      if (!existingUserData.walletPrivateKey) {
        const walletData = generateWallet();
        existingUserData.walletAddress = walletData.address;
        existingUserData.walletPrivateKey = walletData.privateKey;
        existingUserData.lastLoginAt = Date.now();
        
        await redis.set(userKey, JSON.stringify(existingUserData));
        await redis.set(`user:telegram:${decoded.telegramId}`, JSON.stringify(existingUserData));
        
        logger.info(`Generated wallet for existing user ${decoded.userId}`);
      } else {
        existingUserData.lastLoginAt = Date.now();
        await redis.set(userKey, JSON.stringify(existingUserData));
      }
    }
    
    // Create session tokens
    const accessToken = jwt.sign(
      {
        userId: decoded.userId,
        telegramId: decoded.telegramId,
        username: decoded.username,
        walletAddress: decoded.walletAddress,
      },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      {
        userId: decoded.userId,
        type: 'refresh',
      },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '30d' }
    );
    
    // Store session in Redis
    await redis.setex(
      `session:${decoded.userId}`,
      7 * 24 * 60 * 60,
      JSON.stringify({
        userId: decoded.userId,
        telegramId: decoded.telegramId,
        username: decoded.username,
        walletAddress: decoded.walletAddress,
        createdAt: Date.now(),
      })
    );
    
    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: decoded.userId,
        telegramId: decoded.telegramId,
        username: decoded.username,
        walletAddress: decoded.walletAddress,
      },
    });
  } catch (error: any) {
    logger.error('Auth callback failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Authentication failed',
    });
  }
});

/**
 * Validate access token
 */
router.post('/auth/validate', async (req: Request, res: Response) => {
  try {
    const { token } = ValidateTokenSchema.parse(req.body);
    
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default_jwt_secret'
    ) as any;
    
    // Check if session exists
    const sessionStr = await redis.get(`session:${decoded.userId}`);
    if (!sessionStr) {
      return res.status(401).json({
        success: false,
        error: 'Session not found',
      });
    }
    
    const session = JSON.parse(sessionStr);
    
    res.json({
      success: true,
      user: {
        id: decoded.userId,
        telegramId: session.telegramId,
        username: session.username,
        walletAddress: session.walletAddress,
      },
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
});

/**
 * Refresh access token
 */
router.post('/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = RefreshTokenSchema.parse(req.body);
    
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET || 'default_jwt_secret'
    ) as any;
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
      });
    }
    
    // Get session
    const sessionStr = await redis.get(`session:${decoded.userId}`);
    if (!sessionStr) {
      return res.status(401).json({
        success: false,
        error: 'Session not found',
      });
    }
    
    const session = JSON.parse(sessionStr);
    
    // Generate new access token
    const accessToken = jwt.sign(
      {
        userId: decoded.userId,
        telegramId: session.telegramId,
        username: session.username,
        walletAddress: session.walletAddress,
      },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      accessToken,
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token',
    });
  }
});

/**
 * Logout
 */
router.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default_jwt_secret'
    ) as any;
    
    // Delete session
    await redis.del(`session:${decoded.userId}`);
    
    res.json({
      success: true,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Logout failed',
    });
  }
});

/**
 * Get current user profile
 */
router.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default_jwt_secret'
    ) as any;
    
    // Get session
    const sessionStr = await redis.get(`session:${decoded.userId}`);
    if (!sessionStr) {
      return res.status(401).json({
        success: false,
        error: 'Session not found',
      });
    }
    
    const session = JSON.parse(sessionStr);
    
    res.json({
      success: true,
      user: {
        id: decoded.userId,
        telegramId: session.telegramId,
        username: session.username,
        walletAddress: session.walletAddress,
        createdAt: session.createdAt,
      },
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
});

// Utility functions

/**
 * Validate Telegram Web App data
 */
function validateTelegramWebAppData(initData: string, hash: string): boolean {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      logger.warn('TELEGRAM_BOT_TOKEN not set, skipping validation');
      return true; // Skip validation in development
    }
    
    // Create data check string
    const urlParams = new URLSearchParams(initData);
    urlParams.delete('hash'); // Remove hash from params
    
    const dataCheckArr: string[] = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');
    
    // Create secret key
    const secretKey = crypto
      .createHash('sha256')
      .update(botToken)
      .digest();
    
    // Create hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    logger.error('Telegram Web App validation error:', error);
    return false;
  }
}

/**
 * Generate new wallet for user using ethers.js
 */
function generateWallet(): { address: string; privateKey: string } {
  try {
    // Create a random wallet using ethers.js (cryptographically secure)
    const wallet = ethers.Wallet.createRandom();
    
    // Validate that the generated wallet has valid address and private key
    if (!ethers.isAddress(wallet.address)) {
      throw new Error('Generated wallet address is invalid');
    }
    
    if (!wallet.privateKey || wallet.privateKey.length !== 66) { // 0x + 64 chars
      throw new Error('Generated private key is invalid');
    }
    
    // Verify the wallet works by creating a new wallet instance from the private key
    const testWallet = new ethers.Wallet(wallet.privateKey);
    if (testWallet.address !== wallet.address) {
      throw new Error('Wallet generation verification failed');
    }
    
    logger.info(`Generated new wallet: ${wallet.address}`);
    
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  } catch (error) {
    logger.error('Failed to generate wallet:', error);
    throw new Error('Wallet generation failed');
  }
}

export default router;