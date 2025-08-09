import { ethers } from 'ethers';
import Decimal from 'decimal.js';
import { TradeParams, TokenState, TradingPhase, TradeType, TradingConfig } from '../types';
import { logger } from '../utils/logger';

export class PriceCalculator {
  private provider: ethers.Provider;
  private config: TradingConfig;

  constructor(provider: ethers.Provider, config: TradingConfig) {
    this.provider = provider;
    this.config = config;
  }

  async calculatePriceImpact(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<number> {
    if (tokenState.phase === TradingPhase.BONDING_CURVE) {
      return this.calculateBondingCurvePriceImpact(params, tokenState);
    } else {
      return this.calculateDexPriceImpact(params, tokenState);
    }
  }

  private calculateBondingCurvePriceImpact(
    params: TradeParams,
    tokenState: TokenState
  ): number {
    if (!tokenState.currentPrice || tokenState.currentPrice === '0') {
      return 0;
    }

    const currentSold = BigInt(tokenState.sold || '0');
    const targetSupply = BigInt(tokenState.totalSupply || '0');
    const tradeSize = BigInt(params.amount);

    // Estimate new sold amount after trade
    let newSold: bigint;
    if (params.type === TradeType.BUY) {
      // Rough estimate: trade size / current price
      const estimatedTokens = tradeSize / BigInt(tokenState.currentPrice);
      newSold = currentSold + estimatedTokens;
    } else {
      newSold = currentSold - tradeSize;
    }

    // Calculate price change percentage
    const priceChange = ((newSold - currentSold) * 100n) / targetSupply;
    return Number(priceChange);
  }

  private calculateDexPriceImpact(
    params: TradeParams,
    tokenState: TokenState
  ): number {
    const liquidity = BigInt(tokenState.liquidity || '0');
    if (liquidity === 0n) {
      return 100; // Maximum impact if no liquidity
    }

    const tradeSize = BigInt(params.amount);
    
    // Simplified constant product formula impact
    // Impact = (tradeSize / liquidity) * 100
    const impact = (tradeSize * 10000n) / liquidity;
    return Number(impact) / 100;
  }

  async estimateGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    const baseGasPrice = feeData.gasPrice || 0n;
    
    // Add buffer for faster inclusion
    const buffer = baseGasPrice / 10n; // 10% buffer
    return baseGasPrice + buffer;
  }

  calculateMinimumAmountOut(
    expectedAmount: string,
    slippageTolerance: number
  ): string {
    const expected = new Decimal(expectedAmount);
    const slippage = new Decimal(slippageTolerance).div(100);
    const minimum = expected.mul(new Decimal(1).sub(slippage));
    
    return minimum.toFixed(0);
  }

  calculateMaximumAmountIn(
    expectedAmount: string,
    slippageTolerance: number
  ): string {
    const expected = new Decimal(expectedAmount);
    const slippage = new Decimal(slippageTolerance).div(100);
    const maximum = expected.mul(new Decimal(1).add(slippage));
    
    return maximum.toFixed(0);
  }

  async estimateOptimalGasPrice(priority: 'slow' | 'normal' | 'fast'): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    const baseGasPrice = feeData.gasPrice || 0n;
    
    switch (priority) {
      case 'slow':
        return (baseGasPrice * 90n) / 100n; // 90% of base
      case 'normal':
        return baseGasPrice;
      case 'fast':
        return (baseGasPrice * 120n) / 100n; // 120% of base
      default:
        return baseGasPrice;
    }
  }

  calculateExecutionPrice(
    amountIn: string,
    amountOut: string,
    decimalsIn: number = 18,
    decimalsOut: number = 18
  ): string {
    const adjustedIn = new Decimal(amountIn).div(new Decimal(10).pow(decimalsIn));
    const adjustedOut = new Decimal(amountOut).div(new Decimal(10).pow(decimalsOut));
    
    if (adjustedOut.isZero()) {
      return '0';
    }
    
    return adjustedIn.div(adjustedOut).toFixed();
  }

  calculateAPY(
    initialPrice: string,
    currentPrice: string,
    timeElapsedSeconds: number
  ): number {
    if (timeElapsedSeconds === 0 || initialPrice === '0') {
      return 0;
    }

    const initial = new Decimal(initialPrice);
    const current = new Decimal(currentPrice);
    const timeInYears = new Decimal(timeElapsedSeconds).div(365 * 24 * 60 * 60);
    
    const totalReturn = current.sub(initial).div(initial);
    const apy = totalReturn.div(timeInYears).mul(100);
    
    return apy.toNumber();
  }

  estimateTokensReceived(
    coreAmount: string,
    currentSold: string,
    targetSupply: string,
    initialPrice: string,
    finalPrice: string
  ): string {
    // Linear bonding curve calculation
    const core = new Decimal(coreAmount);
    const sold = new Decimal(currentSold);
    const target = new Decimal(targetSupply);
    const initPrice = new Decimal(initialPrice);
    const finPrice = new Decimal(finalPrice);
    
    // Average price for the purchase
    const remaining = target.sub(sold);
    const priceRange = finPrice.sub(initPrice);
    const currentPrice = initPrice.add(priceRange.mul(sold.div(target)));
    
    // Rough estimate: amount / average price
    const avgPrice = currentPrice.add(priceRange.div(2));
    const tokens = core.div(avgPrice);
    
    return tokens.toFixed(0);
  }
}