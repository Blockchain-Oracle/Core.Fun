"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TokenAvatar } from "@/components/ui/token-avatar"
import {
  Users,
  Twitter,
  Globe,
  Send,
  TrendingUp,
  TrendingDown,
  X,
  Trophy,
  Award,
} from "lucide-react"
import type { TokenData } from "@/lib/api"
import { formatDistanceToNow } from "date-fns"
import { kFormatter } from "@/lib/utils-format"
import MiniCandles from "@/components/charts/mini-candles"

export default function GraduatedCard({ token }: { token: TokenData }) {
  const priceChange = token.priceChange24h || 0
  const isPositive = priceChange >= 0

  return (
    <Link href={`/token/${token.address}`} className="block">
      <Card className="group relative border border-yellow-500/20 bg-black/70 p-3 transition-all hover:bg-black/90 hover:border-yellow-500/40">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-start gap-2">
            <div className="relative">
              {/* ACTUAL TOKEN IMAGE */}
              {token.image_url ? (
                <img 
                  src={token.image_url}
                  alt={token.name}
                  className="h-12 w-12 rounded-xl object-cover ring-1 ring-yellow-500/30"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = e.currentTarget.parentElement?.querySelector('.fallback-avatar');
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }}
                />
              ) : null}
              <div className={`fallback-avatar h-12 w-12 rounded-xl bg-gradient-to-br from-yellow-500/30 to-yellow-500/10 items-center justify-center text-base font-bold text-yellow-400 ${token.image_url ? 'hidden' : 'flex'}`}>
                {token.symbol?.slice(0, 2)}
              </div>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-yellow-500 border border-black flex items-center justify-center">
                <Trophy className="h-2.5 w-2.5 text-black" />
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-white text-sm">{token.name}</h3>
                <Badge className="text-[10px] px-1 h-4 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">GRADUATED</Badge>
              </div>

              {/* Price and change */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-white">
                  ${token.price && token.price < 0.01 ? token.price.toFixed(6) : kFormatter(token.price || 0)}
                </span>
                <span className={`text-xs flex items-center gap-0.5 ${isPositive ? "text-orange-400" : "text-red-400"}`}>
                  {isPositive ? "▲" : "▼"}
                  {Math.abs(priceChange).toFixed(1)}%
                </span>
                <span className="text-xs text-yellow-400">LIVE</span>
              </div>
            </div>
          </div>

          {/* Social Icons - ACTUAL LINKS */}
          <div className="flex items-center gap-1">
            {token.twitter && (
              <a href={token.twitter} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-white/30 hover:text-[#1DA1F2] transition-colors">
                <Twitter className="h-3.5 w-3.5" />
              </a>
            )}
            {token.website && (
              <a href={token.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-white/30 hover:text-white/60 transition-colors">
                <Globe className="h-3.5 w-3.5" />
              </a>
            )}
            {token.telegram && (
              <a href={token.telegram} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-white/30 hover:text-[#0088cc] transition-colors">
                <Send className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">PRICE</p>
            <p className="text-xs font-medium text-white">
              ${token.price ? token.price.toFixed(6) : '0.00'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">MCAP</p>
            <p className="text-xs font-medium text-yellow-400">
              ${kFormatter(token.marketCap || 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">LIQ</p>
            <p className="text-xs font-medium text-white">
              ${kFormatter(token.liquidity || 0)}
            </p>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-white/40" />
              <span className="text-white/70">{kFormatter(token.holders || 0)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/40">⚡</span>
              <span className="text-white/70">{kFormatter(token.transactions24h || 0)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <span className="text-white/40">V</span>
              <span className="text-white ml-1">${kFormatter(token.volume24h || 0)}</span>
            </div>
            <div>
              <span className="text-white/40">MC</span>
              <span className="text-yellow-400 ml-1 font-semibold">${kFormatter(token.marketCap || 0)}</span>
            </div>
          </div>
        </div>

        {/* Premium Badge */}
        <div className="absolute top-2 right-2">
          <Award className="h-4 w-4 text-yellow-500/50" />
        </div>

        {/* Hover overlay: semi-transparent overlay with Buy button */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="absolute inset-0 bg-black/40 rounded-lg" />
          <div className="absolute bottom-3 right-3 pointer-events-auto">
            <button className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition-colors">
              BUY
            </button>
          </div>
        </div>
      </Card>
    </Link>
  )
}