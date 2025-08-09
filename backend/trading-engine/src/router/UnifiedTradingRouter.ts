import { ethers } from 'ethers';
import { EventEmitter } from 'eventemitter3';
import { 
  TradeParams, 
  TradeResult, 
  Route, 
  TokenState, 
  TradingPhase,
  TradeType,
  RouteType,
  TradingConfig,
  TradingEngineError,
  TradingError,
  TradingEvents
} from '../types';
import { BondingCurveTrader } from '../traders/BondingCurveTrader';
import { DexTrader } from '../traders/DexTrader';
import { TokenAnalyzer } from '../services/TokenAnalyzer';
import { PriceCalculator } from '../services/PriceCalculator';
import { MEVProtection } from '../services/MEVProtection';
import { logger } from '../utils/logger';

export class UnifiedTradingRouter extends EventEmitter<TradingEvents> {
  private provider: ethers.Provider;
  private bondingCurveTrader: BondingCurveTrader;
  private dexTrader: DexTrader;
  private tokenAnalyzer: TokenAnalyzer;
  private priceCalculator: PriceCalculator;
  private mevProtection: MEVProtection;
  private config: TradingConfig;

  constructor(
    provider: ethers.Provider,
    config: TradingConfig
  ) {
    super();
    this.provider = provider;
    this.config = config;
    
    this.bondingCurveTrader = new BondingCurveTrader(provider, config);
    this.dexTrader = new DexTrader(provider, config);
    this.tokenAnalyzer = new TokenAnalyzer(provider, config);
    this.priceCalculator = new PriceCalculator(provider, config);
    this.mevProtection = new MEVProtection(provider, config);
  }

  async executeTrade(
    params: TradeParams,
    signer: ethers.Signer
  ): Promise<TradeResult> {
    try {
      logger.info('Executing trade', { params });
      this.emit('trade:initiated', params);

      // Analyze token state
      const tokenState = await this.tokenAnalyzer.analyzeToken(params.tokenAddress);
      if (!tokenState) {
        throw new TradingEngineError(
          TradingError.TOKEN_NOT_TRADEABLE,
          `Token ${params.tokenAddress} not found or not tradeable`
        );
      }

      // Validate trade feasibility
      await this.validateTrade(params, tokenState);

      // Determine best route
      const route = await this.findBestRoute(params, tokenState);
      this.emit('trade:routed', route);

      // Check for MEV threats
      if (this.config.mevProtection.enabled) {
        const threat = await this.mevProtection.detectThreat(params, route);
        if (threat) {
          logger.warn('MEV threat detected', { threat });
          this.emit('mev:detected', { 
            transaction: {} as any, 
            threat: threat.description 
          });
        }
      }

      // Execute trade based on phase
      let result: TradeResult;
      if (tokenState.phase === TradingPhase.BONDING_CURVE) {
        result = await this.bondingCurveTrader.execute(params, route, signer);
      } else {
        result = await this.dexTrader.execute(params, route, signer);
      }

      // Check slippage
      const actualSlippage = this.calculateActualSlippage(
        params,
        result.amountOut
      );
      if (actualSlippage > params.slippageTolerance) {
        this.emit('slippage:warning', {
          expected: params.slippageTolerance,
          actual: actualSlippage
        });
      }

      this.emit('trade:confirmed', result);
      logger.info('Trade executed successfully', { result });
      return result;

    } catch (error: any) {
      const tradingError = this.handleError(error);
      this.emit('trade:failed', { params, error: tradingError });
      throw tradingError;
    }
  }

  private async validateTrade(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<void> {
    // Check if token is open for trading
    if (!tokenState.isOpen) {
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'Token is not open for trading'
      );
    }

    // Check sell restrictions for bonding curve
    if (params.type === TradeType.SELL && 
        tokenState.phase === TradingPhase.BONDING_CURVE && 
        !tokenState.canSell) {
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'Selling is not allowed during bonding curve phase'
      );
    }

    // Check liquidity
    const liquidity = await this.checkLiquidity(params, tokenState);
    if (!liquidity.sufficient) {
      throw new TradingEngineError(
        TradingError.INSUFFICIENT_LIQUIDITY,
        `Insufficient liquidity: ${liquidity.message}`
      );
    }

