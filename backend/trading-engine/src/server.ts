import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { UnifiedTradingRouter } from './router/UnifiedTradingRouter';
import { TradeParams, TradeType } from './types';
import { config, validateConfig } from './config';
import { createLogger } from '@core-meme/shared';

dotenv.config();

const app: express.Application = express();
const PORT = process.env.TRADING_ENGINE_PORT || 3003;
const logger = createLogger({ service: 'trading-engine' });

// Middleware
app.use(cors());
app.use(express.json());

// Initialize provider and router
let router: UnifiedTradingRouter;
let provider: ethers.JsonRpcProvider;

async function initializeRouter() {
  try {
    validateConfig();
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Verify connection
    const network = await provider.getNetwork();
    logger.info('Connected to network', { 
      chainId: network.chainId.toString(),
      name: network.name 
    });

    // Initialize trading router
    router = new UnifiedTradingRouter(provider, config);
    
    // Set up event listeners
    router.on('trade:initiated', (params) => {
      logger.info('Trade initiated', { params });
    });

    router.on('trade:routed', (route) => {
      logger.info('Route selected', { 
        type: route.type,
        dex: route.dex,
        priceImpact: route.priceImpact 
      });
    });

    router.on('trade:confirmed', (result) => {
      logger.info('Trade confirmed', { 
        hash: result.transactionHash,
        success: result.success 
      });
    });

    router.on('trade:failed', ({ params, error }) => {
      logger.error('Trade failed', { params, error: error.message });
    });

    logger.info('Trading router initialized');
  } catch (error: any) {
    logger.error('Failed to initialize router:', error);
    throw error;
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    network: config.network 
  });
});

// Get trading quote
app.post('/api/trade/quote', async (req, res) => {
  try {
    if (!router) {
      return res.status(503).json({ 
        success: false, 
        error: 'Trading engine not initialized' 
      });
    }

    const params: TradeParams = req.body;
    
    // Validate params
    if (!params.tokenAddress || !params.amount || !params.type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters' 
      });
    }

    const quote = await router.getQuote(params);
    
    res.json({
      success: true,
      quote: {
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
        priceImpact: quote.priceImpact,
        executionPrice: quote.executionPrice,
        route: quote.type,
        dex: quote.dex,
        estimatedGas: quote.estimatedGas
      }
    });
  } catch (error: any) {
    logger.error('Quote failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get quote' 
    });
  }
});

// Simulate trade
app.post('/api/trade/simulate', async (req, res) => {
  try {
    if (!router) {
      return res.status(503).json({ 
        success: false, 
        error: 'Trading engine not initialized' 
      });
    }

    const params: TradeParams = req.body;
    
    // Validate params
    if (!params.tokenAddress || !params.amount || !params.type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters' 
      });
    }

    // Get quote first
    const quote = await router.getQuote(params);
    
    // Calculate price impact warning
    let warning: string | undefined;
    if (quote.priceImpact > 5) {
      warning = `High price impact: ${quote.priceImpact.toFixed(2)}%`;
    }
    if (quote.priceImpact > 10) {
      warning = `Very high price impact: ${quote.priceImpact.toFixed(2)}% - consider smaller trade size`;
    }

    res.json({
      success: true,
      estimatedOutput: quote.amountOut,
      priceImpact: quote.priceImpact,
      warning,
      route: quote.type,
      dex: quote.dex,
      gasEstimate: quote.estimatedGas,
    });
  } catch (error: any) {
    logger.error('Simulation failed:', error);
    res.status(500).json({ 
      success: false, 
      estimatedOutput: '0',
      priceImpact: 0,
      warning: 'Unable to simulate trade',
      error: error.message 
    });
  }
});

// Execute trade
app.post('/api/trade/execute', async (req, res) => {
  try {
    if (!router) {
      return res.status(503).json({ 
        success: false, 
        error: 'Trading engine not initialized' 
      });
    }

    const { params, privateKey } = req.body;
    
    // Validate params
    if (!params?.tokenAddress || !params?.amount || !params?.type || !privateKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters or missing private key' 
      });
    }

    // Create signer from private key
    const signer = new ethers.Wallet(privateKey, provider);
    
    // Execute trade
    const result = await router.executeTrade(params, signer);
    
    res.json({
      success: result.success,
      transactionHash: result.transactionHash,
      tokensBought: result.amountIn,
      tokensReceived: result.amountOut,
      gasUsed: result.gasUsed,
      effectivePrice: result.executionPrice,
      error: result.error,
    });
  } catch (error: any) {
    logger.error('Trade execution failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to execute trade' 
    });
  }
});

// Get token analysis
app.get('/api/token/:address/analysis', async (req, res) => {
  try {
    if (!router) {
      return res.status(503).json({ 
        success: false, 
        error: 'Trading engine not initialized' 
      });
    }

    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid token address' 
      });
    }

    const analysis = await router.getTokenState(address);
    
    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    logger.error('Token analysis failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to analyze token' 
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
async function start() {
  try {
    await initializeRouter();
    
    app.listen(PORT, () => {
      logger.info(`Trading Engine HTTP server running on port ${PORT}`);
      logger.info(`Network: ${config.network}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down Trading Engine HTTP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down Trading Engine HTTP server...');
  process.exit(0);
});

// Start the server
start();

export default app;