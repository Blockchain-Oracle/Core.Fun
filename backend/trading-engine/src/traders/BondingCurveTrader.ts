import { ethers } from 'ethers';
import Decimal from 'decimal.js';
import { 
  TradeParams, 
  TradeResult, 
  Route,
  RouteType,
  TokenState,
  TradeType,
  TradingPhase,
  BondingCurveQuote,
  TradingConfig,
  TradingEngineError,
  TradingError
} from '../types';
import { logger } from '../utils/logger';

const MEMEFACTORY_ABI = [
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) external pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) external pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
  'function TOKEN_LIMIT() external view returns (uint256)',
  'function TARGET() external view returns (uint256)',
  'function MAX_SUPPLY() external view returns (uint256)',
  'function creationFee() external view returns (uint256)',
  'function platformTradingFee() external view returns (uint256)',
  'event TokenPurchased(address indexed token, address indexed buyer, uint256 amount, uint256 cost, uint256 timestamp)',
  'event TokenSold(address indexed token, address indexed seller, uint256 amount, uint256 proceeds, uint256 timestamp)'
];

export class BondingCurveTrader {
  private provider: ethers.Provider;
  private config: TradingConfig;
  private factoryContract?: ethers.Contract;

  constructor(provider: ethers.Provider, config: TradingConfig) {
    this.provider = provider;
    this.config = config;
    
    if (config.memeFactoryAddress) {
      this.factoryContract = new ethers.Contract(
        config.memeFactoryAddress,
        MEMEFACTORY_ABI,
        provider
      );
    }
  }

  async execute(
    params: TradeParams,
    route: Route,
    signer: ethers.Signer
  ): Promise<TradeResult> {
    if (!this.factoryContract) {
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'MemeFactory contract not configured'
      );
    }

    const factoryWithSigner = this.factoryContract.connect(signer);

