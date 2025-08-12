import { ethers } from 'ethers';
import Redis from 'ioredis';
import { createLogger } from '@core-meme/shared';

interface Trade {
  txHash: string;
  tokenAddress: string;
  tokenSymbol: string;
  trader: string;
  type: 'buy' | 'sell';
  amountToken: string;
  amountCore: string;
  price: number;
  timestamp: number;
  blockNumber: number;
  dex: string;
}

// Router ABI for monitoring swaps
const ROUTER_ABI = [
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
];

// DEX Router addresses - Using only IcecreamSwap
const DEX_ROUTERS = {
  IcecreamSwap: '0xBb5e1777A331ED93E07cF043363e48d320eb96c4', // Correct IcecreamSwap V2 Router
};

export class TradeStreamHandler {
  private provider: ethers.JsonRpcProvider;
  private redis: Redis;
  private subscriptions: Map<string, Set<string>> = new Map(); // clientId -> token addresses
  private routerContracts: Map<string, ethers.Contract> = new Map();
  private isMonitoring = false;
  private logger = createLogger({ service: 'websocket-trades' });

  constructor(provider: ethers.JsonRpcProvider, redis: Redis) {
    this.provider = provider;
    this.redis = redis;
    
    // Initialize router contracts
    Object.entries(DEX_ROUTERS).forEach(([name, address]) => {
      const contract = new ethers.Contract(address, ROUTER_ABI, provider);
      this.routerContracts.set(name, contract);
    });
  }

