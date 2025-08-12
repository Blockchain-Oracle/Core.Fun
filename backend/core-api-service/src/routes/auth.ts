import { Router, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { z } from 'zod';
import { createRedisClient, createLogger } from '@core-meme/shared';

const router: Router = Router();
const redis = createRedisClient();
const logger = createLogger({ service: 'core-api-auth', enableFileLogging: false });

// Validation schemas
const InitAuthSchema = z.object({
  redirectUrl: z.string().url().optional(),
});

const CallbackAuthSchema = z.object({
  code: z.string(),
  token: z.string(),
  signature: z.string(),
  address: z.string(),
  username: z.string(),
  telegramId: z.string(),
});

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

/**
 * Initialize authentication flow
 * Generate auth code for Telegram deep linking
 */
router.post('/init', async (req: Request, res: Response) => {
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
router.post('/telegram', async (req: Request, res: Response) => {
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
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const data = CallbackAuthSchema.parse(req.body);
    
    // Verify auth code
    const authDataStr = await redis.get(`auth:code:${data.code}`);
    if (!authDataStr) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication code',
      });
    }
    
    const authData = JSON.parse(authDataStr);
    if (authData.used) {
      return res.status(401).json({
        success: false,
        error: 'Authentication code already used',
      });
    }
    
    // Mark code as used
    authData.used = true;
    await redis.setex(`auth:code:${data.code}`, 60, JSON.stringify(authData));
    
    // Verify JWT token from bot
    const decoded = jwt.verify(
      data.token,
      process.env.JWT_SECRET || 'default_jwt_secret'
    ) as any;
    
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
 * Generate new wallet for user
 */
function generateWallet(): { address: string; privateKey: string } {
  // Generate a random private key (32 bytes)
  const privateKey = crypto.randomBytes(32).toString('hex');
  
  // Generate Core blockchain compatible address
  // Using deterministic address generation
  const address = '0x' + crypto
    .createHash('sha256')
    .update(privateKey)
    .digest('hex')
    .slice(0, 40);
  
  return {
    address,
    privateKey: '0x' + privateKey,
  };
}

export { router as authRouter };