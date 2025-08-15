import { TokenInfo, PriceHistory } from './api-client'
import type { Collection } from './types'

// Transform backend TokenInfo to frontend Collection format
export function transformTokenToCollection(token: TokenInfo): Collection {
  // Calculate age from createdAt timestamp
  const ageMs = Date.now() - (token.createdAt * 1000)
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60))
  const ageMins = Math.floor(ageMs / (1000 * 60))
  
  let age: string
  if (ageHours > 24) {
    age = `${Math.floor(ageHours / 24)}d`
  } else if (ageHours > 0) {
    age = `${ageHours}h`
  } else if (ageMins > 0) {
    age = `${ageMins}m`
  } else {
    age = 'now'
  }

  // Parse numeric values
  const price = parseFloat(token.currentPrice) || 0
  const marketCap = parseFloat(token.marketCap) || 0
  const volume = parseFloat(token.volume24h || '0')
  const availableSupply = parseFloat(token.availableSupply)
  const totalSupply = parseFloat(token.totalSupply)
  const reserveBalance = parseFloat(token.reserveBalance)
  
  // Calculate progress instead of liquidity ratio
  const progress = (availableSupply / 500000) * 100 // Progress to 500K graduation

  return {
    id: token.address,
    chain: "core" as const,
    name: token.name,
    symbol: token.symbol,
    age,
    price,
    change1h: 0, // Will be calculated from price history
    change24h: 0, // Will be calculated from price history
    progress,
    sold: availableSupply,
    raised: reserveBalance,
    holders: token.holders || 0,
    volume,
    marketCap,
    txs: token.transactions24h || 0,
    creator: token.owner || '',
    isLaunched: progress >= 100,
    rank: 0, // Will be calculated based on sorting
    volumeSeries: [], // Will be populated from historical data
    sparkline: [], // Will be populated from price history
    candles: [] // Will be populated from price history
  }
}

// Transform price history to sparkline data
export function transformPriceHistory(history: PriceHistory[]): number[] {
  if (!history || history.length === 0) {
    return []
  }
  
  // Sort by timestamp and extract prices
  return history
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(h => parseFloat(h.price))
}

// Transform price history to candle data
export function transformToCandles(
  history: PriceHistory[],
  intervalMinutes: number = 15
): { o: number; h: number; l: number; c: number }[] {
  if (!history || history.length === 0) {
    return []
  }

  // Group trades by interval
  const intervals = new Map<number, PriceHistory[]>()
  
  history.forEach(trade => {
    const intervalKey = Math.floor(trade.timestamp / (intervalMinutes * 60))
    if (!intervals.has(intervalKey)) {
      intervals.set(intervalKey, [])
    }
    intervals.get(intervalKey)!.push(trade)
  })

  // Convert to candles
  const candles = Array.from(intervals.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, trades]) => {
      const prices = trades.map(t => parseFloat(t.price))
      const o = prices[0]
      const c = prices[prices.length - 1]
      const h = Math.max(...prices)
      const l = Math.min(...prices)
      
      return { o, h, l, c }
    })

  return candles
}

// Calculate price changes from history
export function calculatePriceChanges(
  currentPrice: number,
  history: PriceHistory[]
): { change1h: number; change24h: number } {
  if (!history || history.length === 0) {
    return { change1h: 0, change24h: 0 }
  }

  const now = Date.now() / 1000
  const oneHourAgo = now - 3600
  const oneDayAgo = now - 86400

  // Find price 1 hour ago
  const price1h = history
    .filter(h => h.timestamp >= oneHourAgo)
    .sort((a, b) => a.timestamp - b.timestamp)[0]

  // Find price 24 hours ago
  const price24h = history
    .filter(h => h.timestamp >= oneDayAgo)
    .sort((a, b) => a.timestamp - b.timestamp)[0]

  const change1h = price1h 
    ? ((currentPrice - parseFloat(price1h.price)) / parseFloat(price1h.price)) * 100
    : 0

  const change24h = price24h
    ? ((currentPrice - parseFloat(price24h.price)) / parseFloat(price24h.price)) * 100
    : 0

  return { change1h, change24h }
}

