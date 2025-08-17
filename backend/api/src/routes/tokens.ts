import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { memeFactoryService, ContractDataService } from '@core-meme/shared';
import { transactionService } from '../services/TransactionService';
import { createLogger } from '@core-meme/shared';
import { db } from '../db';
import { CoreScanService } from '../services/CoreScanService';
import { ethers } from 'ethers';

const router: Router = Router();
const logger = createLogger({ service: 'api-tokens', enableFileLogging: false });

// Initialize services for complete data fetching
const coreScanService = new CoreScanService('testnet');
const contractDataService = new ContractDataService(
  process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com',
  process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  process.env.STAKING_ADDRESS || '0x0000000000000000000000000000000000000000'
);

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
 * Get all tokens from the database with proper formatting
 */
router.get('/tokens', async (req: Request, res: Response) => {
  try {
    // Fetch tokens from database first
    const tokens = await db('tokens')
      .select('*')
      .orderBy('created_at', 'desc');

    // Get real CORE price from CoinGecko
    let CORE_PRICE_USD = 0.50; // Default fallback
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const geckoResponse = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd',
        {
          signal: controller.signal,
          headers: { 'Accept': 'application/json', 'User-Agent': 'CoreMemePlatform/1.0' }
        }
      );
      clearTimeout(timeoutId);
      if (geckoResponse.ok) {
        const geckoData: any = await geckoResponse.json();
        const price = geckoData?.coredaoorg?.usd;
        if (typeof price === 'number' && price > 0) {
          CORE_PRICE_USD = price;
          logger.info(`Fetched CORE price from CoinGecko: $${price}`);
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch CORE price, using fallback', error);
    }
    
    // Constants for calculations
    const TARGET_CORE = 3; // 3 CORE to graduate

    const toDto = (p: {
      address: string;
      name: string;
      symbol: string;
      decimals: number;
      totalSupply: string;
      creator: string;
      createdAt: number;
      blockNumber?: number;
      transactionHash?: string;
      isLaunched?: boolean;
      status?: 'CREATED' | 'LAUNCHED' | 'GRADUATED';
      priceCore?: number;
      priceUsd?: number;
      marketCap?: number;
      liquidityCore?: number;
      holders?: number;
      transactions24h?: number;
      graduationPercentage?: number;
      description?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
      image_url?: string;
    }) => ({
      address: p.address,
      name: p.name,
      symbol: p.symbol,
      decimals: p.decimals || 18,
      totalSupply: p.totalSupply,
      creator: p.creator || '',
      createdAt: p.createdAt,
      blockNumber: p.blockNumber || 0,
      transactionHash: p.transactionHash || '',
      status: p.status || (p.isLaunched ? 'GRADUATED' : 'CREATED'),
      isVerified: false,
      ownershipRenounced: false,
      price: (p.priceUsd ?? ((p.priceCore || 0) * CORE_PRICE_USD)),
      priceChange24h: 0,
      marketCap: p.marketCap ?? 0,
      volume24h: 0,
      liquidity: (p.liquidityCore || 0) * CORE_PRICE_USD,
      holders: p.holders || 0,
      transactions24h: p.transactions24h || 0,
      graduationPercentage: Math.min(Math.max(p.graduationPercentage || 0, 0), 100),
      targetAmount: TARGET_CORE,
      raisedAmount: p.liquidityCore || 0,
      description: p.description || '',
      website: p.website || '',
      twitter: p.twitter || '',
      telegram: p.telegram || '',
      image_url: p.image_url || '',
      rugScore: 0,
      isHoneypot: false,
    });

    let formattedTokens = tokens.map(token => {
      const liquidityAdded = parseFloat(token.liquidity_added || '0');
      const totalSupplyWei = token.total_supply || '1000000000000000000000000';
      const totalSupply = parseFloat(totalSupplyWei) / 1e18;
      const graduationPercentage = Math.min((liquidityAdded / TARGET_CORE) * 100, 100);
      const priceCore = parseFloat(token.price_core || '0');
      const priceUsd = priceCore * CORE_PRICE_USD;
      const marketCap = totalSupply * priceUsd;
      const createdAtTimestamp = token.created_at
        ? Math.floor(new Date(token.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      let status: 'CREATED' | 'LAUNCHED' | 'GRADUATED' = 'CREATED';
      if (token.is_launched) status = 'GRADUATED';
      else if (graduationPercentage >= 100) status = 'LAUNCHED';

      return toDto({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals || 18,
        totalSupply: totalSupplyWei,
        creator: token.creator_address || '',
        createdAt: createdAtTimestamp,
        blockNumber: 0,
        transactionHash: '',
        status,
        priceCore,
        marketCap,
        liquidityCore: liquidityAdded,
        holders: token.holders_count || 0,
        transactions24h: token.transactions_count || 0,
        graduationPercentage,
        description: token.description || '',
        website: token.website || '',
        twitter: token.twitter || '',
        telegram: token.telegram || '',
        image_url: token.image_url || '',
      });
    });

    logger.info(`Database returned ${tokens.length} tokens, formatted to ${formattedTokens.length} tokens`);

    // Fallback: if DB has no tokens, fetch directly from contract
    if (formattedTokens.length === 0) {
      try {
        const onchainTokens = await memeFactoryService.getAllTokens();
        logger.info(`Fetched ${onchainTokens.length} tokens from blockchain`);
        formattedTokens = onchainTokens.map(t => {
          const totalSupplyWei = t.totalSupply;
          const totalSupply = parseFloat(totalSupplyWei) / 1e18;
          const priceCore = parseFloat(t.currentPrice || '0');
          const liquidityCore = parseFloat(t.reserveBalance || '0');
          const marketCap = totalSupply * (priceCore * CORE_PRICE_USD);
          logger.info(`Token ${t.symbol}: currentPrice=${t.currentPrice}, priceCore=${priceCore}, CORE_PRICE_USD=${CORE_PRICE_USD}, price USD=${priceCore * CORE_PRICE_USD}`);
          const graduationPercentage = Math.min((liquidityCore / TARGET_CORE) * 100, 100);
          return toDto({
            address: t.address,
            name: t.name,
            symbol: t.symbol,
            decimals: 18,
            totalSupply: totalSupplyWei,
            creator: t.creator,
            createdAt: t.createdAt,
            isLaunched: t.isLaunched,
            priceCore,
            marketCap,
            liquidityCore,
            graduationPercentage,
            description: t.description,
            website: t.website,
            twitter: t.twitter,
            telegram: t.telegram,
            image_url: t.image_url,
          });
        });
      } catch (e) {
        logger.warn('On-chain fallback for tokens failed:', e);
      }
    }

    res.json({ success: true, tokens: formattedTokens, count: formattedTokens.length });
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
 * Get COMPLETE token information including all metadata, socials, and analytics
 * THIS IS THE CRITICAL ENDPOINT - MUST RETURN EVERYTHING
 */
router.get('/tokens/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const userAddress = (req as any).user?.address;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token address'
      });
    }
    
    logger.info(`Fetching COMPLETE data for token ${address}`);
    
    // 1. Get COMPLETE contract data - ALL FIELDS
    const contractData = await contractDataService.getCompleteTokenData(address);
    
    // 2. Get analytics from Core Scan API
    const analytics = await coreScanService.getTokenAnalytics(address);
    
    // 3. Get user's staking benefits if authenticated
    let stakingBenefits = null;
    if (userAddress) {
      stakingBenefits = await contractDataService.getUserStakingBenefits(userAddress);
    }
    
    // 4. Calculate price impact for different amounts
    const priceImpacts = {
      small: await contractDataService.calculatePriceImpact(address, '0.1', true),
      medium: await contractDataService.calculatePriceImpact(address, '1', true),
      large: await contractDataService.calculatePriceImpact(address, '10', true),
    };
    
    // 5. Get Core price for USD calculations
    const corePrice = await coreScanService.getCorePrice();
    
    // Build COMPLETE response with ALL data
    const completeTokenData = {
      // Basic token info
      address: contractData.address,
      name: contractData.name,
      symbol: contractData.symbol,
      decimals: contractData.decimals,
      totalSupply: contractData.totalSupply,
      
      // CRITICAL METADATA - MUST BE INCLUDED
      description: contractData.description,
      image_url: contractData.image, // ACTUAL IMAGE URL
      twitter: contractData.twitter,
      telegram: contractData.telegram,
      website: contractData.website,
      
      // Trading controls
      maxWallet: contractData.maxWallet,
      maxTransaction: contractData.maxTransaction,
      tradingEnabled: contractData.tradingEnabled,
      launchBlock: contractData.launchBlock,
      owner: contractData.owner,
      
      // Sale info
      creator: contractData.creator,
      sold: contractData.sold,
      raised: contractData.raised,
      isOpen: contractData.isOpen,
      isLaunched: contractData.isLaunched,
      createdAt: contractData.createdAt,
      launchedAt: contractData.launchedAt,
      
      // Bonding curve - COMPLETE DATA
      bondingCurve: {
        progress: contractData.bondingCurveProgress,
        currentPrice: contractData.currentPrice,
        currentPriceUSD: Number(contractData.currentPrice) * corePrice,
        targetAmount: contractData.targetAmount,
        raisedAmount: contractData.raisedAmount,
        tokensRemaining: contractData.tokensRemaining,
        priceImpacts: priceImpacts
      },
      
      // Analytics from Core Scan
      analytics: {
        holders: analytics.holders,
        transactions24h: analytics.transactions24h,
        volume24h: analytics.volume24h,
        uniqueTraders24h: analytics.uniqueTraders24h,
        holderDistribution: analytics.holderDistribution,
        topHolders: analytics.topHolders
      },
      
      // Staking benefits for user
      stakingBenefits: stakingBenefits,
      
      // Status flags
      status: contractData.isLaunched ? 'GRADUATED' : contractData.isOpen ? 'CREATED' : 'CLOSED',
      ownershipRenounced: contractData.owner === ethers.ZeroAddress,
      
      // Market data
      marketCap: Number(ethers.formatEther(contractData.totalSupply)) * Number(contractData.currentPrice) * corePrice,
      liquidity: Number(contractData.raisedAmount) * corePrice,
      price: Number(contractData.currentPrice) * corePrice,
      priceChange24h: 0, // Would calculate from price history
      volume24h: Number(ethers.formatEther(analytics.volume24h)) * corePrice,
    };
    
    logger.info(`Returning COMPLETE token data for ${address}:`, {
      hasImage: !!completeTokenData.image_url,
      hasDescription: !!completeTokenData.description,
      hasSocials: !!(completeTokenData.twitter || completeTokenData.telegram || completeTokenData.website),
      bondingProgress: completeTokenData.bondingCurve.progress
    });
    
    res.json({
      success: true,
      token: completeTokenData
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