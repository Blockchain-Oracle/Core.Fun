"use client"

import { kFormatter } from "@/lib/utils-format"
import type { TokenData } from "@/lib/api"
import { useTradingStore } from "@/lib/stores"
import { Star } from "lucide-react"

export default function ExploreRow({ token }: { token: TokenData }) {
  const { isFavorite, addFavorite, removeFavorite } = useTradingStore()
  const priceChangeIsPositive = (token.priceChange24h || 0) >= 0

  const toggleFavorite = () => {
    if (isFavorite(token.address)) {
      removeFavorite(token.address)
    } else {
      addFavorite(token.address)
    }
  }

  return (
    <div className="grid grid-cols-[24px_24px_minmax(0,1fr)_88px_96px_110px_110px_90px_80px] items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-white/5">
      <button
        onClick={toggleFavorite}
        className="text-white/30 hover:text-yellow-400 transition-colors"
      >
        <Star 
          className={`h-3 w-3 ${isFavorite(token.address) ? 'fill-yellow-400 text-yellow-400' : ''}`} 
        />
      </button>

      <div className="text-[12px] text-white/40">
        {token.status === 'GRADUATED' ? '🏆' : token.status === 'LAUNCHED' ? '🚀' : '✨'}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {/* ACTUAL TOKEN IMAGE */}
        {token.image_url ? (
          <img 
            src={token.image_url}
            alt={token.name}
            className="h-6 w-6 shrink-0 rounded object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = 'flex';
            }}
          />
        ) : null}
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-[11px] text-white/70 ${token.image_url ? 'hidden' : ''}`}>
          {token.symbol.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-white">{token.name}</div>
          <div className="truncate text-[12px] text-white/60">
            ${token.price ? kFormatter(token.price) : '0.00'}
            <span className={"ml-2 " + (priceChangeIsPositive ? "text-orange-400" : "text-red-400")}>
              {priceChangeIsPositive ? "+" : ""}
              {(token.priceChange24h || 0).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="justify-self-end text-white/80">${kFormatter(token.liquidity || 0)}</div>
      <div className="justify-self-end text-white/80">{kFormatter(token.holders || 0)}</div>
      <div className="justify-self-end text-white/80">${kFormatter(token.marketCap || 0)}</div>
      <div className="justify-self-end text-white/80">${kFormatter(token.volume24h || 0)}</div>
      <div className="justify-self-end text-white/80">{kFormatter(token.transactions24h || 0)}</div>
      <div className="justify-self-end">
        {token.status === 'CREATED' ? (
          <span className="inline-flex items-center rounded bg-orange-500/20 px-1.5 py-0.5 text-[11px] font-medium text-orange-400">
            {(token.graduationPercentage || ((token.raisedAmount || token.liquidity || 0) / (token.targetAmount || 3)) * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="inline-flex items-center rounded bg-yellow-500/20 px-1.5 py-0.5 text-[11px] font-medium text-yellow-400">
            LIVE
          </span>
        )}
      </div>
    </div>
  )
}