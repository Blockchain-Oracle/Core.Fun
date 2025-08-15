'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokenAmount, formatUSD } from '@/lib/api-client'
import { 
  Users, 
  Coins, 
  TrendingUp, 
  Award,
  BarChart3,
  Activity
} from 'lucide-react'

interface StakingStatsProps {
  stats?: {
    totalStaked: string
    totalStakers: number
    totalRewardsPaid: string
    averageApy: number
    platformToken: string
    tierDistribution: Record<string, number>
  }
  isLoading: boolean
}

export function StakingStats({ stats, isLoading }: StakingStatsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </CardTitle>
              <div className="h-5 w-5 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-7 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-20 bg-muted animate-pulse rounded mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const totalInTiers = Object.values(stats.tierDistribution).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      {/* Main Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value Locked</CardTitle>
            <Coins className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokenAmount(stats.totalStaked)}</div>
            <p className="text-xs text-muted-foreground">CMP tokens staked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stakers</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStakers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Active participants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average APY</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.averageApy}%</div>
            <p className="text-xs text-muted-foreground">Annual yield</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rewards Distributed</CardTitle>
            <Award className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokenAmount(stats.totalRewardsPaid)}</div>
            <p className="text-xs text-muted-foreground">CMP paid out</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution */}
      {stats.tierDistribution && Object.keys(stats.tierDistribution).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tier Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.tierDistribution)
                .sort((a, b) => {
                  const tierOrder = ['Free', 'Bronze', 'Silver', 'Gold', 'Platinum']
                  return tierOrder.indexOf(a[0]) - tierOrder.indexOf(b[0])
                })
                .map(([tier, count]) => {
                  const percentage = totalInTiers > 0 ? (count / totalInTiers) * 100 : 0
                  
                  return (
                    <div key={tier} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tier}</span>
                          <span className="text-muted-foreground">
                            ({count.toLocaleString()} stakers)
                          </span>
                        </div>
                        <span className="font-medium">{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${getTierBarColor(tier)}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Info */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Platform Token
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">CMP</p>
              <p className="text-sm text-muted-foreground">Core Meme Platform Token</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Contract</p>
              <p className="text-xs font-mono">{stats.platformToken}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function getTierBarColor(tier: string): string {
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