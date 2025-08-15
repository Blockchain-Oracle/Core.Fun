"use client"

import { useEffect } from "react"
import { usePortfolioStore, useWalletStore, useAuthStore } from "@/lib/stores"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, TrendingUp, TrendingDown, Wallet, ArrowRight } from "lucide-react"
import { formatNumber } from "@/lib/data-transform"
import Link from "next/link"

export default function PortfolioPage() {
  const { isAuthenticated } = useAuthStore()
  const { coreBalance, usdBalance } = useWalletStore()
  const {
    holdings,
    totalValue,
    totalPnL,
    pnlPercentage,
    isLoading,
    fetchPortfolio
  } = usePortfolioStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchPortfolio()
    }
  }, [isAuthenticated, fetchPortfolio])

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 text-center">
        <h2 className="text-2xl font-semibold">Portfolio</h2>
        <p className="text-white/70">Please connect your wallet to view your portfolio.</p>
        <Link href="/wallet">
          <Button className="mt-4">
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl flex items-center justify-center h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-400" />
          <p className="mt-4 text-white/60">Loading portfolio...</p>
        </div>
      </div>
    )
  }

  const isProfitable = totalPnL >= 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Portfolio</h2>
        <p className="text-white/70">Track your Core blockchain token holdings and performance.</p>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-black/40 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/60">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatNumber(coreBalance)} CORE</div>
            <div className="text-sm text-white/50">${formatNumber(usdBalance)}</div>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/60">Total P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isProfitable ? 'text-orange-400' : 'text-red-400'}`}>
              {isProfitable ? '+' : ''}{formatNumber(totalPnL)} CORE
            </div>
            <div className={`text-sm flex items-center gap-1 ${isProfitable ? 'text-orange-400' : 'text-red-400'}`}>
              {isProfitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(pnlPercentage).toFixed(2)}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-black/40 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/60">Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{holdings.length}</div>
            <div className="text-sm text-white/50">Active positions</div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings List */}
      <Card className="bg-black/40 border-white/10">
        <CardHeader>
          <CardTitle>Your Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-white/60 mb-4">You don't have any token holdings yet.</p>
              <Link href="/explore">
                <Button>
                  Explore Tokens
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {holdings.map((holding) => {
                const isProfitable = holding.pnl >= 0
                return (
                  <div
                    key={holding.tokenAddress}
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium text-white">{holding.tokenSymbol}</div>
                        <div className="text-sm text-white/50">{holding.tokenName}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm text-white/60">Balance</div>
                        <div className="font-medium text-white">{formatNumber(holding.balance)}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm text-white/60">Value</div>
                        <div className="font-medium text-white">{formatNumber(holding.value)} CORE</div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm text-white/60">P&L</div>
                        <div className={`font-medium ${isProfitable ? 'text-orange-400' : 'text-red-400'}`}>
                          {isProfitable ? '+' : ''}{formatNumber(holding.pnl)} CORE
                        </div>
                        <div className={`text-xs flex items-center gap-1 ${isProfitable ? 'text-orange-400' : 'text-red-400'}`}>
                          {isProfitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(holding.pnlPercentage).toFixed(2)}%
                        </div>
                      </div>

                      <Link href={`/token/${holding.tokenAddress}`}>
                        <Button size="sm" variant="outline">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
