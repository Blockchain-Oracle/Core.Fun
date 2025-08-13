import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

interface TokenCreationParams {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

interface TradeQuote {
  tokensOut: string;
  pricePerToken: number;
  priceImpact: number;
  fee: string;
  minReceived: string;
}

interface Trade {
  tokenAddress: string;
  type: 'buy' | 'sell';
  amountCore: string;
  amountToken: string;
  price: number;
  txHash: string;
  status: string;
  timestamp: number;
}

interface Token {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  creator: string;
  sold: string;
  raised: string;
  isOpen: boolean;
  isLaunched: boolean;
  progress: number;
  currentPrice: string;
  marketCap: string;
}

export class TradingService extends EventEmitter {
  private api: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string = process.env.REACT_APP_API_URL || 'http://localhost:3001') {
    super();
    
    this.api = axios.create({
      baseURL: `${baseURL}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.api.interceptors.request.use((config) => {
      if (this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.emit('auth-error', error);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string) {
    this.authToken = token;
  }

  /**
   * Clear authentication
   */
  clearAuth() {
    this.authToken = null;
  }

  /**
   * Create a new token
   */
  async createToken(params: TokenCreationParams): Promise<{
    success: boolean;
    tokenAddress?: string;
    txHash?: string;
    error?: string;
  }> {
    try {
      const response = await this.api.post('/trading/create-token', params);
      
      if (response.data.success) {
        this.emit('token-created', {
          address: response.data.tokenAddress,
          txHash: response.data.txHash,
          ...params
        });
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Failed to create token:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to create token'
      };
    }
  }

  /**
   * Buy tokens
   */
  async buyToken(
    tokenAddress: string,
    amountCore: string,
    minTokens?: string
  ): Promise<{
    success: boolean;
    txHash?: string;
    tokensReceived?: string;
    error?: string;
  }> {
    try {
      const response = await this.api.post('/trading/buy', {
        tokenAddress,
        amountCore,
        minTokens
      });
      
      if (response.data.success) {
        this.emit('trade-executed', {
          type: 'buy',
          tokenAddress,
          amountCore,
          tokensReceived: response.data.tokensReceived,
          txHash: response.data.txHash
        });
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Failed to buy token:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to buy token'
      };
    }
  }

  /**
   * Sell tokens
   */
  async sellToken(
    tokenAddress: string,
    tokenAmount: string,
    minCore?: string
  ): Promise<{
    success: boolean;
    txHash?: string;
    coreReceived?: string;
    error?: string;
  }> {
    try {
      const response = await this.api.post('/trading/sell', {
        tokenAddress,
        tokenAmount,
        minCore
      });
      
      if (response.data.success) {
        this.emit('trade-executed', {
          type: 'sell',
          tokenAddress,
          tokenAmount,
          coreReceived: response.data.coreReceived,
          txHash: response.data.txHash
        });
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Failed to sell token:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to sell token'
      };
    }
  }

  /**
   * Get buy quote
   */
  async getBuyQuote(
    tokenAddress: string,
    amountCore: string
  ): Promise<TradeQuote | null> {
    try {
      const response = await this.api.get('/trading/quote', {
        params: {
          tokenAddress,
          amountCore,
          type: 'buy'
        }
      });
      
      return response.data.success ? response.data.quote : null;
    } catch (error) {
      console.error('Failed to get buy quote:', error);
      return null;
    }
  }

  /**
   * Get sell quote
   */
  async getSellQuote(
    tokenAddress: string,
    tokenAmount: string
  ): Promise<TradeQuote | null> {
    try {
      const response = await this.api.get('/trading/quote', {
        params: {
          tokenAddress,
          tokenAmount,
          type: 'sell'
        }
      });
      
      return response.data.success ? response.data.quote : null;
    } catch (error) {
      console.error('Failed to get sell quote:', error);
      return null;
    }
  }

  /**
   * Get user's trading history
   */
  async getTradingHistory(
    limit: number = 20,
    offset: number = 0
  ): Promise<Trade[]> {
    try {
      const response = await this.api.get('/trading/history', {
        params: { limit, offset }
      });
      
      return response.data.success ? response.data.trades : [];
    } catch (error) {
      console.error('Failed to get trading history:', error);
      return [];
    }
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenAddress: string): Promise<Token | null> {
    try {
      const response = await this.api.get(`/tokens/${tokenAddress}`);
      return response.data.success ? response.data.token : null;
    } catch (error) {
      console.error('Failed to get token info:', error);
      return null;
    }
  }

  /**
   * Get all tokens
   */
  async getAllTokens(
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'createdAt',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<{
    tokens: Token[];
    total: number;
    page: number;
    pages: number;
  }> {
    try {
      const response = await this.api.get('/tokens', {
        params: { page, limit, sortBy, order }
      });
      
      if (response.data.success) {
        return response.data;
      }
      
      return {
        tokens: [],
        total: 0,
        page: 1,
        pages: 0
      };
    } catch (error) {
      console.error('Failed to get tokens:', error);
      return {
        tokens: [],
        total: 0,
        page: 1,
        pages: 0
      };
    }
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(): Promise<Token[]> {
    try {
      const response = await this.api.get('/tokens/trending');
      return response.data.success ? response.data.tokens : [];
    } catch (error) {
      console.error('Failed to get trending tokens:', error);
      return [];
    }
  }

  /**
   * Get user's created tokens
   */
  async getUserTokens(): Promise<Token[]> {
    try {
      const response = await this.api.get('/trading/my-tokens');
      return response.data.success ? response.data.tokens : [];
    } catch (error) {
      console.error('Failed to get user tokens:', error);
      return [];
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string): Promise<{
    status: 'pending' | 'success' | 'failed';
    confirmations: number;
    blockNumber?: number;
  }> {
    try {
      const response = await this.api.get(`/trading/tx/${txHash}`);
      
      if (response.data.success) {
        return response.data;
      }
      
      return {
        status: 'pending',
        confirmations: 0
      };
    } catch (error) {
      console.error('Failed to get transaction status:', error);
      return {
        status: 'pending',
        confirmations: 0
      };
    }
  }

  /**
   * Monitor transaction until confirmed
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1,
    pollInterval: number = 3000,
    maxAttempts: number = 60
  ): Promise<boolean> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const status = await this.getTransactionStatus(txHash);
      
      if (status.status === 'success' && status.confirmations >= confirmations) {
        this.emit('transaction-confirmed', { txHash, confirmations: status.confirmations });
        return true;
      }
      
      if (status.status === 'failed') {
        this.emit('transaction-failed', { txHash });
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;
    }
    
    this.emit('transaction-timeout', { txHash });
    return false;
  }

  /**
   * Estimate gas for token creation
   */
  async estimateCreateTokenGas(params: TokenCreationParams): Promise<{
    gasEstimate: string;
    gasPrice: string;
    totalCost: string;
  } | null> {
    try {
      const response = await this.api.post('/trading/estimate-gas', {
        action: 'createToken',
        params
      });
      
      return response.data.success ? response.data : null;
    } catch (error) {
      console.error('Failed to estimate gas:', error);
      return null;
    }
  }

  /**
   * Search tokens
   */
  async searchTokens(query: string): Promise<Token[]> {
    try {
      const response = await this.api.get('/tokens/search', {
        params: { q: query }
      });
      
      return response.data.success ? response.data.tokens : [];
    } catch (error) {
      console.error('Failed to search tokens:', error);
      return [];
    }
  }
}

// Singleton instance
let tradingServiceInstance: TradingService | null = null;

export function getTradingService(): TradingService {
  if (!tradingServiceInstance) {
    tradingServiceInstance = new TradingService();
  }
  return tradingServiceInstance;
}

export default TradingService;