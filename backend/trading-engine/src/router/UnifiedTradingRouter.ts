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
import { TokenAnalyzer } from '../services/TokenAnalyzer';
import { PriceCalculator } from '../services/PriceCalculator';
import { MEVProtection } from '../services/MEVProtection';
import { logger } from '../utils/logger';

/**
 * Unified Trading Router for MemeFactory Platform
 * Handles all bonding curve trades through the factory contract
 */
export class UnifiedTradingRouter extends EventEmitter<TradingEvents> {
  private provider: ethers.Provider;
  private bondingCurveTrader: BondingCurveTrader;
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
    this.tokenAnalyzer = new TokenAnalyzer(provider, config);
    this.priceCalculator = new PriceCalculator(provider, config);
    this.mevProtection = new MEVProtection(provider, config);
  }

  async executeTrade(
    params: TradeParams,
    signer: ethers.Signer
  ): Promise<TradeResult> {
    try {
      logger.info('Executing bonding curve trade', { params });
      this.emit('trade:initiated', params);

      // Analyze token state from MemeFactory
      const tokenState = await this.tokenAnalyzer.analyzeToken(params.tokenAddress);
      if (!tokenState) {
        throw new TradingEngineError(
          TradingError.TOKEN_NOT_TRADEABLE,
          `Token ${params.tokenAddress} not found in MemeFactory`
        );
      }

      // Validate trade feasibility
      await this.validateTrade(params, tokenState);

      // Get bonding curve route
      const route = await this.bondingCurveTrader.getRoute(params, tokenState);
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

      // Execute trade through MemeFactory
      const result = await this.bondingCurveTrader.execute(params, route, signer);

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
    // Check if token sale is open
    if (!tokenState.isOpen) {
      if (tokenState.isLaunched) {
        throw new TradingEngineError(
          TradingError.TOKEN_NOT_TRADEABLE,
          'Token has already launched to DEX'
        );
      }
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'Token sale is not open'
      );
    }

    // Check minimum amounts
    if (params.type === TradeType.BUY) {
      const minBuy = ethers.parseEther('0.001'); // 0.001 CORE minimum
      if (BigInt(params.amount) < minBuy) {
        throw new TradingEngineError(
          TradingError.AMOUNT_TOO_LOW,
          'Minimum buy amount is 0.001 CORE'
        );
      }
    }

    // Check if approaching launch threshold
    if (tokenState.progressPercent && tokenState.progressPercent > 95) {
      logger.warn('Token approaching launch threshold', {
        token: params.tokenAddress,
        progress: tokenState.progressPercent
      });
    }

    // Check price impact
    const priceImpact = await this.priceCalculator.calculatePriceImpact(
      params,
      tokenState
    );
    if (priceImpact > 15) { // 15% max price impact for bonding curve
      throw new TradingEngineError(
        TradingError.PRICE_IMPACT_TOO_HIGH,
        `Price impact too high: ${priceImpact.toFixed(2)}%`
      );
    }
  }

  async getQuote(params: TradeParams): Promise<Route> {
    try {
      const tokenState = await this.tokenAnalyzer.analyzeToken(params.tokenAddress);
      if (!tokenState) {
        throw new TradingEngineError(
          TradingError.TOKEN_NOT_TRADEABLE,
          'Token not found'
        );
      }

      return await this.bondingCurveTrader.getRoute(params, tokenState);
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  async getTokenState(tokenAddress: string): Promise<TokenState | null> {
    return await this.tokenAnalyzer.analyzeToken(tokenAddress);
  }

  private calculateActualSlippage(
    params: TradeParams,
    actualAmountOut: string
  ): number {
    if (!params.minAmountOut) return 0;
    
    const expected = BigInt(params.minAmountOut);
    const actual = BigInt(actualAmountOut);
    
    if (actual >= expected) return 0;
    
    const slippage = Number(((expected - actual) * 10000n) / expected) / 100;
    return slippage;
  }

  private handleError(error: any): TradingEngineError {
    if (error instanceof TradingEngineError) {
      return error;
    }

    if (error.code === 'CALL_EXCEPTION') {
      if (error.reason?.includes('InsufficientETH')) {
        return new TradingEngineError(
          TradingError.INSUFFICIENT_BALANCE,
          'Insufficient CORE balance'
        );
      }
      if (error.reason?.includes('TokenAmountTooLow')) {
        return new TradingEngineError(
          TradingError.AMOUNT_TOO_LOW,
          'Token amount below minimum'
        );
      }
      if (error.reason?.includes('SaleClosed')) {
        return new TradingEngineError(
          TradingError.TOKEN_NOT_TRADEABLE,
          'Token sale is closed'
        );
      }
      if (error.reason?.includes('AmountExceeded')) {
        return new TradingEngineError(
          TradingError.AMOUNT_TOO_HIGH,
          'Amount exceeds bonding curve limit'
        );
      }
    }

    if (error.code === 'INSUFFICIENT_FUNDS') {
      return new TradingEngineError(
        TradingError.INSUFFICIENT_BALANCE,
        'Insufficient balance for transaction'
      );
    }

    logger.error('Unexpected trading error', { error });
    return new TradingEngineError(
      TradingError.UNKNOWN_ERROR,
      error.message || 'Unknown trading error'
    );
  }
}