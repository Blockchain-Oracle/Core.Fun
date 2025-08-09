import { ethers } from 'ethers';
import { UnifiedTradingRouter } from './router/UnifiedTradingRouter';
import { TradeParams, TradeType } from './types';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Trading Engine starting...', { 
      network: config.network,
      rpc: config.rpcUrl 
    });

    // Initialize provider
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Verify connection
    const network = await provider.getNetwork();
    logger.info('Connected to network', { 
      chainId: network.chainId.toString(),
      name: network.name 
    });

    // Initialize trading router
    const router = new UnifiedTradingRouter(provider, config);
    
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

    router.on('mev:detected', ({ threat }) => {
      logger.warn('MEV threat detected', { threat });
    });

    router.on('slippage:warning', ({ expected, actual }) => {
      logger.warn('Slippage exceeded', { expected, actual });
    });

    logger.info('Trading Engine ready');

    // Example: Get a quote
    if (process.env.EXAMPLE_TOKEN_ADDRESS) {
      const exampleParams: TradeParams = {
        tokenAddress: process.env.EXAMPLE_TOKEN_ADDRESS,
        type: TradeType.BUY,
        amount: ethers.parseEther('0.1').toString(),
        slippageTolerance: 2,
        usePrivateMempool: false
      };

      try {
        const quote = await router.getQuote(exampleParams);
        logger.info('Quote received', {
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          priceImpact: quote.priceImpact,
          route: quote.type
        });
      } catch (error: any) {
        logger.error('Failed to get quote', { error: error.message });
      }
    }

    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info('Shutting down Trading Engine...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Shutting down Trading Engine...');
      process.exit(0);
    });

  } catch (error: any) {
    logger.error('Failed to start Trading Engine', { error: error.message });
    process.exit(1);
  }
}

// Start the engine if this is the main module
if (require.main === module) {
  main();
}