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
      totalSupplyFormatted?: number;
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
      graduationPercentage?: number;
      soldAmount?: number;
      holders?: number;
      description?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
      image_url?: string;
    }) => {
      // Format totalSupply for display - ALWAYS 1M tokens per contract
      let totalSupplyFormatted: number;
      if (p.totalSupplyFormatted !== undefined) {
        totalSupplyFormatted = p.totalSupplyFormatted;
      } else {
        // Contract ALWAYS mints MAX_SUPPLY = 1,000,000 tokens
        // No need for complex BigInt conversion - it's always 1M
        totalSupplyFormatted = 1000000; // Always 1M tokens as per contract
      }
      
      return {
        address: p.address,
        name: p.name,
        symbol: p.symbol,
        decimals: p.decimals || 18,
        totalSupply: totalSupplyFormatted.toFixed(1),  // Return formatted supply like "1000000.0"
        creator: p.creator || '',
        createdAt: p.createdAt,
        blockNumber: p.blockNumber || 0,
        transactionHash: p.transactionHash || '',
        status: p.status || (p.isLaunched ? 'GRADUATED' : 'CREATED'),
        isVerified: false,
        ownershipRenounced: false,
        price: (p.priceUsd ?? ((p.priceCore || 0) * CORE_PRICE_USD)),
        priceChange24h: 0,  // NOT AVAILABLE: Requires price history tracking
        // Calculate market cap using the formatted total supply
        marketCap: p.marketCap ?? (totalSupplyFormatted * (p.priceUsd ?? ((p.priceCore || 0) * CORE_PRICE_USD))),
        volume24h: 0,  // NOT AVAILABLE: Requires event aggregation over time
        liquidity: (p.liquidityCore || 0) * CORE_PRICE_USD,
        holders: p.holders || 0,  // From database via Transfer event tracking
        transactions24h: 0,  // NOT AVAILABLE: Requires event aggregation
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
      };
    };

    // Fetch holder counts from token_holders table if available
    const tokenAddresses = tokens.map(t => t.address);
    let holderCounts: Record<string, number> = {};
    
    try {
      // Check if token_holders table exists
      const hasHolderTable = await db.schema.hasTable('token_holders');
      if (hasHolderTable) {
        // Get holder counts for all tokens in one query
        const holderData = await db('token_holders')
          .select('token_address')
          .count('* as count')
          .whereIn('token_address', tokenAddresses)
          .where('balance', '>', '0')
          .groupBy('token_address');
        
        holderData.forEach(h => {
          holderCounts[h.token_address.toString().toLowerCase()] = parseInt(h.count.toString());
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch holder counts:', error);
    }
    
    let formattedTokens = tokens.map(token => {
      // Use 'raised' column instead of 'liquidity_added'
      const raisedAmount = parseFloat(token.raised || '0');
      
      // IMPORTANT: Contract mints MAX_SUPPLY (1M tokens) on creation
      // Database should have this, but ensure we use correct value
      const totalSupplyWei = token.total_supply || '1000000000000000000000000'; // 1M tokens in wei
      const totalSupply = 1000000; // Always 1M tokens as per contract MAX_SUPPLY
      
      // Calculate sold amount from database or estimate from raised amount
      // Contract uses bonding curve: base price 0.0001 CORE
      // For simplicity at low amounts: sold ≈ raised / 0.0001
      const soldAmount = parseFloat(token.sold || '0') || (raisedAmount > 0 ? raisedAmount / 0.0001 : 0);
      
      // Calculate price based on bonding curve (matching contract exactly)
      const BASE_PRICE = 0.0001; // in CORE
      const PRICE_INCREMENT = 0.0001; // in CORE per step
      const STEP_SIZE = 10000; // tokens per step
      const steps = Math.floor(soldAmount / STEP_SIZE);
      const priceCore = BASE_PRICE + (PRICE_INCREMENT * steps);
      const priceUsd = priceCore * CORE_PRICE_USD;
      // Market cap = total supply (1M) * price per token in USD
      const marketCap = 1000000 * priceUsd; // Always use 1M tokens
      
      // Use bonding_curve_progress if available, otherwise calculate
      const graduationPercentage = token.bonding_curve_progress || Math.min((raisedAmount / TARGET_CORE) * 100, 100);
      const createdAtTimestamp = token.created_timestamp || Math.floor(Date.now() / 1000);

      // Use 'status' column directly or derive from progress
      let status: 'CREATED' | 'LAUNCHED' | 'GRADUATED' = token.status || 'CREATED';
      if (status === 'CREATED' && graduationPercentage >= 100) status = 'LAUNCHED';
      
      // Get holder count from our fetched data
      const holderCount = holderCounts[token.address.toLowerCase()] || token.holders_count || 0;

      return toDto({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals || 18,
        totalSupply: totalSupplyWei,  // Pass wei, will be formatted in toDto
        totalSupplyFormatted: totalSupply,  // Pass the formatted number
        creator: token.creator || '0x0000000000000000000000000000000000000000',
        createdAt: createdAtTimestamp,
        blockNumber: 0,
        transactionHash: '',
        status,
        priceCore,
        priceUsd,  // Pass the USD price directly
        marketCap,
        liquidityCore: raisedAmount,
        graduationPercentage,
        soldAmount, // Track how many tokens have been sold
        holders: holderCount, // Pass the actual holder count
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
          // Contract ALWAYS mints 1M tokens
          const totalSupply = 1000000;
          
          // Use the price from contract or calculate from bonding curve
          const priceCore = parseFloat(t.currentPrice || '0') || 0.0001; // Default to base price
          const priceUsd = priceCore * CORE_PRICE_USD;
          
          // Use raised amount from bondingCurve or raised field
          const raisedAmount = t.raised || t.bondingCurve?.raisedAmount || parseFloat(t.reserveBalance || '0');
          const marketCap = 1000000 * priceUsd; // Always 1M tokens
          logger.info(`Token ${t.symbol}: currentPrice=${t.currentPrice}, priceCore=${priceCore}, CORE_PRICE_USD=${CORE_PRICE_USD}, price USD=${priceUsd}, marketCap=${marketCap}, totalSupply=${totalSupply}`);
          // Use graduationPercentage from contract or calculate from raised/TARGET
          const graduationPercentage = t.graduationPercentage || Math.min((raisedAmount / TARGET_CORE) * 100, 100);
          return toDto({
            address: t.address,
            name: t.name,
            symbol: t.symbol,
            decimals: 18,
            totalSupply: totalSupplyWei,
            totalSupplyFormatted: totalSupply,
            creator: t.creator,
            createdAt: t.createdAt,
            isLaunched: t.isLaunched,
            priceCore,
            priceUsd,
            marketCap,
            liquidityCore: raisedAmount,
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