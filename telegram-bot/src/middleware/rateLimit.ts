import { BotContext } from '../bot';
import { logger } from '../utils/logger';

// Store rate limit data
const rateLimitMap = new Map<number, {
  count: number;
  resetTime: number;
}>();

// Configuration
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 30; // 30 requests per minute
const PREMIUM_MAX_REQUESTS = 60; // 60 requests per minute for premium users

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(ctx: BotContext, next: () => Promise<void>) {
  const userId = ctx.from?.id;
  
  if (!userId) {
    return next();
  }

  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  // Determine max requests based on subscription
  const maxRequests = ctx.session?.isPro 
    ? PREMIUM_MAX_REQUESTS * 2  // Pro users get double
    : ctx.session?.isPremium 
    ? PREMIUM_MAX_REQUESTS 
    : MAX_REQUESTS;

  if (!userLimit || now > userLimit.resetTime) {
    // Create new rate limit window
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
  } else {
    // Increment counter
    userLimit.count++;
    
    if (userLimit.count > maxRequests) {
      const remainingTime = Math.ceil((userLimit.resetTime - now) / 1000);
      
      logger.warn(`Rate limit exceeded for user ${userId}`);
      
      await ctx.reply(
        `⏱️ *Rate Limit Exceeded*\n\n` +
        `Please wait ${remainingTime} seconds before trying again.\n\n` +
        `💎 Premium users get higher limits!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
  }

  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance
    cleanupRateLimits();
  }

  await next();
}

/**
 * Clean up expired rate limit entries
 */
function cleanupRateLimits() {
  const now = Date.now();
  
  for (const [userId, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime + RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(userId);
    }
  }
}