  async start(): Promise<void> {
    this.logger.info('Starting trade stream handler');
    
    if (!this.isMonitoring) {
      this.startMonitoring();
      this.isMonitoring = true;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping trade stream handler');
    
    // Remove all event listeners
    this.routerContracts.forEach(contract => {
      contract.removeAllListeners();
    });
    
    this.isMonitoring = false;
  }

  async subscribe(clientId: string, params: any): Promise<void> {
    const { tokens } = params;
    
    if (!Array.isArray(tokens)) {
      throw new Error('Invalid subscription params: tokens must be an array');
    }
    
    // Store subscription
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    
    tokens.forEach((token: string) => {
      this.subscriptions.get(clientId)!.add(token.toLowerCase());
    });
  }

  async unsubscribe(clientId: string): Promise<void> {
    this.subscriptions.delete(clientId);
  }

  private startMonitoring(): void {
    // Monitor each DEX router for swaps
    this.routerContracts.forEach((contract, dexName) => {
      contract.on('Swap', async (...args) => {
        try {
          const event = args[args.length - 1];
          await this.handleSwap(dexName, event);
        } catch (error) {
          this.logger.error(`Error handling swap on ${dexName}:`, error);
        }
      });
      
      this.logger.info(`Monitoring ${dexName} router for trades`);
    });
  }

  private async handleSwap(dexName: string, event: any): Promise<void> {
    try {
      // Parse the swap event
      const tx = await event.getTransaction();
      const receipt = await event.getTransactionReceipt();
      const block = await event.getBlock();
      
      // Parse transaction to determine token and amounts
      const tradeData = await this.parseSwapTransaction(tx, receipt, dexName);
      
      if (!tradeData) return;
      
      const trade: Trade = {
        txHash: tradeData.txHash!,
        tokenAddress: tradeData.tokenAddress!,
        tokenSymbol: tradeData.tokenSymbol!,
        trader: tradeData.trader!,
        type: tradeData.type!,
        amountToken: tradeData.amountToken!,
        amountCore: tradeData.amountCore!,
        price: tradeData.price!,
        timestamp: block.timestamp * 1000,
        blockNumber: block.number,
        dex: dexName,
      };
      
      // Broadcast to subscribers of this token
      this.broadcastTrade(trade);
      
    } catch (error) {
      this.logger.error('Error processing swap:', error);
    }
  }

  private async parseSwapTransaction(
    tx: any,
    receipt: any,
    _dexName: string
  ): Promise<Partial<Trade> | null> {
    try {
      // Parse actual transaction data from DEX router calls
      const tradeData = await this.parseTradeTransaction(tx, receipt);
      if (!tradeData) {
        return null; // Not a valid trade transaction
      }
      
      // Calculate price from amounts
      let price = 0;
      if (tradeData.amountToken && tradeData.amountCore) {
        const tokenAmount = parseFloat(tradeData.amountToken);
        const coreAmount = parseFloat(tradeData.amountCore);
        if (tokenAmount > 0) {
          price = coreAmount / tokenAmount;
        }
      }
      
      return {
        txHash: tx.hash,
        tokenAddress: tradeData.tokenAddress,
        tokenSymbol: tradeData.tokenSymbol || 'UNKNOWN',
        trader: tx.from,
        type: tradeData.type as 'buy' | 'sell',
        amountToken: tradeData.amountToken || '0',
        amountCore: tradeData.amountCore || '0',
        price,
      };
    } catch (error) {
      this.logger.error('Error parsing swap transaction:', error);
      return null;
    }
  }

  private broadcastTrade(trade: Trade): void {
    // Find all clients subscribed to this token
    const interestedClients: string[] = [];
    
    this.subscriptions.forEach((tokens, clientId) => {
      if (tokens.has(trade.tokenAddress.toLowerCase()) || tokens.has('*')) {
        interestedClients.push(clientId);
      }
    });
    
    // Broadcast to interested clients
    interestedClients.forEach(clientId => {
      this.redis.publish('websocket:trade', JSON.stringify({
        clientId,
        trades: [trade],
      }));
    });
  }

  private async parseTradeTransaction(tx: any, receipt: any): Promise<any> {
    try {
      // Parse transaction input data to identify the method and parameters
      const input = tx.input || tx.data;
      if (!input || input === '0x') return null;

      // Common DEX router and MemeFactory method signatures
      const methodSignatures: { [key: string]: string } = {
        '0x7ff36ab5': 'swapExactETHForTokens',
        '0xfb3bdb41': 'swapETHForExactTokens',
        '0x18cbafe5': 'swapExactTokensForETH',
        '0x4a25d94a': 'swapTokensForExactETH',
        '0x38ed1739': 'swapExactTokensForTokens',
        // MemeFactory methods
        '0xa6f2ae3a': 'buyToken',
        '0xe4849b32': 'sellToken',
      };

      const methodId = input.slice(0, 10).toLowerCase();
      const method = methodSignatures[methodId];

      if (!method) return null;

      // Determine trade type from method
      const isBuy = method.includes('ETHForTokens') || method === 'buyToken';
      const isSell = method.includes('TokensForETH') || method === 'sellToken';

      // Parse logs to get actual amounts from Transfer events
      let tokenAddress: string | undefined;
      let amountToken = '0';
      let amountCore = ethers.formatEther(tx.value || '0');
      
      // Look for Transfer events in logs
      for (const log of receipt.logs) {
        // ERC20 Transfer event signature
        if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          // This is a token transfer
          if (!tokenAddress && log.address !== '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f') { // Not WCORE
            tokenAddress = log.address;
            // Decode transfer amount (third topic or data)
            if (log.data && log.data.length >= 66) {
              amountToken = ethers.formatEther('0x' + log.data.slice(2, 66));
            }
          }
        }
      }

      if (!tokenAddress) {
        // Try to extract from input data for MemeFactory calls
        if (method === 'buyToken' || method === 'sellToken') {
          // First parameter is token address
          tokenAddress = '0x' + input.slice(34, 74);
        } else {
          // For DEX swaps, extract from path parameter
          return null; // Skip complex DEX decoding for now
        }
      }

      // Fetch token symbol from contract
      let tokenSymbol = 'UNKNOWN';
      try {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function symbol() view returns (string)'],
          this.provider
        );
        tokenSymbol = await tokenContract.symbol();
      } catch (e) {
        // Ignore symbol fetch errors
      }

      return {
        method,
        tokenAddress,
        amountToken,
        amountCore,
        tokenSymbol,
        type: isBuy ? 'buy' : (isSell ? 'sell' : 'swap'),
      };
    } catch (error) {
      this.logger.error('Error parsing trade transaction:', error);
      return null;
    }
  }
}