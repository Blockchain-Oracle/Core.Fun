'use client'

import { useEffect, useState } from 'react'
import { useAnalyticsStore, useTreasuryStore, useStakingStore } from '@/lib/stores'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  TrendingUp, 
  TrendingDown,
  Activity,
  Users,
  Coins,
  DollarSign,
  BarChart3,
  PieChart,
  Zap,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Trophy,
  Rocket,
  Target,
  Shield,
  Clock,
  Globe,
  Database,
  Wifi,
  Receipt
} from 'lucide-react'
import { formatNumber, kFormatter } from '@/lib/data-transform'
import { wsClient } from '@/lib/websocket'
import { apiClient } from '@/lib/api'

// Health status component
function SystemHealthCard() {
  const { systemHealth, fetchSystemHealth } = useAnalyticsStore()
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    fetchSystemHealth()
    const interval = setInterval(fetchSystemHealth, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [fetchSystemHealth])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchSystemHealth()
    setIsRefreshing(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-orange-500'
      case 'degraded': return 'text-yellow-500'
      case 'down': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <Wifi className="h-4 w-4" />
      case 'degraded': return <AlertCircle className="h-4 w-4" />
      case 'down': return <AlertCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  if (!systemHealth) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">System Health</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            {Object.entries({
              'API': systemHealth.api,
              'Blockchain': systemHealth.blockchain,
              'WebSocket': systemHealth.websocket,
              'Database': systemHealth.database
            }).map(([service, status]) => (
              <div key={service} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{service}</span>
                <div className={`flex items-center space-x-1 ${getStatusColor(status)}`}>
                  {getStatusIcon(status)}
                  <span className="text-sm capitalize">{status}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Block Height</span>
              <span className="text-sm font-mono">#{systemHealth.blockHeight}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Gas Price</span>
              <span className="text-sm">{parseFloat(systemHealth.gasPrice).toFixed(2)} Gwei</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">API Latency</span>
              <span className="text-sm">{systemHealth.latency.api}ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Chain Latency</span>
              <span className="text-sm">{systemHealth.latency.blockchain}ms</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Token performance component
function TopTokensCard() {
  const [topTokens, setTopTokens] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<'24h' | '7d'>('24h')

  useEffect(() => {
    const fetchTopTokens = async () => {
      setIsLoading(true)
      try {
        const response = await apiClient.getTrendingTokens(10)
        if (response.success && response.data) {
          setTopTokens(response.data.tokens)
        }
      } catch (err) {
        console.error('Failed to fetch top tokens:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTopTokens()
  }, [period])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Top Performers</CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={period === '24h' ? 'default' : 'ghost'}
              onClick={() => setPeriod('24h')}
            >
              24h
            </Button>
            <Button
              size="sm"
              variant={period === '7d' ? 'default' : 'ghost'}
              onClick={() => setPeriod('7d')}
            >
              7d
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topTokens.slice(0, 5).map((token, index) => (
            <div key={token.address} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                <div>
                  <p className="font-medium">{token.symbol}</p>
                  <p className="text-xs text-muted-foreground">{token.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium">${kFormatter(token.marketCap || 0)}</p>
                <p className={`text-xs flex items-center justify-end ${
                  token.priceChange24h >= 0 ? 'text-orange-500' : 'text-red-500'
                }`}>
                  {token.priceChange24h >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(token.priceChange24h || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function AnalyticsDashboard() {
  const { 
    platformStats, 
    isLoading, 
    error, 
    fetchPlatformStats,
    lastUpdated
  } = useAnalyticsStore()
  
  const { stats: treasuryStats, fetchStats: fetchTreasuryStats } = useTreasuryStore()
  const [selectedTimeframe, setSelectedTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('24h')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    const loadData = async () => {
      await fetchPlatformStats()
      await fetchTreasuryStats()
    }
    
    loadData()

    // Set up WebSocket listeners for real-time updates
    wsClient.on('platform:stats:updated', handleStatsUpdate)
    wsClient.on('token:created', handleTokenCreated)
    wsClient.on('token:graduated', handleTokenGraduated)
    
    // Refresh data every minute
    const interval = setInterval(loadData, 60000)
    
    return () => {
      wsClient.off('platform:stats:updated', handleStatsUpdate)
      wsClient.off('token:created', handleTokenCreated)
      wsClient.off('token:graduated', handleTokenGraduated)
      clearInterval(interval)
    }
  }, [fetchPlatformStats, fetchTreasuryStats])

  const handleStatsUpdate = (data: any) => {
    console.log('Platform stats updated:', data)
    fetchPlatformStats()
  }

  const handleTokenCreated = (data: any) => {
    console.log('New token created:', data)
    fetchPlatformStats()
  }

  const handleTokenGraduated = (data: any) => {
    console.log('Token graduated:', data)
    fetchPlatformStats()
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchPlatformStats()
    await fetchTreasuryStats()
    setIsRefreshing(false)
  }

  if (isLoading && !platformStats) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 text-primary mb-4 animate-spin" />
          <p className="text-lg font-medium">Loading analytics...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-lg font-medium">{error}</p>
          <Button className="mt-4" onClick={handleRefresh}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!platformStats) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium">No analytics data available</p>
          <Button className="mt-4" onClick={handleRefresh}>Refresh</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="text-xs">
            Live Data
          </Badge>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Last updated: {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${kFormatter(parseFloat(platformStats.totalVolume))}
            </div>
            <p className={`text-xs flex items-center ${
              platformStats.volumeChange24h >= 0 ? 'text-orange-500' : 'text-red-500'
            }`}>
              {platformStats.volumeChange24h >= 0 ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {Math.abs(platformStats.volumeChange24h).toFixed(1)}% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Created</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platformStats.tokensCreated.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              +{platformStats.tokensCreated24h} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Holders</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kFormatter(platformStats.totalHolders)}
            </div>
            <p className={`text-xs flex items-center ${
              platformStats.holdersChange24h >= 0 ? 'text-orange-500' : 'text-red-500'
            }`}>
              {platformStats.holdersChange24h >= 0 ? (
                <ArrowUp className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDown className="h-3 w-3 mr-1" />
              )}
              {Math.abs(platformStats.holdersChange24h).toFixed(1)}% change
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Graduated</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platformStats.graduated}
            </div>
            <p className="text-xs text-muted-foreground">
              +{platformStats.graduatedChange24h || 0} this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Second row metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Cap</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${kFormatter(parseFloat(platformStats.totalMarketCap))}
            </div>
            <p className="text-xs text-muted-foreground">
              Total platform value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Fees</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(parseFloat(platformStats.platformFees || '0'))} CORE
            </div>
            <p className="text-xs text-muted-foreground">
              Total collected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staked</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kFormatter(parseFloat(platformStats.totalStaked || '0'))} CMP
            </div>
            <p className="text-xs text-muted-foreground">
              {platformStats.activeStakers || 0} stakers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg APY</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(platformStats.averageAPY || 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Staking rewards
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SystemHealthCard />
        <TopTokensCard />
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Activity</CardTitle>
          <CardDescription>
            Real-time activity across the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTimeframe} onValueChange={(v) => setSelectedTimeframe(v as any)}>
            <TabsList>
              <TabsTrigger value="24h">24 Hours</TabsTrigger>
              <TabsTrigger value="7d">7 Days</TabsTrigger>
              <TabsTrigger value="30d">30 Days</TabsTrigger>
              <TabsTrigger value="all">All Time</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedTimeframe} className="mt-4">
              <div className="space-y-4">
                {/* Placeholder for activity chart */}
                <div className="h-64 bg-muted/50 rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Activity chart coming soon</p>
                </div>
                
                {/* Key insights */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Peak Hour</p>
                    <p className="text-lg font-semibold">2:00 PM UTC</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Avg TX/Hour</p>
                    <p className="text-lg font-semibold">1,234</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Active Users</p>
                    <p className="text-lg font-semibold">5,678</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                    <p className="text-lg font-semibold">99.8%</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}