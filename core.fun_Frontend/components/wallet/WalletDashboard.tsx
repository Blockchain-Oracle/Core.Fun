'use client'

import { useAuthStore, useWalletStore } from '@/lib/stores'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import { formatNumber } from '@/lib/data-transform'
import { useEffect } from 'react'

export function WalletDashboard() {
  const { user, isAuthenticated } = useAuthStore()
  const { coreBalance, usdBalance, transactions, refreshBalance } = useWalletStore()

  useEffect(() => {
    if (isAuthenticated) {
      refreshBalance()
    }
  }, [isAuthenticated, refreshBalance])

  if (!user) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Please login to view your wallet</p>
        </CardContent>
      </Card>
    )
  }

  // Calculate simple stats
  const totalSent = transactions
    .filter(tx => tx.type === 'send')
    .reduce((sum, tx) => sum + parseFloat(tx.value), 0)
  
  const totalReceived = transactions
    .filter(tx => tx.type === 'receive')
    .reduce((sum, tx) => sum + parseFloat(tx.value), 0)

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Balance Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(coreBalance)} CORE</div>
          <p className="text-xs text-muted-foreground">
            ≈ ${formatNumber(usdBalance)}
          </p>
        </CardContent>
      </Card>

      {/* Sent Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
          <TrendingUp className="h-4 w-4 text-red-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(totalSent)} CORE</div>
          <p className="text-xs text-muted-foreground">
            {transactions.filter(tx => tx.type === 'send').length} transactions
          </p>
        </CardContent>
      </Card>

      {/* Received Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Received</CardTitle>
          <TrendingDown className="h-4 w-4 text-orange-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(totalReceived)} CORE</div>
          <p className="text-xs text-muted-foreground">
            {transactions.filter(tx => tx.type === 'receive').length} transactions
          </p>
        </CardContent>
      </Card>
    </div>
  )
}