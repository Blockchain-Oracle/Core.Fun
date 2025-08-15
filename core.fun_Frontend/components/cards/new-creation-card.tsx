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
} from "lucide-react"
import type { TokenData } from "@/lib/api"
import { kFormatter } from "@/lib/utils-format"
import { formatDistanceToNow } from "date-fns"

export default function NewCreationCard({ token }: { token: TokenData }) {
  const isPositive = (token.priceChange24h || 0) >= 0

  return (
    <Link href={`/token/${token.address}`} className="block">
      <Card className="group relative border border-orange-500/20 bg-black/60 p-3 transition-all hover:bg-black/80 hover:border-orange-500/40">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* ACTUAL TOKEN IMAGE */}
            <div className="relative">
              {token.image_url ? (
                <img 
                  src={token.image_url}
                  alt={token.name}
                  className="h-12 w-12 rounded-xl object-cover ring-1 ring-orange-500/30"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = e.currentTarget.parentElement?.querySelector('.fallback-avatar');
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }}
                />
              ) : null}
              <div className={`fallback-avatar h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500/30 to-orange-500/10 items-center justify-center text-base font-bold text-orange-400 ${token.image_url ? 'hidden' : 'flex'}`}>
                {token.symbol?.slice(0, 2)}
              </div>
              {token.isVerified && (
                <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-orange-500 border border-black flex items-center justify-center">
                  <svg className="h-2 w-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-medium text-white truncate">{token.name}</h3>
                <span className="text-xs text-white/50">${token.symbol}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/30">
                  NEW
                </Badge>
                <span className="text-[10px] text-white/40">
                  {formatDistanceToNow(new Date(token.createdAt * 1000), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
          
          {/* Price Change Badge */}
          <Badge 
            variant="outline" 
            className={`h-6 px-1.5 text-xs ${
              isPositive 
                ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' 
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
            {Math.abs(token.priceChange24h || 0).toFixed(1)}%
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">PRICE</p>
            <p className="text-xs font-medium text-white">
              ${token.price ? token.price.toFixed(6) : '0.00'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">MCAP</p>
            <p className="text-xs font-medium text-white">
              ${kFormatter(token.marketCap || 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40 mb-0.5">VOL 24H</p>
            <p className="text-xs font-medium text-white">
              ${kFormatter(token.volume24h || 0)}
            </p>
          </div>
        </div>

        {/* Creator & Socials */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/40">by</span>
            <span className="text-[10px] text-orange-400">
              {token.creator.slice(0, 6)}...{token.creator.slice(-4)}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            {token.twitter && (
              <a href={token.twitter} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Twitter className="h-3 w-3 text-white/40 hover:text-white" />
              </a>
            )}
            {token.telegram && (
              <a href={token.telegram} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Send className="h-3 w-3 text-white/40 hover:text-white" />
              </a>
            )}
            {token.website && (
              <a href={token.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Globe className="h-3 w-3 text-white/40 hover:text-white" />
              </a>
            )}
            <div className="flex items-center gap-0.5 ml-1">
              <Users className="h-3 w-3 text-white/40" />
              <span className="text-[10px] text-white/40">{kFormatter(token.holders || 0)}</span>
            </div>
          </div>
        </div>

        {/* Progress Bar for Bonding Curve - ACTUAL PROGRESS */}
        {token.status === 'CREATED' && (
          <div className="mt-2">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all"
                style={{ width: `${Math.min(token.graduationPercentage || ((token.raisedAmount || token.liquidity || 0) / (token.targetAmount || 3)) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-white/40 mt-1">
              {(token.graduationPercentage || ((token.raisedAmount || token.liquidity || 0) / (token.targetAmount || 3)) * 100).toFixed(1)}% to graduation
            </p>
          </div>
        )}
      </Card>
    </Link>
  )
}