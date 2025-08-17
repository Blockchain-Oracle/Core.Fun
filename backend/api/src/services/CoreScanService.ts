import fetch from 'node-fetch';
import { createLogger } from '@core-meme/shared';

interface TokenHolder {
  address: string;
  balance: string;
  share: number;
}

interface TokenTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  gasUsed: string;
  gasPrice: string;
}

interface ContractEvent {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  gasPrice: string;
  gasUsed: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

export class CoreScanService {
  private readonly apiKey = 'b89faa6a05ab42e980079484e47743c4'; // USING THE PROVIDED API KEY
  private readonly baseUrl: string;
  private logger;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.baseUrl = network === 'testnet' 
      ? 'https://api.test2.btcs.network/api'
      : 'https://openapi.coredao.org/api';
    this.logger = createLogger({ service: 'core-scan-service' });
  }

  /**
   * Get token holders with their balances
   */
  async getTokenHolders(tokenAddress: string): Promise<TokenHolder[]> {
    try {
      const url = `${this.baseUrl}?module=token&action=tokenholderlist&contractaddress=${tokenAddress}&page=1&offset=1000&apikey=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.status !== '1' || !data.result) {
        this.logger.warn(`No holders found for token ${tokenAddress}`);
        return [];
      }
      
      // Calculate total supply for share calculation
      const totalSupply = data.result.reduce((sum: bigint, holder: any) => 
        sum + BigInt(holder.TokenHolderQuantity || '0'), BigInt(0)
      );
      
      // Map and calculate shares
      return data.result.map((holder: any) => ({
        address: holder.TokenHolderAddress,
        balance: holder.TokenHolderQuantity,
        share: totalSupply > 0 
          ? (Number(BigInt(holder.TokenHolderQuantity) * BigInt(10000) / totalSupply) / 100)
          : 0
      }));
      
    } catch (error) {
      this.logger.error(`Error fetching token holders: ${error}`);
      return [];
    }
  }

  /**
   * Get token transactions
   */
  async getTokenTransactions(
    tokenAddress: string,
    startBlock: number = 0,
    endBlock: number = 99999999
  ): Promise<TokenTransaction[]> {
    try {
      const url = `${this.baseUrl}?module=account&action=tokentx&contractaddress=${tokenAddress}&startblock=${startBlock}&endblock=${endBlock}&sort=desc&apikey=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.status !== '1' || !data.result) {
        this.logger.warn(`No transactions found for token ${tokenAddress}`);
        return [];
      }
      
      return data.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        timestamp: Number(tx.timeStamp),
        gasUsed: tx.gasUsed,
        gasPrice: tx.gasPrice,
      }));
      
    } catch (error) {
      this.logger.error(`Error fetching token transactions: ${error}`);
      return [];
    }
  }

  /**
   * Get contract events (for TokenCreated, TokenPurchased, etc.)
   */
  async getContractEvents(
    contractAddress: string,
    fromBlock: number = 0,
    toBlock: number = 99999999,
    topic0?: string // Event signature hash
  ): Promise<ContractEvent[]> {
    try {
      let url = `${this.baseUrl}?module=logs&action=getLogs&address=${contractAddress}&fromBlock=${fromBlock}&toBlock=${toBlock}&apikey=${this.apiKey}`;
      
      if (topic0) {
        url += `&topic0=${topic0}`;
      }
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.status !== '1' || !data.result) {
        this.logger.warn(`No events found for contract ${contractAddress}`);
        return [];
      }
      
      return data.result;
      
    } catch (error) {
      this.logger.error(`Error fetching contract events: ${error}`);
      return [];
    }
  }

  /**
   * Get token analytics (holders, transactions, volume)
   */
  async getTokenAnalytics(tokenAddress: string) {
    try {
      // Get holders
      const holders = await this.getTokenHolders(tokenAddress);
      
      // Get recent transactions
      const transactions = await this.getTokenTransactions(tokenAddress);
      
      // Calculate 24h metrics
      const now = Date.now() / 1000;
      const oneDayAgo = now - 86400;
      
      const transactions24h = transactions.filter(tx => tx.timestamp >= oneDayAgo);
      
      // Calculate volume (sum of all transfer values)
      const volume24h = transactions24h.reduce((sum, tx) => {
        return sum + BigInt(tx.value || '0');
      }, BigInt(0));
      
      // Get unique traders
      const uniqueTraders = new Set([
        ...transactions24h.map(tx => tx.from),
        ...transactions24h.map(tx => tx.to)
      ]);
      
      // Calculate holder distribution
      const holderDistribution = this.calculateHolderDistribution(holders);
      
      return {
        holders: holders.length,
        transactions24h: transactions24h.length,
        volume24h: volume24h.toString(),
        uniqueTraders24h: uniqueTraders.size,
        holderDistribution,
        topHolders: holders.slice(0, 10), // Top 10 holders
      };
      
    } catch (error) {
      this.logger.error(`Error getting token analytics: ${error}`);
      return {
        holders: 0,
        transactions24h: 0,
        volume24h: '0',
        uniqueTraders24h: 0,
        holderDistribution: {},
        topHolders: [],
      };
    }
  }

  /**
   * Calculate holder distribution (whales, dolphins, fish)
   */
  private calculateHolderDistribution(holders: TokenHolder[]) {
    const distribution = {
      whales: 0,    // > 1% supply
      dolphins: 0,  // 0.1% - 1%
      fish: 0,      // < 0.1%
    };
    
    holders.forEach(holder => {
      if (holder.share > 1) {
        distribution.whales++;
      } else if (holder.share > 0.1) {
        distribution.dolphins++;
      } else {
        distribution.fish++;
      }
    });
    
    return distribution;
  }

  /**
   * Get price history from trading events
   */
  async getPriceHistory(factoryAddress: string, tokenAddress: string) {
    try {
      // Event signatures for TokenPurchased and TokenSold
      const purchaseEventSig = '0x...'; // Would need actual event signature
      const sellEventSig = '0x...';     // Would need actual event signature
      
      // Get purchase events
      const purchaseEvents = await this.getContractEvents(
        factoryAddress,
        0,
        99999999,
        purchaseEventSig
      );
      
      // Get sell events
      const sellEvents = await this.getContractEvents(
        factoryAddress,
        0,
        99999999,
        sellEventSig
      );
      
      // Combine and sort by timestamp
      const allEvents = [...purchaseEvents, ...sellEvents]
        .sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp));
      
      // Build price history
      const priceHistory = allEvents.map(event => {
        // Parse event data to extract price
        // This would need proper event decoding
        return {
          timestamp: Number(event.timeStamp),
          price: 0, // Would calculate from event data
          volume: 0, // Would calculate from event data
          type: 'buy' as 'buy' | 'sell',
        };
      });
      
      return priceHistory;
      
    } catch (error) {
      this.logger.error(`Error getting price history: ${error}`);
      return [];
    }
  }

  /**
   * Verify contract source code
   */
  async isContractVerified(contractAddress: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      return data.status === '1' && data.result !== 'Contract source code not verified';
      
    } catch (error) {
      this.logger.error(`Error checking contract verification: ${error}`);
      return false;
    }
  }

  /**
   * Get block number by timestamp
   */
  async getBlockByTimestamp(timestamp: number, closest: 'before' | 'after' = 'before'): Promise<number> {
    try {
      const url = `${this.baseUrl}?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=${closest}&apikey=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.status === '1' && data.result) {
        return Number(data.result);
      }
      
      return 0;
      
    } catch (error) {
      this.logger.error(`Error getting block by timestamp: ${error}`);
      return 0;
    }
  }

  /**
   * Get CORE price in USD
   */
  async getCorePrice(): Promise<number> {
    try {
      // Try CoinGecko first for accurate price
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const geckoResponse = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd',
        {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CoreMemePlatform/1.0'
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (geckoResponse.ok) {
        const geckoData = await geckoResponse.json();
        const price = geckoData?.coredaoorg?.usd;
        if (typeof price === 'number' && price > 0) {
          this.logger.info(`Fetched CORE price from CoinGecko: $${price}`);
          return price;
        }
      }
      
      // Fallback to CoreScan API
      const url = `${this.baseUrl}?module=stats&action=coreprice&apikey=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (data.status === '1' && data.result) {
        return Number(data.result.coreusd || 0.50); // More realistic default
      }
      
      return 0.50; // Default to more realistic price
      
    } catch (error) {
      this.logger.error(`Error getting CORE price: ${error}`);
      return 0.50; // More realistic default price
    }
  }
}