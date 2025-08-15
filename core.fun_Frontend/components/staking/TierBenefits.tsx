'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { formatTokenAmount } from '@/lib/api-client'
import { 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Zap, 
  Bell, 
  Copy, 
  Key,
  ChevronRight,
  Lock,
  Unlock
} from 'lucide-react'

interface Tier {
  name: string
  minStake: number
  feeDiscount: number
  maxAlerts: number
  copyTradeSlots: number
  apiAccess: boolean
  apy: number
  benefits?: string[]
}

interface TierBenefitsProps {
  tiers: Tier[]
  currentTier?: string
  currentStaked: number
}

export function TierBenefits({ tiers, currentTier, currentStaked }: TierBenefitsProps) {
  if (!tiers || tiers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Tiers...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const getTierColor = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'platinum':
        return 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20'
      case 'gold':
        return 'border-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20'
      case 'silver':
        return 'border-gray-400 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/20 dark:to-slate-950/20'
      case 'bronze':
        return 'border-orange-600 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20'
      default:
        return 'border-gray-300 bg-gray-50 dark:bg-gray-950/20'
    }
  }

  const getTierIcon = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'platinum':
        return '💎'
      case 'gold':
        return '🏆'
      case 'silver':
        return '🥈'
      case 'bronze':
        return '🥉'
      default:
        return '📊'
    }
  }

  const getBenefitIcon = (benefit: string) => {
    if (benefit.includes('fee') || benefit.includes('discount')) return <Zap className="h-4 w-4" />
    if (benefit.includes('alert')) return <Bell className="h-4 w-4" />
    if (benefit.includes('copy') || benefit.includes('trade')) return <Copy className="h-4 w-4" />
    if (benefit.includes('api') || benefit.includes('access')) return <Key className="h-4 w-4" />
    if (benefit.includes('apy') || benefit.includes('yield')) return <TrendingUp className="h-4 w-4" />
    return <CheckCircle2 className="h-4 w-4" />
  }

  const isCurrentTier = (tier: Tier) => {
    return tier.name.toLowerCase() === currentTier?.toLowerCase()
  }

  const canUpgrade = (tier: Tier) => {
    return currentStaked < tier.minStake && currentStaked >= (tier.minStake * 0.5)
  }

  const isLocked = (tier: Tier) => {
    return currentStaked < tier.minStake
  }

  return (
    <div className="space-y-4">
      {/* Progress to Next Tier */}
      {currentTier && currentTier !== 'Platinum' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Progress to Next Tier</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const currentTierIndex = tiers.findIndex(t => t.name.toLowerCase() === currentTier.toLowerCase())
              const nextTier = tiers[currentTierIndex + 1]
              if (!nextTier) return null
              
              const progress = (currentStaked / nextTier.minStake) * 100
              const remaining = nextTier.minStake - currentStaked

              return (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current: {currentTier}</span>
                    <span className="font-medium">Next: {nextTier.name}</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatTokenAmount(currentStaked.toString())} CMP
                    </span>
                    <span className="font-medium">
                      {formatTokenAmount(remaining.toString())} CMP to go
                    </span>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {/* Tier Cards */}
      <div className="grid gap-4">
        {tiers.map((tier) => {
          const isCurrent = isCurrentTier(tier)
          const locked = isLocked(tier)
          const upgradeable = canUpgrade(tier)

          return (
            <Card 
              key={tier.name} 
              className={`relative overflow-hidden transition-all ${getTierColor(tier.name)} ${
                isCurrent ? 'ring-2 ring-primary' : ''
              } ${locked && !isCurrent ? 'opacity-75' : ''}`}
            >
              {isCurrent && (
                <div className="absolute top-3 right-3">
                  <Badge variant="default">Current Tier</Badge>
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span className="text-2xl">{getTierIcon(tier.name)}</span>
                      {tier.name}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Minimum Stake: {formatTokenAmount(tier.minStake.toString())} CMP
                    </CardDescription>
                  </div>
                  {locked && !isCurrent && (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                  {!locked && !isCurrent && (
                    <Unlock className="h-5 w-5 text-orange-500" />
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Key Benefits Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center p-3 bg-background/50 rounded-lg">
                    <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                    <div className="text-lg font-bold">{tier.apy}%</div>
                    <div className="text-xs text-muted-foreground">APY</div>
                  </div>
                  
                  <div className="text-center p-3 bg-background/50 rounded-lg">
                    <Zap className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                    <div className="text-lg font-bold">{tier.feeDiscount}%</div>
                    <div className="text-xs text-muted-foreground">Fee Discount</div>
                  </div>
                  
                  <div className="text-center p-3 bg-background/50 rounded-lg">
                    <Bell className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                    <div className="text-lg font-bold">
                      {tier.maxAlerts === -1 ? '∞' : tier.maxAlerts}
                    </div>
                    <div className="text-xs text-muted-foreground">Alerts</div>
                  </div>
                  
                  <div className="text-center p-3 bg-background/50 rounded-lg">
                    <Copy className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                    <div className="text-lg font-bold">{tier.copyTradeSlots}</div>
                    <div className="text-xs text-muted-foreground">Copy Slots</div>
                  </div>
                </div>

                {/* Additional Benefits */}
                {tier.benefits && tier.benefits.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Additional Benefits:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {tier.benefits.map((benefit, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          {getBenefitIcon(benefit)}
                          <span>{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* API Access Badge */}
                <div className="flex items-center gap-2">
                  {tier.apiAccess ? (
                    <Badge variant="default" className="bg-orange-500">
                      <Key className="h-3 w-3 mr-1" />
                      API Access Included
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      No API Access
                    </Badge>
                  )}
                </div>

                {/* Action Button */}
                {upgradeable && !isCurrent && (
                  <Button className="w-full" variant="default">
                    Stake {formatTokenAmount((tier.minStake - currentStaked).toString())} CMP to Unlock
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}