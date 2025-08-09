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
  DexQuote,
  TradingConfig,
  TradingEngineError,
  TradingError
} from '../types';
import { logger } from '../utils/logger';

const ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)'
];

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

interface DexInfo {
  name: string;
  router: string;
  factory: string;
  initCodeHash: string;
  fee: number;
}

export class DexTrader {
  private provider: ethers.Provider;
  private config: TradingConfig;
  private dexes: Map<string, DexInfo> = new Map();

  constructor(provider: ethers.Provider, config: TradingConfig) {
    this.provider = provider;
    this.config = config;
    
    // Initialize DEX configurations
    this.initializeDexes();
  }

  private initializeDexes() {
    // Add configured DEXes
    for (const [name, dexConfig] of Object.entries(this.config.dexRouters)) {
      this.dexes.set(name, {
        name,
        router: dexConfig.address,
        factory: dexConfig.factory,
        initCodeHash: dexConfig.initCodeHash,
        fee: 0.3 // Default 0.3% fee
      });
    }
  }

  async execute(
    params: TradeParams,
    route: Route,
    signer: ethers.Signer
  ): Promise<TradeResult> {
    const dexInfo = this.dexes.get(route.dex || '');
    if (!dexInfo) {
      throw new TradingEngineError(
        TradingError.ROUTE_NOT_FOUND,
        'DEX not found'
      );
    }

    const router = new ethers.Contract(
      dexInfo.router,
      ROUTER_ABI,
      signer
    );

    try {
      let tx: ethers.TransactionResponse;
      let receipt: ethers.TransactionReceipt | null;

      // Set deadline
      const deadline = params.deadline || Math.floor(Date.now() / 1000) + this.config.defaultDeadline;

      if (params.type === TradeType.BUY) {
        // Buying tokens with CORE
        if (route.path[0].toLowerCase() === this.config.wcoreAddress.toLowerCase()) {
          // Swap CORE for tokens
          tx = await router.swapExactETHForTokens(
            params.minAmountOut || '0',
            route.path,
            await signer.getAddress(),
            deadline,
            {
              value: params.amount,
              gasLimit: route.estimatedGas,
              gasPrice: await this.calculateGasPrice()
            }
          );
        } else {
          // Token to token swap (need approval first)
          await this.ensureApproval(
            route.path[0],
            dexInfo.router,
            params.amount,
            signer
          );

          tx = await router.swapExactTokensForTokens(
            params.amount,
            params.minAmountOut || '0',
            route.path,
            await signer.getAddress(),
            deadline,
            {
              gasLimit: route.estimatedGas,
              gasPrice: await this.calculateGasPrice()
            }
          );
        }
      } else {
        // Selling tokens for CORE
        await this.ensureApproval(
          params.tokenAddress,
          dexInfo.router,
          params.amount,
          signer
        );

        tx = await router.swapExactTokensForETH(
          params.amount,
          params.minAmountOut || '0',
          route.path,
          await signer.getAddress(),
          deadline,
          {
            gasLimit: route.estimatedGas,
            gasPrice: await this.calculateGasPrice()
          }
        );
      }

      logger.info('DEX trade submitted', { 
        hash: await tx.hash,
        dex: dexInfo.name 
      });

      receipt = await tx.wait();
      
      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      // Parse actual amounts from events
      const { amountIn, amountOut } = this.parseSwapEvents(receipt);

      const result: TradeResult = {
        success: true,
        transactionHash: await tx.hash,
        tokenAddress: params.tokenAddress,
        type: params.type,
        phase: TradingPhase.DEX,
        amountIn: amountIn || params.amount,
        amountOut: amountOut || route.amountOut,
        executionPrice: route.executionPrice,
        priceImpact: route.priceImpact,
        route,
        gasUsed: receipt.gasUsed.toString(),
        gasCost: (receipt.gasUsed * receipt.gasPrice).toString(),
        timestamp: Date.now()
      };

      logger.info('DEX trade successful', { result });
      return result;

    } catch (error: any) {
      logger.error('DEX trade failed', { error: error.message });
      
      return {
        success: false,
        tokenAddress: params.tokenAddress,
        type: params.type,
        phase: TradingPhase.DEX,
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

  async getAllRoutes(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<Route[]> {
    const routes: Route[] = [];

    for (const dexInfo of this.dexes.values()) {
      try {
        const quote = await this.getQuoteFromDex(
          params,
          tokenState,
          dexInfo
        );

        if (quote) {
          const route = this.createRouteFromQuote(
            params,
            quote,
            dexInfo
          );
          routes.push(route);
        }
      } catch (error) {
        logger.debug(`Failed to get quote from ${dexInfo.name}`, { error });
      }
    }

    return routes;
  }

  async getMultiHopRoutes(
    params: TradeParams,
    tokenState: TokenState
  ): Promise<Route[]> {
    const routes: Route[] = [];
    
    // Common intermediate tokens for multi-hop
    const intermediateTokens = [
      this.config.wcoreAddress,
      // Add USDT, USDC addresses if available on Core
    ];

    for (const dexInfo of this.dexes.values()) {
      for (const intermediate of intermediateTokens) {
        if (intermediate === params.tokenAddress) continue;
        
        try {
          const path = params.type === TradeType.BUY
            ? [this.config.wcoreAddress, intermediate, params.tokenAddress]
            : [params.tokenAddress, intermediate, this.config.wcoreAddress];

          const quote = await this.getMultiHopQuote(
            params,
            path,
            dexInfo
          );

          if (quote) {
            const route: Route = {
              type: RouteType.MULTI_HOP,
              path,
              pools: await this.getPoolAddresses(path, dexInfo),
              dex: dexInfo.name,
              estimatedGas: '250000', // Higher gas for multi-hop
              priceImpact: quote.priceImpact,
              executionPrice: quote.executionPrice,
              amountIn: params.amount,
              amountOut: quote.amountOut,
              minimumAmountOut: params.minAmountOut || quote.amountOut,
              fee: quote.fee
            };
            routes.push(route);
          }
        } catch (error) {
          logger.debug(`Failed multi-hop quote from ${dexInfo.name}`, { error });
        }
      }
    }

    return routes;
  }

  private async getQuoteFromDex(
    params: TradeParams,
    tokenState: TokenState,
    dexInfo: DexInfo
  ): Promise<DexQuote | null> {
    const router = new ethers.Contract(
      dexInfo.router,
      ROUTER_ABI,
      this.provider
    );

    const path = params.type === TradeType.BUY
      ? [this.config.wcoreAddress, params.tokenAddress]
      : [params.tokenAddress, this.config.wcoreAddress];

    try {
      // Get pool address
      const factory = new ethers.Contract(
        dexInfo.factory,
        FACTORY_ABI,
        this.provider
      );
      
      const poolAddress = await factory.getPair(path[0], path[1]);
      if (poolAddress === ethers.ZeroAddress) {
        return null; // No pool exists
      }

      // Get reserves
      const pool = new ethers.Contract(poolAddress, PAIR_ABI, this.provider);
      const [reserve0, reserve1] = await pool.getReserves();
      const token0 = await pool.token0();
      
      const isToken0 = token0.toLowerCase() === path[0].toLowerCase();
      const reserveIn = isToken0 ? reserve0 : reserve1;
      const reserveOut = isToken0 ? reserve1 : reserve0;

      // Calculate output amount
      const amounts = await router.getAmountsOut(params.amount, path);
      const amountOut = amounts[amounts.length - 1].toString();

      // Calculate price impact
      const priceImpact = this.calculatePriceImpact(
        params.amount,
        amountOut,
        reserveIn.toString(),
        reserveOut.toString()
      );

      // Calculate execution price
      const executionPrice = new Decimal(params.amount)
        .div(amountOut)
        .toFixed(0);

      // Calculate fee
      const fee = new Decimal(params.amount)
        .mul(dexInfo.fee / 100)
        .toFixed(0);

      return {
        dex: dexInfo.name,
        poolAddress,
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        amountOut,
        priceImpact,
        executionPrice,
        fee,
        path
      };
    } catch (error) {
      return null;
    }
  }

  private async getMultiHopQuote(
    params: TradeParams,
    path: string[],
    dexInfo: DexInfo
  ): Promise<DexQuote | null> {
    const router = new ethers.Contract(
      dexInfo.router,
      ROUTER_ABI,
      this.provider
    );

    try {
      const amounts = await router.getAmountsOut(params.amount, path);
      const amountOut = amounts[amounts.length - 1].toString();

      // Calculate execution price
      const executionPrice = new Decimal(params.amount)
        .div(amountOut)
        .toFixed(0);

      // Estimate price impact (simplified for multi-hop)
      const priceImpact = 1; // Conservative estimate

      // Calculate total fees for multi-hop
      const fee = new Decimal(params.amount)
        .mul((dexInfo.fee / 100) * (path.length - 1))
        .toFixed(0);

      return {
        dex: dexInfo.name,
        poolAddress: '', // Multiple pools
        reserveIn: '0',
        reserveOut: '0',
        amountOut,
        priceImpact,
        executionPrice,
        fee,
        path
      };
    } catch (error) {
      return null;
    }
  }

  private createRouteFromQuote(
    params: TradeParams,
    quote: DexQuote,
    dexInfo: DexInfo
  ): Route {
    return {
      type: RouteType.DEX_V2,
      path: quote.path,
      pools: [quote.poolAddress],
      dex: dexInfo.name,
      estimatedGas: '200000',
      priceImpact: quote.priceImpact,
      executionPrice: quote.executionPrice,
      amountIn: params.amount,
      amountOut: quote.amountOut,
      minimumAmountOut: params.minAmountOut || quote.amountOut,
      fee: quote.fee
    };
  }

  private calculatePriceImpact(
    amountIn: string,
    amountOut: string,
    reserveIn: string,
    reserveOut: string
  ): number {
    const spotPrice = new Decimal(reserveOut).div(reserveIn);
    const executionPrice = new Decimal(amountOut).div(amountIn);
    
    const impact = spotPrice.sub(executionPrice)
      .div(spotPrice)
      .mul(100)
      .abs()
      .toNumber();
    
    return Math.min(impact, 100);
  }

  private async ensureApproval(
    tokenAddress: string,
    spender: string,
    amount: string,
    signer: ethers.Signer
  ): Promise<void> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const signerAddress = await signer.getAddress();
    
    const allowance = await token.allowance(signerAddress, spender);
    
    if (BigInt(allowance) < BigInt(amount)) {
      logger.info('Approving token spend', { token: tokenAddress, spender });
      const tx = await token.approve(spender, ethers.MaxUint256);
      await tx.wait();
    }
  }

  private async calculateGasPrice(): Promise<bigint> {
    const baseGasPrice = (await this.provider.getFeeData()).gasPrice || 0n;
    
    if (this.config.mevProtection.enabled) {
      const priorityFee = BigInt(this.config.mevProtection.maxPriorityFee);
      return baseGasPrice + priorityFee;
    }
    
    return baseGasPrice;
  }

  private async getPoolAddresses(
    path: string[],
    dexInfo: DexInfo
  ): Promise<string[]> {
    const pools: string[] = [];
    const factory = new ethers.Contract(
      dexInfo.factory,
      FACTORY_ABI,
      this.provider
    );

    for (let i = 0; i < path.length - 1; i++) {
      const pool = await factory.getPair(path[i], path[i + 1]);
      pools.push(pool);
    }

    return pools;
  }

  private parseSwapEvents(receipt: ethers.TransactionReceipt | null): { 
    amountIn?: string; 
    amountOut?: string 
  } {
    // Parse Swap events from receipt
    if (!receipt) return {};
    // This would need the actual event signatures from the DEX
    return {};
  }
}