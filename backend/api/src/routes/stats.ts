import { Router, Request, Response } from 'express';
import { createLogger } from '@core-meme/shared';
import { db } from '../db';

const router: Router = Router();
const logger = createLogger({ service: 'api-stats', enableFileLogging: false });

// Constants
const TARGET_CORE = 3; // 3 CORE to graduate
const CORE_PRICE_USD = 50; // 1 CORE = $50

/**
 * Helper function to format tokens for frontend
 */
function formatTokensForFrontend(tokens: any[]) {
  return tokens.map(token => {
    // Parse values - use 'raised' instead of 'liquidity_added'
    const raisedAmount = parseFloat(token.raised || '0');
    const totalSupplyWei = token.total_supply || '1000000000000000000000000';
    const totalSupply = parseFloat(totalSupplyWei) / 1e18;
    
    // Calculate graduation percentage from raised amount or bonding_curve_progress
    const graduationPercentage = token.bonding_curve_progress || Math.min((raisedAmount / TARGET_CORE) * 100, 100);
    
    // Price calculations
    const priceCore = parseFloat(token.price_core || '0.000001');
    const priceUsd = priceCore * CORE_PRICE_USD;
    
    // Market cap calculation
    const marketCap = totalSupply * priceUsd;
    
    // Status determination - use database status or calculate from progress
    let status: 'CREATED' | 'LAUNCHED' | 'GRADUATED' = token.status || 'CREATED';
    // Override with calculated status if needed
    if (status === 'CREATED' && graduationPercentage >= 100) {
      status = 'LAUNCHED';
    }
    
    // Convert created_at to Unix timestamp (seconds)
    const createdAtTimestamp = token.created_at 
      ? Math.floor(new Date(token.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    return {
      // Core fields
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals || 18,
      totalSupply: totalSupplyWei,
      creator: token.creator || '',  
      createdAt: createdAtTimestamp,
      blockNumber: 0,
      transactionHash: '',
      
      // Status fields
      status: status,
      isVerified: token.is_verified || false,
      ownershipRenounced: token.ownership_renounced || false,
      
      // Price data
      price: priceUsd,
      priceChange24h: parseFloat(token.price_change_24h || '0'),
      
      // Market data
      marketCap: marketCap,
      volume24h: raisedAmount * 10, // Estimate volume from raised
      liquidity: raisedAmount * CORE_PRICE_USD,
      
      // Stats
      holders: Math.floor(Math.random() * 100) + 10, // Placeholder until we have real data
      transactions24h: Math.floor(Math.random() * 50) + 5, // Placeholder
      
      // Graduation progress
      graduationPercentage: graduationPercentage,
      targetAmount: TARGET_CORE,
      raisedAmount: raisedAmount,
      
      // Social links
      description: token.description || '',
      website: token.website || '',
      twitter: token.twitter || '',
      telegram: token.telegram || '',
      
      // Safety scores
      rugScore: 0,
      isHoneypot: false
    };
  });
}

/**
 * GET /api/stats
 * Get platform-wide statistics from database
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Fetch all tokens first (from blockchain or DB)
    const tokensResponse = await fetch(`http://localhost:${process.env.API_PORT || 3001}/api/tokens`);
    const tokensData: any = await tokensResponse.json();
    
    if (!tokensData.success || !tokensData.tokens) {
      throw new Error('Failed to fetch tokens');
    }
    
    const tokens = tokensData.tokens;
    
    // Calculate stats from actual token data
    const graduatedCount = tokens.filter((t: any) => t.status === 'GRADUATED' || t.status === 'LAUNCHED').length;
    const totalMarketCap = tokens.reduce((sum: number, t: any) => sum + (t.marketCap || 0), 0);
    const totalVolume = tokens.reduce((sum: number, t: any) => sum + (t.volume24h || 0), 0);
    const totalHolders = tokens.reduce((sum: number, t: any) => sum + (t.holders || 0), 0);
    const totalRaised = tokens.reduce((sum: number, t: any) => sum + (t.raisedAmount || 0), 0);
    
    // For 24h stats, we'd need historical data. For now, estimate:
    const oneDayAgo = Date.now() / 1000 - 86400; // 24 hours ago in seconds
    const recentTokens = tokens.filter((t: any) => t.createdAt > oneDayAgo);
    
    const stats = {
      totalVolume: (totalVolume || totalRaised * 10).toFixed(2), // Estimate if no volume
      tokensCreated: tokens.length,
      totalHolders: totalHolders || tokens.length * 10, // Estimate if no holder data
      graduated: graduatedCount,
      totalMarketCap: totalMarketCap.toFixed(2),
      tokensCreated24h: recentTokens.length,
      // Percentage changes would need historical data
      volumeChange24h: 0,
      tokensChange24h: 0,
      holdersChange24h: 0,
      graduatedChange24h: 0
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    logger.error('Error fetching platform stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stats'
    });
  }
});

/**
 * GET /api/stats/trending
 * Get trending tokens based on volume
 */
router.get('/stats/trending', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Get top tokens by raised amount (as proxy for volume)
    const tokens = await db('tokens')
      .select('*')
      .orderBy('raised', 'desc')
      .limit(limit);
    
    // Format tokens same as main endpoint
    const formattedTokens = formatTokensForFrontend(tokens);
    
    res.json({
      success: true,
      tokens: formattedTokens,
      count: formattedTokens.length
    });
  } catch (error: any) {
    logger.error('Error fetching trending tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trending tokens'
    });
  }
});

/**
 * GET /api/stats/new
 * Get newly created tokens
 */
router.get('/stats/new', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    
    // Get newest tokens from database
    const tokens = await db('tokens')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit);
    
    // Format tokens same as main endpoint
    const formattedTokens = formatTokensForFrontend(tokens);
    
    res.json({
      success: true,
      tokens: formattedTokens,
      count: formattedTokens.length
    });
  } catch (error: any) {
    logger.error('Error fetching new tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch new tokens'
    });
  }
});

/**
 * GET /api/stats/graduating
 * Get tokens close to graduating (80%+ of bonding curve)
 */
router.get('/stats/graduating', async (req: Request, res: Response) => {
  try {
    // Calculate 80% of target
    const graduationThreshold = TARGET_CORE * 0.8;
    
    // Get tokens that have raised >= 80% of target but not graduated
    const tokens = await db('tokens')
      .select('*')
      .whereNot('status', 'GRADUATED')
      .where('raised', '>=', graduationThreshold)
      .orderBy('raised', 'desc');
    
    // Format tokens same as main endpoint
    const formattedTokens = formatTokensForFrontend(tokens);
    
    res.json({
      success: true,
      tokens: formattedTokens,
      count: formattedTokens.length
    });
  } catch (error: any) {
    logger.error('Error fetching graduating tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch graduating tokens'
    });
  }
});

export default router;