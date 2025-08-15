"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useTokenStore, useTradingStore } from "@/lib/stores"
import { kFormatter } from "@/lib/utils-format"
import { 
  Star, 
  TrendingUp, 
  TrendingDown,
  Check,
  Twitter,
  Globe,
  Send,
  MoreHorizontal,
  Zap,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TokenData } from "@/lib/api"
import { useRouter } from "next/navigation"

export default function ExploreTable() {
  const { 
    allTokens,
    isLoading,
    fetchTokens,
    updateFilters,
    filters
  } = useTokenStore()
  
  const {
    favoriteTokens,
    addFavorite,
    removeFavorite,
    isFavorite
  } = useTradingStore()

  const [sortBy, setSortBy] = useState<string>(filters.sortBy)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(filters.sortOrder)
  const router = useRouter()

  useEffect(() => {
    if (allTokens.length === 0) {
      fetchTokens({ reset: true })
    }
  }, [])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      setSortOrder(newOrder)
      updateFilters({ sortBy: field as any, sortOrder: newOrder })
    } else {
      setSortBy(field)
      setSortOrder('desc')
      updateFilters({ sortBy: field as any, sortOrder: 'desc' })
    }
  }

  const toggleFavorite = (address: string) => {
    if (isFavorite(address)) {
      removeFavorite(address)
    } else {
      addFavorite(address)
    }
  }

  if (isLoading && allTokens.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-400" />
          <p className="mt-4 text-white/60">Loading tokens...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-black">
      {/* Table Header */}
      <div className="sticky top-0 z-10 grid grid-cols-[40px_1fr_100px_100px_100px_140px_100px_100px_80px_100px] items-center gap-2 border-b border-white/10 bg-black px-4 py-3 text-xs text-white/50">
        <div></div>
        <div className="flex items-center gap-1">
          Token
          <button 
            className="text-white/30 hover:text-white/50"
            onClick={() => handleSort('name')}
          >
            ↕
          </button>
        </div>
        <div className="flex items-center justify-end gap-1">
          Price
          <button 
            className="text-white/30 hover:text-white/50"
            onClick={() => handleSort('price')}
          >
            ↕
          </button>
        </div>
        <div className="flex items-center justify-end gap-1">
          24h%
          <button 
            className="text-white/30 hover:text-white/50"
            onClick={() => handleSort('change24h')}
          >
            ↕
          </button>
        </div>
        <div className="flex items-center justify-end gap-1">
          Volume
          <button 
            className="text-white/30 hover:text-white/50"
            onClick={() => handleSort('volume')}
          >
            ↕
          </button>
        </div>
        <div className="flex items-center justify-center">Bonding</div>
        <div className="flex items-center justify-end gap-1">
          Market Cap
          <button 
            className="text-white/30 hover:text-white/50"
            onClick={() => handleSort('marketCap')}
          >
            ↕
          </button>
        </div>
        <div className="flex items-center justify-center gap-1">
          Holders
          <button 
            className="text-white/30 hover:text-white/50"
            onClick={() => handleSort('holders')}
          >
            ↕
          </button>
        </div>
        <div className="flex items-center justify-center">Socials</div>
        <div className="flex items-center justify-center">Actions</div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-white/5">
        {allTokens.map((token) => (
          <div 
            key={token.address}
            className="grid grid-cols-[40px_1fr_100px_100px_100px_140px_100px_100px_80px_100px] items-center gap-2 px-4 py-3 hover:bg-white/5 transition-colors"
          >
            {/* Favorite */}
            <button
              onClick={() => toggleFavorite(token.address)}
              className="text-white/30 hover:text-yellow-400 transition-colors"
            >
              <Star 
                className={`h-4 w-4 ${isFavorite(token.address) ? 'fill-yellow-400 text-yellow-400' : ''}`} 
              />
            </button>

            {/* Token Info - WITH ACTUAL IMAGE */}
            <div className="flex items-center gap-2">
              <div className="relative">
                {token.image_url ? (
                  <img
                    src={token.image_url}
                    alt={token.name}
                    width={32}
                    height={32}
                    className="rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const fallback = e.currentTarget.parentElement?.querySelector('.fallback-avatar');
                      if (fallback) (fallback as HTMLElement).style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`fallback-avatar w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 items-center justify-center text-xs font-bold text-primary ${token.image_url ? 'hidden' : 'flex'}`}>
                  {token.symbol?.slice(0, 2)}
                </div>
                {token.isVerified && (
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-orange-500 border border-black flex items-center justify-center">
                    <Check className="h-2 w-2 text-white" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-white truncate">{token.name}</span>
                  <span className="text-xs text-white/50">${token.symbol}</span>
                </div>
                <div className="text-[10px] text-white/40">
                  {token.creator.slice(0, 6)}...{token.creator.slice(-4)}
                </div>
              </div>
            </div>

            {/* Price */}
            <div className="text-right text-sm text-white">
              ${token.price ? token.price.toFixed(6) : '0.00'}
            </div>

            {/* 24h Change */}
            <div className={`text-right text-sm flex items-center justify-end gap-1 ${
              (token.priceChange24h || 0) >= 0 ? 'text-orange-400' : 'text-red-400'
            }`}>
              {(token.priceChange24h || 0) >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(token.priceChange24h || 0).toFixed(2)}%
            </div>

            {/* Volume */}
            <div className="text-right text-sm text-white">
              ${kFormatter(token.volume24h || 0)}
            </div>

            {/* Bonding Progress - ACTUAL PROGRESS */}
            <div className="px-2">
              {token.status === 'CREATED' ? (
                <div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
                      style={{ width: `${Math.min(token.graduationPercentage || ((token.raisedAmount || token.liquidity || 0) / (token.targetAmount || 3)) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">
                    {(token.graduationPercentage || ((token.raisedAmount || token.liquidity || 0) / (token.targetAmount || 3)) * 100).toFixed(1)}%
                  </div>
                </div>
              ) : (
                <div className="text-xs text-yellow-400">Graduated</div>
              )}
            </div>

            {/* Market Cap */}
            <div className="text-right text-sm text-white">
              ${kFormatter(token.marketCap || 0)}
            </div>

            {/* Holders */}
            <div className="text-center text-sm text-white">
              {kFormatter(token.holders || 0)}
            </div>

            {/* Socials */}
            <div className="flex items-center justify-center gap-1">
              {token.twitter && (
                <a href={token.twitter} target="_blank" rel="noopener noreferrer">
                  <Twitter className="h-3 w-3 text-white/30 hover:text-white" />
                </a>
              )}
              {token.telegram && (
                <a href={token.telegram} target="_blank" rel="noopener noreferrer">
                  <Send className="h-3 w-3 text-white/30 hover:text-white" />
                </a>
              )}
              {token.website && (
                <a href={token.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-3 w-3 text-white/30 hover:text-white" />
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                onClick={() => router.push(`/token/${token.address}?action=buy`)}
              >
                Buy
              </Button>
              <button className="text-white/30 hover:text-white/50">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}