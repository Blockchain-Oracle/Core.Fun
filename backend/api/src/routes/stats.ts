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
    // Parse values
    const liquidityAdded = parseFloat(token.liquidity_added || '0');
    const totalSupplyWei = token.total_supply || '1000000000000000000000000';
    const totalSupply = parseFloat(totalSupplyWei) / 1e18;
    
    // Calculate graduation percentage
    const graduationPercentage = Math.min((liquidityAdded / TARGET_CORE) * 100, 100);
    
    // Price calculations
    const priceCore = parseFloat(token.price_core || '0.000001');
    const priceUsd = priceCore * CORE_PRICE_USD;
    
    // Market cap calculation
    const marketCap = totalSupply * priceUsd;
    
    // Status determination
    let status: 'CREATED' | 'LAUNCHED' | 'GRADUATED' = 'CREATED';
    if (token.is_launched) {
      status = 'GRADUATED';
    } else if (graduationPercentage >= 100) {
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
      creator: token.creator_address || '',
      createdAt: createdAtTimestamp,
      blockNumber: 0,
      transactionHash: '',
      
      // Status fields
      status: status,
      isVerified: token.is_verified || false,
      ownershipRenounced: false,
      
      // Price data
      price: priceUsd,
      priceChange24h: parseFloat(token.price_change_24h || '0'),
      
      // Market data
      marketCap: marketCap,
      volume24h: parseFloat(token.volume_24h || '0'),
      liquidity: liquidityAdded * CORE_PRICE_USD,
      
      // Stats
      holders: token.holders_count || 0,
      transactions24h: token.transactions_count || 0,
      
      // Graduation progress
      graduationPercentage: graduationPercentage,
      targetAmount: TARGET_CORE,
      raisedAmount: liquidityAdded,
      
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
    // Get aggregated stats from database
    const [tokenStats] = await db('tokens')
      .select(
        db.raw('COUNT(*) as token_count'),
        db.raw('COUNT(CASE WHEN is_launched = true THEN 1 END) as graduated_count'),
        db.raw('COALESCE(SUM(holders_count), 0) as total_holders'),
        db.raw('COALESCE(SUM(CAST(volume_24h as DECIMAL)), 0) as total_volume'),
        db.raw('COALESCE(SUM(CAST(market_cap as DECIMAL)), 0) as total_market_cap')
      );
    
    // Get 24h stats
    const oneDayAgo = new Date(Date.now() - 86400000); // 24 hours ago
    const [recentStats] = await db('tokens')
      .select(
        db.raw('COUNT(*) as recent_count')
      )
      .where('created_at', '>=', oneDayAgo);
    
    // Calculate CORE values
    const totalVolumeCore = parseFloat(tokenStats.total_volume || '0');
    const totalMarketCapUsd = parseFloat(tokenStats.total_market_cap || '0');
    
    const stats = {
      totalVolume: totalVolumeCore.toFixed(2),
      tokensCreated: parseInt(tokenStats.token_count) || 0,
      totalHolders: parseInt(tokenStats.total_holders) || 0,
      graduated: parseInt(tokenStats.graduated_count) || 0,
      totalMarketCap: totalMarketCapUsd.toFixed(2),
      tokensCreated24h: parseInt(recentStats.recent_count) || 0,
      // Calculate percentage changes (would need historical data)
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
    
    // Get top tokens by volume from database
    const tokens = await db('tokens')
      .select('*')
      .orderBy('volume_24h', 'desc')
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
    
    // Get tokens that have raised >= 80% of target but not launched
    const tokens = await db('tokens')
      .select('*')
      .where('is_launched', false)
      .where('liquidity_added', '>=', graduationThreshold)
      .orderBy('liquidity_added', 'desc');
    
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