    // Check price impact
    const priceImpact = await this.priceCalculator.calculatePriceImpact(
      params,
      tokenState
    );
    if (priceImpact > 10) { // 10% max price impact
      throw new TradingEngineError(
        TradingError.PRICE_IMPACT_TOO_HIGH,
        `Price impact too high: ${priceImpact.toFixed(2)}%`
      );
    }
  }

  private async findBestRoute(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<Route> {
    const routes: Route[] = [];

    // For bonding curve phase
    if (tokenState.phase === TradingPhase.BONDING_CURVE) {
      const bondingRoute = await this.bondingCurveTrader.getRoute(
        params,
        tokenState
      );
      routes.push(bondingRoute);
    } 
    // For DEX phase
    else {
      // Get routes from all available DEXes
      const dexRoutes = await this.dexTrader.getAllRoutes(
        params,
        tokenState
      );
      routes.push(...dexRoutes);

      // Consider multi-hop routes for better prices
      if (params.type === TradeType.BUY) {
        const multiHopRoutes = await this.dexTrader.getMultiHopRoutes(
          params,
          tokenState
        );
        routes.push(...multiHopRoutes);
      }
    }

    // Sort by best output (considering fees)
    const bestRoute = this.selectOptimalRoute(routes, params);
    
    if (!bestRoute) {
      throw new TradingEngineError(
        TradingError.ROUTE_NOT_FOUND,
        'No valid route found for trade'
      );
    }

    logger.info('Best route selected', { 
      route: bestRoute.type,
      dex: bestRoute.dex,
      priceImpact: bestRoute.priceImpact 
    });

    return bestRoute;
  }

  private selectOptimalRoute(
    routes: Route[],
    params: TradeParams
  ): Route | null {
    if (routes.length === 0) return null;

    // Sort routes based on output amount (for buys) or input amount (for sells)
    return routes.sort((a, b) => {
      if (params.type === TradeType.BUY) {
        // For buys, we want maximum output
        return BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : -1;
      } else {
        // For sells, we want minimum input for desired output
        return BigInt(a.amountIn) < BigInt(b.amountIn) ? 1 : -1;
      }
    })[0];
  }

  private async checkLiquidity(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<{ sufficient: boolean; message?: string }> {
    if (tokenState.phase === TradingPhase.BONDING_CURVE) {
      // For bonding curve, check if there's enough supply
      if (params.type === TradeType.BUY) {
        const remaining = BigInt(tokenState.totalSupply || '0') - 
                         BigInt(tokenState.sold || '0');
        if (remaining <= 0n) {
          return { 
            sufficient: false, 
            message: 'No tokens remaining in bonding curve' 
          };
        }
      }
    } else {
      // For DEX, check pool liquidity
      const liquidity = BigInt(tokenState.liquidity || '0');
      const tradeAmount = BigInt(params.amount);
      
      // Check if trade size is too large relative to liquidity
      if (tradeAmount > liquidity / 10n) { // More than 10% of liquidity
        return { 
          sufficient: false, 
          message: 'Trade size too large relative to pool liquidity' 
        };
      }
    }

    return { sufficient: true };
  }

  private calculateActualSlippage(
    params: TradeParams,
    actualAmountOut: string
  ): number {
    if (!params.minAmountOut) return 0;
    
    const expected = BigInt(params.minAmountOut);
    const actual = BigInt(actualAmountOut);
    
    if (actual < expected) {
      const slippage = ((expected - actual) * 10000n) / expected;
      return Number(slippage) / 100; // Convert to percentage
    }
    
    return 0;
  }

  private handleError(error: any): TradingEngineError {
    if (error instanceof TradingEngineError) {
      return error;
    }

    // Parse common errors
    if (error.message?.includes('insufficient balance')) {
      return new TradingEngineError(
        TradingError.INSUFFICIENT_BALANCE,
        'Insufficient balance for trade',
        error
      );
    }

    if (error.message?.includes('deadline')) {
      return new TradingEngineError(
        TradingError.DEADLINE_EXCEEDED,
        'Trade deadline exceeded',
        error
      );
    }

    if (error.message?.includes('gas')) {
      return new TradingEngineError(
        TradingError.GAS_PRICE_TOO_HIGH,
        'Gas price exceeds maximum',
        error
      );
    }

    return new TradingEngineError(
      TradingError.UNKNOWN_ERROR,
      error.message || 'Unknown error occurred',
      error
    );
  }

  async getQuote(params: TradeParams): Promise<Route> {
    const tokenState = await this.tokenAnalyzer.analyzeToken(params.tokenAddress);
    if (!tokenState) {
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'Token not found'
      );
    }

    return this.findBestRoute(params, tokenState);
  }

  async getTokenState(address: string): Promise<TokenState | null> {
    return this.tokenAnalyzer.analyzeToken(address);
  }
}