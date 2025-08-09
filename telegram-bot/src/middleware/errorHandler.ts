import { Context } from 'telegraf';
import { logger } from '../utils/logger';

/**
 * Global error handler for the bot
 */
export async function errorHandler(error: any, ctx: Context) {
  const userId = ctx.from?.id;
  const command = ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown';
  
  // Log the error
  logger.error('Bot error occurred', {
    error: error.message,
    stack: error.stack,
    userId,
    command,
    chat: ctx.chat,
  });

  // Determine error message based on error type
  let userMessage = '❌ An unexpected error occurred. Please try again later.';
  
  if (error.message?.includes('rate limit')) {
    userMessage = '⏱️ Too many requests. Please slow down.';
  } else if (error.message?.includes('session')) {
    userMessage = '⚠️ Session expired. Please use /start to authenticate again.';
  } else if (error.message?.includes('network')) {
    userMessage = '🌐 Network error. Please check your connection and try again.';
  } else if (error.message?.includes('wallet')) {
    userMessage = '💼 Wallet operation failed. Please try again.';
  } else if (error.message?.includes('insufficient')) {
    userMessage = '💰 Insufficient balance for this operation.';
  }

  // Try to send error message to user
  try {
    await ctx.reply(userMessage);
  } catch (replyError) {
    // If we can't reply, the chat might be deleted or bot might be blocked
    logger.error('Failed to send error message to user', {
      originalError: error.message,
      replyError: replyError,
      userId,
    });
  }

  // Report critical errors to admin
  if (error.message?.includes('CRITICAL') || error.stack?.includes('CRITICAL')) {
    await notifyAdmin(error, ctx);
  }
}

/**
 * Notify admin about critical errors
 */
async function notifyAdmin(error: any, ctx: Context) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  
  if (!adminId) {
    return;
  }

  try {
    const errorReport = `
🚨 *Critical Error Report*

*User:* ${ctx.from?.id} (@${ctx.from?.username || 'unknown'})
*Error:* ${error.message}
*Time:* ${new Date().toISOString()}
*Command:* ${ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown'}

Check logs for full stack trace.
`;

    await ctx.telegram.sendMessage(adminId, errorReport, {
      parse_mode: 'Markdown',
    });
  } catch (adminError) {
    logger.error('Failed to notify admin about critical error:', adminError);
  }
}