import { createLogger } from '../logger';

export interface PriceData {
  usd: number;
  lastUpdated: number;
  source: 'coingecko' | 'fallback';
}

export interface CoinGeckoResponse {
  coredaoorg: {
    usd: number;
  };
}

export class PriceService {
  private logger = createLogger({ service: 'price-service' });
  private cache: Map<string, PriceData> = new Map();
  private readonly CACHE_DURATION = 60 * 1000; // 1 minute cache
  private readonly REQUEST_TIMEOUT = 5000; // 5 second timeout
  private readonly FALLBACK_PRICE = 0.50; // Fallback CORE price
  private readonly API_BASE_URL = 'https://api.coingecko.com/api/v3';
  
  // Rate limiting
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 20 * 1000; // 20 seconds between requests (CoinGecko free tier limit)

  /**
   * Get CORE token price in USD from CoinGecko API
   * Features:
   * - Caching to reduce API calls
   * - Rate limiting to respect CoinGecko limits
   * - Graceful fallback on failures
   * - Request timeout handling
   */
  async getCorePrice(): Promise<PriceData> {
    const cacheKey = 'core-usd';
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated < this.CACHE_DURATION) {
      this.logger.debug('Returning cached CORE price', { price: cached.usd, age: Date.now() - cached.lastUpdated });
      return cached;
    }

    // Rate limiting - respect CoinGecko's free tier limits
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      this.logger.debug('Rate limited, returning cached or fallback price');
      return cached || {
        usd: this.FALLBACK_PRICE,
        lastUpdated: Date.now(),
        source: 'fallback'
      };
    }

    try {
      this.lastRequestTime = Date.now();
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const response = await fetch(
        `${this.API_BASE_URL}/simple/price?ids=coredaoorg&vs_currencies=usd`,
        {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CoreMemeplatform/1.0'
          }
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as unknown as CoinGeckoResponse;
      
      if (!data.coredaoorg?.usd || typeof data.coredaoorg.usd !== 'number') {
        throw new Error('Invalid response format from CoinGecko API');
      }

      const priceData: PriceData = {
        usd: data.coredaoorg.usd,
        lastUpdated: Date.now(),
        source: 'coingecko'
      };

      // Cache the result
      this.cache.set(cacheKey, priceData);
      
      this.logger.info('Successfully fetched CORE price from CoinGecko', { 
        price: priceData.usd,
        source: 'coingecko'
      });

      return priceData;

    } catch (error) {
      this.logger.warn('Failed to fetch CORE price from CoinGecko, using fallback', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackPrice: this.FALLBACK_PRICE
      });

      // Return cached data if available, otherwise fallback
      const fallbackData: PriceData = {
        usd: cached?.usd || this.FALLBACK_PRICE,
        lastUpdated: Date.now(),
        source: 'fallback'
      };

      return fallbackData;
    }
  }

  /**
   * Get multiple coin prices (for future use)
   * @param coinIds Array of CoinGecko coin IDs
   * @param vsCurrencies Array of currencies (default: ['usd'])
   */
  async getMultiplePrices(
    coinIds: string[], 
    vsCurrencies: string[] = ['usd']
  ): Promise<{ [coinId: string]: { [currency: string]: number } }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const idsParam = coinIds.join(',');
      const currenciesParam = vsCurrencies.join(',');
      
      const response = await fetch(
        `${this.API_BASE_URL}/simple/price?ids=${idsParam}&vs_currencies=${currenciesParam}`,
        {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CoreMemeplatform/1.0'
          }
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as { [coinId: string]: { [currency: string]: number } };

    } catch (error) {
      this.logger.error('Failed to fetch multiple prices from CoinGecko', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        coinIds,
        vsCurrencies
      });
      throw error;
    }
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Price cache cleared');
  }

  /**
   * Get cached price without making new request
   */
  getCachedPrice(coinId: string = 'core-usd'): PriceData | null {
    return this.cache.get(coinId) || null;
  }

  /**
   * Check if cache is valid
   */
  isCacheValid(coinId: string = 'core-usd'): boolean {
    const cached = this.cache.get(coinId);
    return cached ? Date.now() - cached.lastUpdated < this.CACHE_DURATION : false;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ key: string; age: number; price: number }> } {
    const now = Date.now();
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        age: now - value.lastUpdated,
        price: value.usd
      }))
    };
  }
}

// Singleton instance for shared use
export const priceService = new PriceService();

// Re-export for backward compatibility
export default PriceService;