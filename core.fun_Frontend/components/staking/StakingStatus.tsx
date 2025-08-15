'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatTokenAmount, formatPercentage } from '@/lib/api-client'
import { 
  TrendingUp, 
  Award, 
  Clock, 
  Coins, 
  Zap,
  Shield,
  ChevronRight,
  Loader2,
  AlertTriangle
} from 'lucide-react'

interface StakingStatusProps {
  status?: {
    stakedAmount: string
    tier: string
    tierName: string
    pendingRewards: string
    totalClaimed: string
    apy: number
    feeDiscount: number
    lastStakedAt: Date
    lastClaimedAt: Date
    canUnstake: boolean
    cooldownEnd?: Date
  }
  isLoading: boolean
  onClaim: () => Promise<void>
}

export function StakingStatus({ status, isLoading, onClaim }: StakingStatusProps) {
  const [isClaiming, setIsClaiming] = useState(false)

  const handleClaim = async () => {
    setIsClaiming(true)
    try {
      await onClaim()
    } finally {
      setIsClaiming(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Staking Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status || parseFloat(status.stakedAmount) === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start Staking</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Active Stake</h3>
          <p className="text-muted-foreground mb-4">
            Stake CMP tokens to unlock tier benefits and earn rewards
          </p>
          <Button>
            Start Staking <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  const getTierColor = (tier: string) => {
    switch (tier.toLowerCase()) {
      case 'platinum':
        return 'bg-gradient-to-r from-purple-500 to-pink-500'
      case 'gold':
        return 'bg-gradient-to-r from-yellow-500 to-orange-500'
      case 'silver':
        return 'bg-gradient-to-r from-gray-400 to-gray-600'
      case 'bronze':
        return 'bg-gradient-to-r from-orange-600 to-red-600'
      default:
        return 'bg-gray-500'
    }
  }

  const getTierIcon = (tier: string) => {
    switch (tier.toLowerCase()) {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Your Staking Status</CardTitle>
        <Badge className={`${getTierColor(status.tier)} text-white px-3 py-1`}>
          <span className="mr-1">{getTierIcon(status.tier)}</span>
          {status.tierName} Tier
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <div className="flex items-center text-sm text-muted-foreground">
              <Coins className="h-4 w-4 mr-1" />
              Staked Amount
            </div>
            <div className="text-2xl font-bold">
              {formatTokenAmount(status.stakedAmount)}
            </div>
            <div className="text-xs text-muted-foreground">CMP</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 mr-1" />
              APY
            </div>
            <div className="text-2xl font-bold text-orange-500">
              {status.apy}%
            </div>
            <div className="text-xs text-muted-foreground">Annual Yield</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center text-sm text-muted-foreground">
              <Zap className="h-4 w-4 mr-1" />
              Fee Discount
            </div>
            <div className="text-2xl font-bold text-blue-500">
              {status.feeDiscount}%
            </div>
            <div className="text-xs text-muted-foreground">On All Trades</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center text-sm text-muted-foreground">
              <Award className="h-4 w-4 mr-1" />
              Total Claimed
            </div>
            <div className="text-2xl font-bold">
              {formatTokenAmount(status.totalClaimed)}
            </div>
            <div className="text-xs text-muted-foreground">CMP</div>
          </div>
        </div>

        {/* Pending Rewards Section */}
        {parseFloat(status.pendingRewards) > 0 && (
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Pending Rewards</div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {formatTokenAmount(status.pendingRewards)} CMP
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Ready to claim
                </div>
              </div>
              <Button 
                onClick={handleClaim}
                disabled={isClaiming}
                variant="default"
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    Claim Rewards
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Additional Info */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Last Staked
            </span>
            <span className="text-sm font-medium">
              {new Date(status.lastStakedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Last Claimed
            </span>
            <span className="text-sm font-medium">
              {status.lastClaimedAt ? new Date(status.lastClaimedAt).toLocaleDateString() : 'Never'}
            </span>
          </div>
        </div>

        {/* Cooldown Warning */}
        {status.cooldownEnd && new Date(status.cooldownEnd) > new Date() && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Unstaking is in cooldown until {new Date(status.cooldownEnd).toLocaleString()}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}