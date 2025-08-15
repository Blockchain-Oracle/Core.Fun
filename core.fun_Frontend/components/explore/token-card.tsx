"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TokenAvatar } from "@/components/ui/token-avatar"
import { 
  Twitter, 
  Globe, 
  Send, 
  Users, 
  TrendingUp, 
  TrendingDown,
  Activity,
  DollarSign,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Star
} from "lucide-react"
import { cn } from "@/lib/utils"
import { kFormatter } from "@/lib/utils-format"
import type { TokenData } from "@/lib/api"
import { Progress } from "@/components/ui/progress"
import { useAuthStore } from "@/lib/stores"
import { useRouter } from "next/navigation"

interface TokenCardProps {
  token: TokenData
  variant?: "compact" | "detailed"
  viewMode?: "grid" | "list" | "table"
}

export default function TokenCard({ token, variant = "compact", viewMode = "grid" }: TokenCardProps) {
  const [copied, setCopied] = useState(false)
  const [favorited, setFavorited] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const isPositive = (token.priceChange24h || 0) >= 0
  
  // Calculate graduation progress
  const isGraduated = token.status === 'GRADUATED' || token.isGraduated
  const graduationProgress = isGraduated ? 100 : (
    token.graduationPercentage || 
    token.bondingCurve?.progress || 
    ((token.raised || 0) / 3) * 100 || // Assuming 3 CORE target
    0
  )

  const handleCopy = () => {
    navigator.clipboard.writeText(token.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getBadgeColor = () => {
    if (isGraduated) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    if (graduationProgress >= 80) return "bg-orange-500/20 text-orange-400 border-orange-500/30"
    if (graduationProgress >= 50) return "bg-blue-500/20 text-blue-400 border-blue-500/30"
    return "bg-orange-500/20 text-orange-400 border-orange-500/30"
  }

  const getCategoryLabel = () => {
    if (isGraduated) {
      return token.dexPair ? "🎓 Graduated (DEX)" : "🎓 Graduated"
    }
    if (graduationProgress >= 90) return `🔥 ${graduationProgress.toFixed(0)}% to Graduate`
    if (graduationProgress >= 80) return `⚡ ${graduationProgress.toFixed(0)}% to Graduate`
    if (graduationProgress >= 50) return `📈 ${graduationProgress.toFixed(0)}%`
    return `${graduationProgress.toFixed(0)}%`
  }

  return (
    <Card className="group relative overflow-hidden border-white/10 bg-gradient-to-r from-black/60 to-black/40 backdrop-blur-sm transition-all hover:border-orange-500/30 hover:from-black/80 hover:to-black/60">
      <Link href={`/token/${token.address}`} className="block p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left section with token info */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* ACTUAL TOKEN IMAGE - NOT AVATAR */}
            <div className="relative flex-shrink-0">
              {token.image_url ? (
                <img 
                  src={token.image_url}
                  alt={token.name}
                  className="h-12 w-12 rounded-xl object-cover ring-2 ring-white/10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = e.currentTarget.parentElement?.querySelector('.fallback-avatar');
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }}
                />
              ) : null}
              <div 
                className={`fallback-avatar h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 items-center justify-center text-base font-bold text-primary ${token.image_url ? 'hidden' : 'flex'}`}
              >
                {token.symbol?.slice(0, 2)}
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-black border-2 border-orange-500 flex items-center justify-center">
                <span className="text-[8px] text-orange-400 font-bold">C</span>
              </div>
            </div>

            {/* Token Details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white truncate">{token.name}</h3>
                    <span className="text-xs text-white/40 bg-white/10 px-1.5 py-0.5 rounded">
                      ${token.symbol}
                    </span>
                    <Badge className={cn("text-[10px] h-4 px-1.5", getBadgeColor())}>
                      {getCategoryLabel()}
                    </Badge>
                    {token.isVerified && (
                      <Badge className="text-[10px] h-4 px-1.5 bg-orange-500/20 text-orange-400 border-orange-500/30">
                        ✓ Verified
                      </Badge>
                    )}
                  </div>

                  {/* Price and Change */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-sm text-white/90">
                      ${token.price && token.price < 0.01 ? token.price.toFixed(6) : kFormatter(token.price || 0)}
                    </span>
                    <span className={cn(
                      "flex items-center gap-1 text-xs font-medium",
                      isPositive ? "text-orange-400" : "text-red-400"
                    )}>
                      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(token.priceChange24h || 0).toFixed(1)}%
                    </span>
                  </div>

                  {/* Description if available */}
                  {token.description && (
                    <p className="text-xs text-white/60 mt-1 line-clamp-1">
                      {token.description}
                    </p>
                  )}
                  
                  {/* Graduation Progress Bar - Only show if not graduated */}
                  {!isGraduated && graduationProgress > 0 && (
                    <div className="mt-2">
                      <Progress 
                        value={graduationProgress} 
                        className="h-1.5 bg-white/10"
                      />
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] text-white/50">
                          {token.raised ? `${token.raised.toFixed(2)} CORE raised` : 'Bonding curve'}
                        </span>
                        <span className="text-[10px] text-orange-400">
                          {graduationProgress >= 80 ? '🎯 Almost there!' : `${(3 - (token.raised || 0)).toFixed(2)} CORE to go`}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Stats Row */}
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-white/40" />
                      <span className="text-white/70">{kFormatter(token.holders || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3 text-white/40" />
                      <span className="text-white/70">{kFormatter(token.transactions24h || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-white/40" />
                      <span className="text-white/70">V ${kFormatter(token.volume24h || 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-white/40" />
                      <span className="text-orange-400 font-medium">MC ${kFormatter(token.marketCap || 0)}</span>
                    </div>
                    {/* Show DEX pair link if graduated */}
                    {isGraduated && token.dexPair && (
                      <a 
                        href={`https://scan.test2.btcs.network/address/${token.dexPair}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>DEX</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right section with actions */}
          <div className="flex flex-col items-end gap-3 flex-shrink-0">
            {/* Social Links - ACTUAL LINKS */}
            <div className="flex items-center gap-1">
              <button 
                onClick={(e) => {
                  e.preventDefault()
                  setFavorited(!favorited)
                }}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  favorited 
                    ? "text-yellow-400 bg-yellow-500/20" 
                    : "text-white/40 hover:text-white/60 hover:bg-white/10"
                )}
              >
                <Star className={cn("h-3.5 w-3.5", favorited && "fill-current")} />
              </button>
              <button 
                onClick={(e) => {
                  e.preventDefault()
                  handleCopy()
                }}
                className="p-1.5 rounded-lg text-white/40 hover:text-orange-400 hover:bg-white/10 transition-all"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-orange-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              {token.twitter && (
                <a
                  href={token.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-white/40 hover:text-[#1DA1F2] hover:bg-white/10 transition-all"
                >
                  <Twitter className="h-3.5 w-3.5" />
                </a>
              )}
              {token.website && (
                <a
                  href={token.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white/60 hover:bg-white/10 transition-all"
                >
                  <Globe className="h-3.5 w-3.5" />
                </a>
              )}
              {token.telegram && (
                <a
                  href={token.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-white/40 hover:text-[#0088cc] hover:bg-white/10 transition-all"
                >
                  <Send className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {/* Buy Button */}
            <Button
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                if (!isAuthenticated) {
                  router.push('/login')
                  return
                }
                router.push(`/token/${token.address}`)
              }}
              className="h-8 px-4 bg-orange-500 hover:bg-orange-600 text-black font-semibold"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Buy
            </Button>
          </div>
        </div>
      </Link>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </Card>
  )
}