// Transform volume data to series
export function transformVolumeData(
  history: PriceHistory[],
  intervals: number = 10
): number[] {
  if (!history || history.length === 0) {
    return Array(intervals).fill(0)
  }

  const now = Date.now() / 1000
  const intervalSize = 86400 / intervals // Day divided by intervals
  
  const volumes = Array(intervals).fill(0)
  
  history.forEach(trade => {
    const timeDiff = now - trade.timestamp
    const intervalIndex = Math.floor(timeDiff / intervalSize)
    
    if (intervalIndex >= 0 && intervalIndex < intervals) {
      const amount = parseFloat(trade.amount)
      const price = parseFloat(trade.price)
      volumes[intervals - 1 - intervalIndex] += amount * price
    }
  })

  return volumes
}

// Get token category based on status
export function getTokenCategory(token: TokenInfo): 'new' | 'graduating' | 'graduated' {
  if (token.isLaunched) {
    return 'graduated'
  }
  
  // Check if token is close to launching (e.g., high reserve balance)
  const reserveBalance = parseFloat(token.reserveBalance)
  const marketCap = parseFloat(token.marketCap)
  
  if (reserveBalance > 50 || marketCap > 100000) {
    return 'graduating'
  }
  
  return 'new'
}

// Format numbers for display
export function formatNumber(num: number | string | null | undefined): string {
  // Handle edge cases
  if (num === null || num === undefined) {
    return '0.00'
  }
  
  // Convert string to number if needed
  const numValue = typeof num === 'string' ? parseFloat(num) : num
  
  // Handle NaN or invalid numbers
  if (isNaN(numValue)) {
    return '0.00'
  }
  
  if (numValue >= 1_000_000_000) {
    return `${(numValue / 1_000_000_000).toFixed(1)}B`
  } else if (numValue >= 1_000_000) {
    return `${(numValue / 1_000_000).toFixed(1)}M`
  } else if (numValue >= 1_000) {
    return `${(numValue / 1_000).toFixed(1)}K`
  }
  return numValue.toFixed(2)
}

export function formatPrice(price: number | string | null | undefined): string {
  // Handle edge cases
  if (price === null || price === undefined) {
    return '0.00'
  }
  
  // Convert string to number if needed
  const priceValue = typeof price === 'string' ? parseFloat(price) : price
  
  // Handle NaN or invalid numbers
  if (isNaN(priceValue)) {
    return '0.00'
  }
  
  if (priceValue < 0.0001) {
    return priceValue.toExponential(2)
  } else if (priceValue < 0.01) {
    return priceValue.toFixed(6)
  } else if (priceValue < 1) {
    return priceValue.toFixed(4)
  }
  return priceValue.toFixed(2)
}

export function kFormatter(num: number): string {
  if (Math.abs(num) > 999999999) {
    return (Math.sign(num) * (Math.abs(num) / 1000000000)).toFixed(1) + 'B'
  } else if (Math.abs(num) > 999999) {
    return (Math.sign(num) * (Math.abs(num) / 1000000)).toFixed(1) + 'M'
  } else if (Math.abs(num) > 999) {
    return (Math.sign(num) * (Math.abs(num) / 1000)).toFixed(1) + 'K'
  } else {
    return Math.sign(num) * Math.abs(num) + ''
  }
}

export function formatPercentage(change: number | string | null | undefined): string {
  // Handle edge cases
  if (change === null || change === undefined) {
    return '+0.00%'
  }
  
  // Convert string to number if needed
  const changeValue = typeof change === 'string' ? parseFloat(change) : change
  
  // Handle NaN or invalid numbers
  if (isNaN(changeValue)) {
    return '+0.00%'
  }
  
  const sign = changeValue >= 0 ? '+' : ''
  return `${sign}${changeValue.toFixed(2)}%`
}

// Enhanced collection with real data
export async function enhanceCollectionWithRealData(
  token: TokenInfo,
  priceHistory?: PriceHistory[]
): Promise<Collection> {
  const base = transformTokenToCollection(token)
  
  if (priceHistory && priceHistory.length > 0) {
    const currentPrice = parseFloat(token.currentPrice)
    const { change1h, change24h } = calculatePriceChanges(currentPrice, priceHistory)
    
    return {
      ...base,
      change1h,
      change24h,
      sparkline: transformPriceHistory(priceHistory),
      candles: transformToCandles(priceHistory),
      volumeSeries: transformVolumeData(priceHistory),
      o: priceHistory[0] ? parseFloat(priceHistory[0].price) : currentPrice
    }
  }
  
  return base
}