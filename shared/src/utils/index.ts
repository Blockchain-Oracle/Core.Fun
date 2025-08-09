import { ethers } from 'ethers';

// Format utilities
export function formatAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatNumber(value: string | number, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(decimals)}B`;
  } else if (num >= 1e6) {
    return `${(num / 1e6).toFixed(decimals)}M`;
  } else if (num >= 1e3) {
    return `${(num / 1e3).toFixed(decimals)}K`;
  }
  
  return num.toFixed(decimals);
}

export function formatTokenAmount(
  amount: string,
  decimals: number = 18,
  displayDecimals: number = 4
): string {
  const formatted = ethers.formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  return formatNumber(num, displayDecimals);
}

export function parseTokenAmount(
  amount: string,
  decimals: number = 18
): string {
  return ethers.parseUnits(amount, decimals).toString();
}

// Validation utilities
export function isValidAddress(address: string): boolean {
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function isValidPrivateKey(key: string): boolean {
  try {
    new ethers.Wallet(key);
    return true;
  } catch {
    return false;
  }
}

// Network utilities
export function getNetwork(): 'mainnet' | 'testnet' {
  return (process.env.NETWORK as 'mainnet' | 'testnet') || 'mainnet';
}

export function getExplorerUrl(
  hashOrAddress: string,
  type: 'tx' | 'address' | 'token' = 'tx'
): string {
  const network = getNetwork();
  const baseUrl = network === 'testnet'
    ? 'https://scan.test.btcs.network'
    : 'https://scan.coredao.org';
  
  const path = type === 'token' ? 'address' : type;
  return `${baseUrl}/${path}/${hashOrAddress}`;
}

// Time utilities
export function getDeadline(minutes: number = 20): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

export function formatTimestamp(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
  return date.toLocaleString();
}

export function getTimeSince(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Safety utilities
export function calculateRugScore(analysis: any): number {
  let score = 0;
  
  // Contract risks (40 points)
  if (!analysis.contractVerified) score += 10;
  if (analysis.hasMintFunction) score += 15;
  if (analysis.hasBlacklist) score += 15;
  
  // Trading risks (30 points)
  if (analysis.isHoneypot) score += 30;
  else if (analysis.buyTax > 10) score += 10;
  else if (analysis.sellTax > 10) score += 10;
  
  // Ownership risks (20 points)
  if (analysis.ownershipConcentration > 50) score += 20;
  else if (analysis.ownershipConcentration > 20) score += 10;
  
  // Liquidity risks (10 points)
  if (analysis.liquidity < 1000) score += 10;
  else if (analysis.liquidity < 5000) score += 5;
  
  return Math.min(score, 100);
}

export function getRugScoreLabel(score: number): string {
  if (score <= 30) return 'Safe';
  if (score <= 60) return 'Warning';
  return 'Danger';
}

export function getRugScoreEmoji(score: number): string {
  if (score <= 30) return '✅';
  if (score <= 60) return '⚠️';
  return '🚨';
}

// Price utilities
export function calculatePriceImpact(
  amountIn: string,
  amountOut: string,
  spotPrice: number
): number {
  const expectedOut = parseFloat(amountIn) * spotPrice;
  const actualOut = parseFloat(amountOut);
  const impact = ((expectedOut - actualOut) / expectedOut) * 100;
  return Math.abs(impact);
}

export function calculateSlippage(
  expectedPrice: number,
  actualPrice: number
): number {
  return Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;
}

// Bonding curve utilities
export function calculateTokensFromBondingCurve(
  currentSold: string,
  ethIn: string
): string {
  const basePrice = 0.0001; // CORE per token
  const priceIncrement = 0.0001;
  const step = 10000;
  
  const sold = parseFloat(ethers.formatEther(currentSold));
  const ethAmount = parseFloat(ethers.formatEther(ethIn));
  
  const currentPrice = basePrice + (priceIncrement * Math.floor(sold / step));
  const tokensOut = ethAmount / currentPrice;
  
  return ethers.parseEther(tokensOut.toString()).toString();
}

export function calculateETHFromBondingCurve(
  currentSold: string,
  tokensIn: string
): string {
  const basePrice = 0.0001; // CORE per token
  const priceIncrement = 0.0001;
  const step = 10000;
  
  const sold = parseFloat(ethers.formatEther(currentSold));
  const tokens = parseFloat(ethers.formatEther(tokensIn));
  
  const newSold = sold - tokens;
  const currentPrice = basePrice + (priceIncrement * Math.floor(newSold / step));
  const ethOut = tokens * currentPrice;
  
  return ethers.parseEther(ethOut.toString()).toString();
}

// Error handling
export function parseError(error: any): string {
  if (error?.reason) return error.reason;
  if (error?.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}