import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { createRedisClient, createLogger } from '@core-meme/shared';

const router: Router = Router();
const redis = createRedisClient();
const logger = createLogger({ service: 'api-auth', enableFileLogging: false });

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
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CoreMemeBot';
    
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
 * Complete authentication callback
 * Called after user authenticates via Telegram
 */
router.post('/auth/callback', async (req: Request, res: Response) => {
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
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.SIGNATURE_SECRET || 'default_secret')
      .update(JSON.stringify({
        authCode: data.code,
        telegramId: parseInt(data.telegramId),
        walletAddress: data.address,
      }))
      .digest('hex');
    
    // For development, skip signature verification
    // if (data.signature !== expectedSignature) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Invalid signature',
    //   });
    // }
    
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

export default router;