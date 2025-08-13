import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { memeFactoryService } from '../services/MemeFactoryService';
import { transactionService } from '../services/TransactionService';
import { createLogger } from '@core-meme/shared';

const router: Router = Router();
const logger = createLogger({ service: 'api-tokens', enableFileLogging: false });

// Validation schemas
const CreateTokenSchema = z.object({
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  website: z.string().url().optional(),
});

const BuyTokenSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  coreAmount: z.string().regex(/^\d+\.?\d*$/),
});

const SellTokenSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenAmount: z.string().regex(/^\d+\.?\d*$/),
});

const CalculateSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+\.?\d*$/),
});

// Middleware to verify JWT token
const authenticateToken = (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret', (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  });
};

/**
 * GET /api/tokens
 * Get all tokens from the factory
 */
router.get('/tokens', async (req: Request, res: Response) => {
  try {
    const tokens = await memeFactoryService.getAllTokens();
    
    res.json({
      success: true,
      tokens,
      count: tokens.length
    });
  } catch (error: any) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch tokens'
    });
  }
});

/**
 * GET /api/tokens/:address
 * Get detailed information about a specific token
 */
router.get('/tokens/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address'
      });
    }
    
    const tokenInfo = await memeFactoryService.getTokenInfo(address);
    
    if (!tokenInfo) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }
    
    res.json({
      success: true,
      token: tokenInfo
    });
  } catch (error: any) {
    logger.error('Error fetching token info:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch token info'
    });
  }
});

/**
 * GET /api/tokens/:address/chart
 * Get price history for charting
 */
router.get('/tokens/:address/chart', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address'
      });
    }
    
    const priceHistory = await memeFactoryService.getTokenPriceHistory(address, hours);
    
    res.json({
      success: true,
      priceHistory,
      hours
    });
  } catch (error: any) {
    logger.error('Error fetching price history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch price history'
    });
  }
});

/**
 * GET /api/tokens/:address/trades
 * Get recent trades for a token
 */
router.get('/tokens/:address/trades', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address'
      });
    }
    
    const trades = await memeFactoryService.getRecentTrades(address, limit);
    
    res.json({
      success: true,
      trades,
      count: trades.length
    });
  } catch (error: any) {
    logger.error('Error fetching trades:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trades'
    });
  }
});

/**
 * POST /api/tokens/create
 * Create a new token (requires authentication)
 */
router.post('/tokens/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const data = CreateTokenSchema.parse(req.body);
    const user = (req as any).user;
    
    logger.info(`Creating token ${data.symbol} for user ${user.userId}`);
    
    // Estimate gas first
    const gasEstimate = await transactionService.estimateGas({
      userId: user.userId,
      telegramId: user.telegramId,
      type: 'createToken',
      params: data
    });
    
    // Execute transaction
    const result = await transactionService.executeTransaction({
      userId: user.userId,
      telegramId: user.telegramId,
      type: 'createToken',
      params: data
    });
    
    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        message: `Token ${data.symbol} created successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Transaction failed'
      });
    }
  } catch (error: any) {
    logger.error('Error creating token:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create token'
    });
  }
});

/**
 * POST /api/tokens/:address/buy
 * Buy tokens (requires authentication)
 */
router.post('/tokens/:address/buy', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { coreAmount } = BuyTokenSchema.parse({ ...req.body, tokenAddress: address });
    const user = (req as any).user;
    
    logger.info(`Buying tokens at ${address} for ${coreAmount} CORE by user ${user.userId}`);
    
    // Calculate expected tokens
    const expectedTokens = await memeFactoryService.calculateBuyReturn(address, coreAmount);
    
    // Execute transaction
    const result = await transactionService.executeTransaction({
      userId: user.userId,
      telegramId: user.telegramId,
      type: 'buyToken',
      params: {
        tokenAddress: address,
        coreAmount
      }
    });
    
    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        expectedTokens,
        message: `Successfully bought tokens`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Transaction failed'
      });
    }
  } catch (error: any) {
    logger.error('Error buying tokens:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to buy tokens'
    });
  }
});

/**
 * POST /api/tokens/:address/sell
 * Sell tokens (requires authentication)
 */
router.post('/tokens/:address/sell', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { tokenAmount } = SellTokenSchema.parse({ ...req.body, tokenAddress: address });
    const user = (req as any).user;
    
    logger.info(`Selling ${tokenAmount} tokens at ${address} by user ${user.userId}`);
    
    // Calculate expected CORE
    const expectedCore = await memeFactoryService.calculateSellReturn(address, tokenAmount);
    
    // Execute transaction
    const result = await transactionService.executeTransaction({
      userId: user.userId,
      telegramId: user.telegramId,
      type: 'sellToken',
      params: {
        tokenAddress: address,
        tokenAmount
      }
    });
    
    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        expectedCore,
        message: `Successfully sold tokens`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Transaction failed'
      });
    }
  } catch (error: any) {
    logger.error('Error selling tokens:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sell tokens'
    });
  }
});

/**
 * POST /api/tokens/:address/calculate-buy
 * Calculate how many tokens you get for X CORE
 */
router.post('/tokens/:address/calculate-buy', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { amount } = CalculateSchema.parse({ ...req.body, tokenAddress: address });
    
    const tokenAmount = await memeFactoryService.calculateBuyReturn(address, amount);
    
    res.json({
      success: true,
      coreAmount: amount,
      tokenAmount,
      rate: parseFloat(tokenAmount) / parseFloat(amount)
    });
  } catch (error: any) {
    logger.error('Error calculating buy return:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate'
    });
  }
});

/**
 * POST /api/tokens/:address/calculate-sell
 * Calculate how much CORE you get for X tokens
 */
router.post('/tokens/:address/calculate-sell', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { amount } = CalculateSchema.parse({ ...req.body, tokenAddress: address });
    
    const coreAmount = await memeFactoryService.calculateSellReturn(address, amount);
    
    res.json({
      success: true,
      tokenAmount: amount,
      coreAmount,
      rate: parseFloat(coreAmount) / parseFloat(amount)
    });
  } catch (error: any) {
    logger.error('Error calculating sell return:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate'
    });
  }
});

/**
 * POST /api/tokens/estimate-gas
 * Estimate gas for a transaction (requires authentication)
 */
router.post('/tokens/estimate-gas', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { type, params } = req.body;
    const user = (req as any).user;
    
    if (!['createToken', 'buyToken', 'sellToken'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction type'
      });
    }
    
    const estimate = await transactionService.estimateGas({
      userId: user.userId,
      telegramId: user.telegramId,
      type,
      params
    });
    
    res.json({
      success: true,
      ...estimate
    });
  } catch (error: any) {
    logger.error('Error estimating gas:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to estimate gas'
    });
  }
});

/**
 * GET /api/tokens/transactions/:userId
 * Get user's transaction history (requires authentication)
 */
router.get('/tokens/transactions/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = (req as any).user;
    
    // Users can only view their own transactions
    if (user.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = await transactionService.getUserTransactionHistory(userId, limit);
    
    res.json({
      success: true,
      transactions,
      count: transactions.length
    });
  } catch (error: any) {
    logger.error('Error fetching transaction history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transactions'
    });
  }
});

/**
 * GET /api/tokens/transaction/:txHash
 * Get transaction status
 */
router.get('/tokens/transaction/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;
    
    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction hash'
      });
    }
    
    const status = await transactionService.getTransactionStatus(txHash);
    
    res.json({
      success: true,
      ...status
    });
  } catch (error: any) {
    logger.error('Error fetching transaction status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transaction status'
    });
  }
});

export default router;