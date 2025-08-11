import { BotContext } from '../bot';
import { createLogger } from '@core-meme/shared';

const logger = createLogger({ service: 'auth-middleware' });

/**
 * Authentication middleware
 * Ensures user is authenticated before accessing protected commands
 */
export async function authMiddleware(ctx: BotContext, next: () => Promise<void>) {
  // Check if user has a session
  if (!ctx.session?.isAuthenticated) {
    await ctx.reply(
      '🔒 *Authentication Required*\n\n' +
      'Please use /start to authenticate first.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Check if session has required data
  if (!ctx.session.userId || !ctx.session.walletAddress) {
    logger.warn(`Incomplete session for user ${ctx.from?.id}`);
    
    await ctx.reply(
      '⚠️ *Session Expired*\n\n' +
      'Your session has expired. Please use /start to authenticate again.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Continue to next middleware/handler
  await next();
}