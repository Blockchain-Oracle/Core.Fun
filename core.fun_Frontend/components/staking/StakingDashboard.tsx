'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores'
import { useStakingStore } from '@/lib/stores/staking.store'
import { StakingStatus } from './StakingStatus'
import { StakingForm } from './StakingForm'
import { TierBenefits } from './TierBenefits'
import { StakingHistory } from './StakingHistory'
import { StakingStats } from './StakingStats'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function StakingDashboard() {
  const { user, isAuthenticated } = useAuthStore()
  const address = user?.walletAddress
  const isConnected = isAuthenticated
  const { 
    status, 
    tiers, 
    stats,
    history,
    isLoading, 
    error,
    fetchStatus,
    fetchTiers,
    fetchStats,
    fetchHistory,
    stake,
    unstake,
    claimRewards
  } = useStakingStore()

  useEffect(() => {
    // Fetch tiers and stats on mount
    fetchTiers()
    fetchStats()
  }, [fetchTiers, fetchStats])

  useEffect(() => {
    // Fetch user-specific data when address changes
    if (address) {
      fetchStatus(address)
      fetchHistory(address)
    }
  }, [address, fetchStatus, fetchHistory])

  if (!isConnected) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
        <p className="text-muted-foreground">
          Please connect your wallet to access staking features
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Platform Stats */}
      <StakingStats stats={stats} isLoading={isLoading} />

      {/* User Staking Status */}
      <StakingStatus 
        status={status} 
        isLoading={isLoading}
        onClaim={claimRewards}
      />

      {/* Main Content Tabs */}
      <Tabs defaultValue="stake" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stake">Stake</TabsTrigger>
          <TabsTrigger value="tiers">Tier Benefits</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="stake" className="mt-6">
          <StakingForm
            currentStaked={status?.stakedAmount || '0'}
            isLoading={isLoading}
            onStake={stake}
            onUnstake={unstake}
            canUnstake={status?.canUnstake || false}
            cooldownEnd={status?.cooldownEnd}
          />
        </TabsContent>

        <TabsContent value="tiers" className="mt-6">
          <TierBenefits 
            tiers={tiers} 
            currentTier={status?.tier}
            currentStaked={parseFloat(status?.stakedAmount || '0')}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <StakingHistory 
            history={history}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}