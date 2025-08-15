"use client"

import { useEffect, useMemo, useState, use } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { TradingPanel } from "@/components/trading/TradingPanel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useTokenStore } from "@/lib/stores"
import { 
  Twitter, 
  Send as Telegram, 
  Globe, 
  Copy, 
  Check,
  Users,
  Activity,
  TrendingUp,
  Shield,
  AlertTriangle,
  ExternalLink,
  Zap,
  Lock,
  Unlock
} from "lucide-react"
import { kFormatter } from "@/lib/utils-format"

type Props = { params: Promise<{ id: string }> }

export default function TokenDetailPage({ params }: Props) {
  const resolvedParams = use(params)
  const searchParams = useSearchParams()
  const action = searchParams.get('action')
  const { allTokens, fetchTokens } = useTokenStore()
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tokenData, setTokenData] = useState<any>(null)
  
  // Get token from store
  const token = useMemo(() => allTokens.find(t => t.address === resolvedParams.id), [allTokens, resolvedParams.id])
  
  useEffect(() => {
    if (!token) {
      setIsLoading(true)
      fetchTokens({ reset: true }).finally(() => setIsLoading(false))
    }
  }, [resolvedParams.id])
  
  // Fetch complete token data from API
  useEffect(() => {
    const fetchCompleteData = async () => {
      try {
        const response = await fetch(`/api/tokens/${resolvedParams.id}`)
        const data = await response.json()
        if (data.success) {
          setTokenData(data.token)
        }
      } catch (error) {
        console.error('Error fetching complete token data:', error)
      }
    }
    fetchCompleteData()
  }, [resolvedParams.id])
  
  const handleCopy = () => {
    navigator.clipboard.writeText(resolvedParams.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const displayToken = tokenData || token
  
  if (isLoading || !displayToken) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-6">
      {/* Header with Image and Basic Info */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* TOKEN IMAGE - ACTUAL IMAGE FROM CONTRACT */}
        <div className="flex-shrink-0">
          {displayToken.image_url ? (
            <img 
              src={displayToken.image_url}
              alt={displayToken.name}
              className="w-32 h-32 md:w-48 md:h-48 rounded-2xl object-cover ring-4 ring-primary/20"
            />
          ) : (
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <span className="text-4xl font-bold text-primary">
                {displayToken.symbol?.slice(0, 2)}
              </span>
            </div>
          )}
        </div>
        
        {/* Token Info */}
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{displayToken.name}</h1>
              <Badge variant="outline" className="text-lg px-3 py-1">
                ${displayToken.symbol}
              </Badge>
              {displayToken.isVerified && (
                <Badge className="bg-orange-500/20 text-orange-400">
                  <Shield className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
            </div>
            
            {/* DESCRIPTION - FULL DESCRIPTION FROM CONTRACT */}
            {displayToken.description && (
              <p className="text-white/70 text-lg mt-3">
                {displayToken.description}
              </p>
            )}
            
            {/* Token Address */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-white/50">Contract:</span>
              <code className="text-sm bg-white/10 px-2 py-1 rounded">
                {resolvedParams.id.slice(0, 6)}...{resolvedParams.id.slice(-4)}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="h-6 w-6 p-0"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          
          {/* SOCIAL LINKS - ACTUAL LINKS FROM CONTRACT */}
          <div className="flex items-center gap-3">
            {displayToken.website && (
              <a 
                href={displayToken.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Globe className="w-4 h-4" />
                Website
              </a>
            )}
            {displayToken.twitter && (
              <a 
                href={displayToken.twitter} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Twitter className="w-4 h-4" />
                Twitter
              </a>
            )}
            {displayToken.telegram && (
              <a 
                href={displayToken.telegram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Telegram className="w-4 h-4" />
                Telegram
              </a>
            )}
          </div>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              ${kFormatter(displayToken.price || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Price</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              ${kFormatter(displayToken.marketCap || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Market Cap</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {kFormatter(displayToken.holders || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Holders</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              ${kFormatter(displayToken.volume24h || 0)}
            </div>
            <p className="text-xs text-muted-foreground">24h Volume</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Bonding Curve Progress */}
      {displayToken.status === 'CREATED' && displayToken.bondingCurve && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Bonding Curve Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Progress 
                value={displayToken.bondingCurve?.progress || displayToken.graduationPercentage || 0} 
                className="h-3"
              />
              <div className="flex justify-between text-sm">
                <span>
                  Raised: {displayToken.bondingCurve?.raisedAmount || displayToken.raised || 0} CORE
                </span>
                <span>
                  Target: {displayToken.bondingCurve?.targetAmount || 3} CORE
                </span>
              </div>
              <div className="text-center text-lg font-semibold">
                {displayToken.bondingCurve?.progress?.toFixed(1) || displayToken.graduationPercentage?.toFixed(1) || 0}% to Graduation
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Trading Controls Info */}
      {(displayToken.maxWallet || displayToken.maxTransaction) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Trading Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${displayToken.tradingEnabled ? 'bg-orange-500/20' : 'bg-red-500/20'}`}>
                  {displayToken.tradingEnabled ? 
                    <Unlock className="w-4 h-4 text-orange-400" /> : 
                    <Lock className="w-4 h-4 text-red-400" />
                  }
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Trading</p>
                  <p className="font-semibold">
                    {displayToken.tradingEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>
              
              {displayToken.maxWallet && displayToken.maxWallet !== '0' && (
                <div>
                  <p className="text-sm text-muted-foreground">Max Wallet</p>
                  <p className="font-semibold">
                    {kFormatter(Number(displayToken.maxWallet) / 1e18)} tokens
                  </p>
                </div>
              )}
              
              {displayToken.maxTransaction && displayToken.maxTransaction !== '0' && (
                <div>
                  <p className="text-sm text-muted-foreground">Max Transaction</p>
                  <p className="font-semibold">
                    {kFormatter(Number(displayToken.maxTransaction) / 1e18)} tokens
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Trading Panel */}
      <Card>
        <CardContent className="pt-6">
          <TradingPanel 
            tokenAddress={resolvedParams.id}
            tokenSymbol={displayToken.symbol || 'TOKEN'}
            currentSold={displayToken.sold || 0}
            currentRaised={displayToken.liquidity || displayToken.raised || 0}
            isLaunched={displayToken.status === 'GRADUATED' || displayToken.isLaunched}
          />
        </CardContent>
      </Card>
      
      {/* Holder Distribution */}
      {displayToken.analytics?.holderDistribution && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Holder Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {displayToken.analytics.holderDistribution.whales || 0}
                </div>
                <p className="text-sm text-muted-foreground">Whales (&gt;1%)</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {displayToken.analytics.holderDistribution.dolphins || 0}
                </div>
                <p className="text-sm text-muted-foreground">Dolphins (0.1-1%)</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {displayToken.analytics.holderDistribution.fish || 0}
                </div>
                <p className="text-sm text-muted-foreground">Fish (&lt;0.1%)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Staking Benefits (if user has any) */}
      {displayToken.stakingBenefits && displayToken.stakingBenefits.tier > 0 && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Your Staking Benefits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tier</p>
                <p className="font-semibold text-primary">
                  {displayToken.stakingBenefits.tierName}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fee Discount</p>
                <p className="font-semibold text-orange-400">
                  {displayToken.stakingBenefits.feeDiscount}% OFF
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Staked</p>
                <p className="font-semibold">
                  {kFormatter(displayToken.stakingBenefits.userStake)} CORE
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rewards</p>
                <p className="font-semibold">
                  {kFormatter(displayToken.stakingBenefits.pendingRewards)} CORE
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}