    try {
      let tx: ethers.TransactionResponse;
      let receipt: ethers.TransactionReceipt | null;

      if (params.type === TradeType.BUY) {
        // Calculate gas price with MEV protection
        const gasPrice = await this.calculateGasPrice();
        
        // Execute buy transaction
        tx = await (factoryWithSigner as any).buyToken(
          params.tokenAddress,
          params.minAmountOut || '0',
          {
            value: params.amount,
            gasPrice,
            gasLimit: route.estimatedGas
          }
        );
        
        logger.info('Buy transaction submitted', { 
          hash: await tx.hash,
          token: params.tokenAddress 
        });
      } else {
        // Execute sell transaction
        tx = await (factoryWithSigner as any).sellToken(
          params.tokenAddress,
          params.amount,
          params.minAmountOut || '0',
          {
            gasPrice: await this.calculateGasPrice(),
            gasLimit: route.estimatedGas
          }
        );
        
        logger.info('Sell transaction submitted', { 
          hash: await tx.hash,
          token: params.tokenAddress 
        });
      }

      // Wait for confirmation
      receipt = await tx.wait();
      
      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      // Parse events to get actual amounts
      const { amountIn, amountOut } = this.parseTransactionEvents(
        receipt,
        params.type
      );

      const result: TradeResult = {
        success: true,
        transactionHash: await tx.hash,
        tokenAddress: params.tokenAddress,
        type: params.type,
        phase: TradingPhase.BONDING_CURVE,
        amountIn: amountIn || params.amount,
        amountOut: amountOut || route.amountOut,
        executionPrice: route.executionPrice,
        priceImpact: route.priceImpact,
        route,
        gasUsed: receipt.gasUsed.toString(),
        gasCost: (receipt.gasUsed * receipt.gasPrice).toString(),
        timestamp: Date.now()
      };

      logger.info('Bonding curve trade successful', { result });
      return result;

    } catch (error: any) {
      logger.error('Bonding curve trade failed', { error: error.message });
      
      return {
        success: false,
        tokenAddress: params.tokenAddress,
        type: params.type,
        phase: TradingPhase.BONDING_CURVE,
        amountIn: params.amount,
        amountOut: '0',
        executionPrice: '0',
        priceImpact: 0,
        route,
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  async getRoute(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<Route> {
    if (!this.factoryContract) {
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'MemeFactory contract not configured'
      );
    }

    const quote = await this.getQuote(params, tokenState);
    
    // Estimate gas for the transaction
    const estimatedGas = params.type === TradeType.BUY 
      ? '150000' // Typical gas for buy
      : '120000'; // Typical gas for sell

    // Calculate fees
    const tradingFee = await this.factoryContract.platformTradingFee();
    const totalFeePercent = Number(tradingFee) / 10000; // platformTradingFee is in basis points
    const feeAmount = new Decimal(params.amount)
      .mul(totalFeePercent)
      .toFixed(0);

    return {
      type: RouteType.BONDING_CURVE,
      path: [this.config.wcoreAddress, params.tokenAddress],
      estimatedGas,
      priceImpact: this.calculatePriceImpact(quote, tokenState),
      executionPrice: quote.pricePerToken,
      amountIn: params.amount,
      amountOut: quote.tokensOut,
      minimumAmountOut: params.minAmountOut || quote.tokensOut,
      fee: feeAmount
    };
  }

  async getQuote(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<BondingCurveQuote> {
    if (!this.factoryContract) {
      throw new TradingEngineError(
        TradingError.TOKEN_NOT_TRADEABLE,
        'MemeFactory contract not configured'
      );
    }

    const tokenInfo = await this.factoryContract.getTokenInfo(params.tokenAddress);
    const currentSold = tokenInfo.sold.toString();
    const targetSupply = await this.factoryContract.TOKEN_LIMIT();

    if (params.type === TradeType.BUY) {
      // Calculate tokens out for Core amount
      const tokensOut = await this.factoryContract.calculateTokensOut(
        currentSold,
        params.amount
      );

      const newSupply = BigInt(currentSold) + BigInt(tokensOut);
      const willTriggerLaunch = newSupply >= BigInt(targetSupply);
      
      return {
        tokensOut: tokensOut.toString(),
        costInWei: params.amount,
        pricePerToken: this.calculatePricePerToken(params.amount, tokensOut.toString()),
        currentSupply: currentSold,
        targetSupply: targetSupply.toString(),
        progressPercent: (Number(currentSold) / Number(targetSupply)) * 100,
        nextPriceIncrement: await this.calculateNextPriceIncrement(currentSold),
        willTriggerLaunch
      };
    } else {
      // Calculate ETH out for token amount
      const ethOut = await this.factoryContract.calculateETHOut(
        currentSold,
        params.amount
      );

      return {
        tokensOut: params.amount,
        costInWei: ethOut.toString(),
        pricePerToken: this.calculatePricePerToken(ethOut.toString(), params.amount),
        currentSupply: currentSold,
        targetSupply: targetSupply.toString(),
        progressPercent: (Number(currentSold) / Number(targetSupply)) * 100,
        nextPriceIncrement: await this.calculateNextPriceIncrement(currentSold),
        willTriggerLaunch: false
      };
    }
  }

  private calculatePricePerToken(coreAmount: string, tokenAmount: string): string {
    if (tokenAmount === '0') return '0';
    
    const price = new Decimal(coreAmount)
      .div(tokenAmount)
      .toFixed(0);
    
    return price;
  }

  private calculatePriceImpact(
    quote: BondingCurveQuote,
    tokenState: TokenState
  ): number {
    // For bonding curve, price impact is based on curve progression
    const currentPrice = tokenState.currentPrice || '0';
    const executionPrice = quote.pricePerToken;
    
    if (currentPrice === '0') return 0;
    
    const impact = new Decimal(executionPrice)
      .sub(currentPrice)
      .div(currentPrice)
      .mul(100)
      .abs()
      .toNumber();
    
    return Math.min(impact, 100); // Cap at 100%
  }

  private async calculateNextPriceIncrement(currentSold: string): Promise<string> {
    if (!this.factoryContract) return '0';
    
    // Using the bonding curve formula from the contract
    // basePrice = 0.0001 ether, priceIncrement = 0.0001 ether, step = 10000 ether
    const basePrice = BigInt('100000000000000'); // 0.0001 ether in wei
    const priceIncrement = BigInt('100000000000000'); // 0.0001 ether in wei
    const step = BigInt('10000000000000000000000'); // 10000 ether in wei
    
    const currentStep = BigInt(currentSold) / step;
    const nextPrice = basePrice + (priceIncrement * (currentStep + 1n));
    const currentPrice = basePrice + (priceIncrement * currentStep);
    
    return (nextPrice - currentPrice).toString();
  }

  private async calculateGasPrice(): Promise<bigint> {
    const baseGasPrice = (await this.provider.getFeeData()).gasPrice || 0n;
    
    // Add priority fee for MEV protection if enabled
    if (this.config.mevProtection.enabled) {
      const priorityFee = BigInt(this.config.mevProtection.maxPriorityFee);
      return baseGasPrice + priorityFee;
    }
    
    return baseGasPrice;
  }

  private parseTransactionEvents(
    receipt: ethers.TransactionReceipt | null,
    tradeType: TradeType
  ): { amountIn?: string; amountOut?: string } {
    // Parse TokenPurchased or TokenSold events
    if (!receipt) return {};
    for (const log of receipt.logs) {
      try {
        const parsed = this.factoryContract?.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
        
        if (parsed?.name === 'TokenPurchased' && tradeType === TradeType.BUY) {
          return {
            amountIn: parsed.args.cost.toString(),
            amountOut: parsed.args.amount.toString()
          };
        }
        
        if (parsed?.name === 'TokenSold' && tradeType === TradeType.SELL) {
          return {
            amountIn: parsed.args.amount.toString(),
            amountOut: parsed.args.proceeds.toString()
          };
        }
      } catch {
        // Continue to next log
      }
    }
    
    return {};
  }
}