import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { BotContext } from '../bot';
import { createLogger } from '@core-meme/shared';
import crypto from 'crypto';

interface SessionData {
  userId: string;
  telegramId: number;
  username: string;
  walletAddress: string;
  subscriptionTier?: string;
  expiresAt: Date;
}

interface JWTPayload {
  userId: string;
  telegramId: number;
  username: string;
  walletAddress: string;
  iat?: number;
  exp?: number;
}

export class SessionManager {
  private redis: Redis;
  private jwtSecret: string;
  private sessionTTL: number = 7 * 24 * 60 * 60; // 7 days in seconds
  private logger = createLogger({ service: 'session-manager' });

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.jwtSecret = process.env.JWT_SECRET || this.generateSecret();
    
    if (!process.env.JWT_SECRET) {
      this.logger.warn('JWT_SECRET not set, using generated secret (not recommended for production)');
    }
  }

  /**
   * Middleware to load session from Redis
   */
  middleware() {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      if (!ctx.from) {
        return next();
      }

      const telegramId = ctx.from.id;
      
      try {
        // Load session from Redis
        const sessionKey = `session:telegram:${telegramId}`;
        const sessionData = await this.redis.get(sessionKey);
        
        if (sessionData) {
          const session = JSON.parse(sessionData);
          ctx.session = {
            userId: session.userId,
            telegramId: session.telegramId,
            username: session.username,
            walletAddress: session.walletAddress,
            isAuthenticated: true,
            isPremium: session.subscriptionTier === 'premium',
            isPro: session.subscriptionTier === 'pro',
          };
        } else {
          // Initialize empty session
          ctx.session = {
            telegramId,
            isAuthenticated: false,
          };
        }
      } catch (error) {
        this.logger.error('Error loading session:', error);
        ctx.session = {
          telegramId,
          isAuthenticated: false,
        };
      }

      // Continue to next middleware
      await next();

      // Save session after processing
      if (ctx.session && ctx.session.isAuthenticated) {
        try {
          const sessionKey = `session:telegram:${telegramId}`;
          await this.redis.setex(
            sessionKey,
            this.sessionTTL,
            JSON.stringify({
              userId: ctx.session.userId,
              telegramId: ctx.session.telegramId,
              username: ctx.session.username,
              walletAddress: ctx.session.walletAddress,
              subscriptionTier: ctx.session.isPro ? 'pro' : ctx.session.isPremium ? 'premium' : 'free',
            })
          );
        } catch (error) {
          this.logger.error('Error saving session:', error);
        }
      }
    };
  }

  /**
   * Generate JWT token for web authentication
   */
  async generateToken(payload: {
    userId: string;
    telegramId: number;
    username: string;
    walletAddress: string;
  }): Promise<string> {
    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: '7d',
    });

    // Store session in Redis for cross-platform access
    const sessionKey = `session:web:${payload.userId}`;
    const sessionData: SessionData = {
      ...payload,
      expiresAt: new Date(Date.now() + this.sessionTTL * 1000),
    };

    await this.redis.setex(
      sessionKey,
      this.sessionTTL,
      JSON.stringify(sessionData)
    );

    return token;
  }

  /**
   * Generate refresh token
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: '30d' }
    );

    // Store refresh token in Redis
    const refreshKey = `refresh:${userId}`;
    await this.redis.setex(
      refreshKey,
      30 * 24 * 60 * 60, // 30 days
      refreshToken
    );

    return refreshToken;
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      
      // Check if session exists in Redis
      const sessionKey = `session:web:${decoded.userId}`;
      const sessionData = await this.redis.get(sessionKey);
      
      if (!sessionData) {
        return null;
      }

      return decoded;
    } catch (error) {
      this.logger.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshToken(refreshToken: string): Promise<string | null> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      
      if (decoded.type !== 'refresh') {
        return null;
      }

      // Check if refresh token exists in Redis
      const refreshKey = `refresh:${decoded.userId}`;
      const storedToken = await this.redis.get(refreshKey);
      
      if (storedToken !== refreshToken) {
        return null;
      }

      // Get user session
      const sessionKey = `session:web:${decoded.userId}`;
      const sessionData = await this.redis.get(sessionKey);
      
      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData);

      // Generate new access token
      return this.generateToken({
        userId: session.userId,
        telegramId: session.telegramId,
        username: session.username,
        walletAddress: session.walletAddress,
      });
    } catch (error) {
      this.logger.error('Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Create session for user
   */
  async createSession(user: {
    id: string;
    telegramId: number;
    username: string;
    walletAddress: string;
    subscriptionTier?: string;
  }): Promise<SessionData> {
    const session: SessionData = {
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      walletAddress: user.walletAddress,
      subscriptionTier: user.subscriptionTier,
      expiresAt: new Date(Date.now() + this.sessionTTL * 1000),
    };

    // Store in Redis
    const telegramKey = `session:telegram:${user.telegramId}`;
    const webKey = `session:web:${user.id}`;
    
    await Promise.all([
      this.redis.setex(telegramKey, this.sessionTTL, JSON.stringify(session)),
      this.redis.setex(webKey, this.sessionTTL, JSON.stringify(session)),
    ]);

    return session;
  }

  /**
   * Destroy session
   */
  async destroySession(userId: string, telegramId: number): Promise<void> {
    const telegramKey = `session:telegram:${telegramId}`;
    const webKey = `session:web:${userId}`;
    const refreshKey = `refresh:${userId}`;
    
    await Promise.all([
      this.redis.del(telegramKey),
      this.redis.del(webKey),
      this.redis.del(refreshKey),
    ]);
  }

  /**
   * Get session by user ID
   */
  async getSession(userId: string): Promise<SessionData | null> {
    const sessionKey = `session:web:${userId}`;
    const sessionData = await this.redis.get(sessionKey);
    
    if (!sessionData) {
      return null;
    }

    return JSON.parse(sessionData);
  }

  /**
   * Update session
   */
  async updateSession(userId: string, updates: Partial<SessionData>): Promise<void> {
    const session = await this.getSession(userId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const updatedSession = { ...session, ...updates };
    
    const telegramKey = `session:telegram:${session.telegramId}`;
    const webKey = `session:web:${userId}`;
    
    await Promise.all([
      this.redis.setex(telegramKey, this.sessionTTL, JSON.stringify(updatedSession)),
      this.redis.setex(webKey, this.sessionTTL, JSON.stringify(updatedSession)),
    ]);
  }

  /**
   * Generate a secure random secret
   */
  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}