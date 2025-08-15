'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTokenAmount, shortenAddress } from '@/lib/api-client'
import { 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Gift, 
  ExternalLink,
  Clock,
  Hash
} from 'lucide-react'

interface HistoryItem {
  type: 'stake' | 'unstake' | 'claim'
  amount: string
  txHash: string
  timestamp: Date
}

interface StakingHistoryProps {
  history: HistoryItem[]
  isLoading: boolean
}

export function StakingHistory({ history, isLoading }: StakingHistoryProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'stake':
        return <ArrowUpCircle className="h-5 w-5 text-orange-500" />
      case 'unstake':
        return <ArrowDownCircle className="h-5 w-5 text-red-500" />
      case 'claim':
        return <Gift className="h-5 w-5 text-purple-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'stake':
        return <Badge variant="default" className="bg-orange-500">Staked</Badge>
      case 'unstake':
        return <Badge variant="destructive">Unstaked</Badge>
      case 'claim':
        return <Badge variant="secondary" className="bg-purple-500 text-white">Claimed</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  const formatDate = (date: Date) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    } else if (diffHours < 168) {
      const diffDays = Math.floor(diffHours / 24)
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    } else {
      return d.toLocaleDateString()
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Loading your staking history...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="space-y-2">
                    <div className="h-4 w-20 bg-muted-foreground/20 rounded" />
                    <div className="h-3 w-32 bg-muted-foreground/20 rounded" />
                  </div>
                  <div className="h-8 w-24 bg-muted-foreground/20 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Your staking transactions will appear here</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No transactions yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Start staking to see your transaction history
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction History</CardTitle>
        <CardDescription>
          Your recent staking transactions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {history.map((item, index) => (
            <div
              key={`${item.txHash}-${index}`}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {getTypeIcon(item.type)}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getTypeBadge(item.type)}
                    <span className="text-sm text-muted-foreground">
                      {formatDate(item.timestamp)}
                    </span>
                  </div>
                  <div className="text-lg font-semibold">
                    {formatTokenAmount(item.amount)} CMP
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    {shortenAddress(item.txHash, 6)}
                  </div>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a
                  href={`https://scan.test.btcs.network/tx/${item.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  View
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
          ))}
        </div>

        {history.length >= 50 && (
          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground">
              Showing last 50 transactions
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}