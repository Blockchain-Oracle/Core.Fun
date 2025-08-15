"use client"

import * as React from "react"
import { useAuthStore, useWalletStore } from "@/lib/stores"
import {
  Download,
  Upload,
  Copy,
  ExternalLink,
  Key,
  History,
  Wallet as WalletIcon,
  Check
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatNumber } from "@/lib/data-transform"
import { WalletSendModal } from "@/components/wallet/WalletSendModal"
import { WalletReceiveModal } from "@/components/wallet/WalletReceiveModal"

export default function WalletManager() {
  const { user } = useAuthStore()
  const { coreBalance, usdBalance, transactions, refreshBalance, exportPrivateKey } = useWalletStore()
  const [showSendModal, setShowSendModal] = React.useState(false)
  const [showReceiveModal, setShowReceiveModal] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [exportedKey, setExportedKey] = React.useState(false)

  React.useEffect(() => {
    refreshBalance()
  }, [refreshBalance])

  const handleCopyAddress = async () => {
    if (user?.walletAddress) {
      await navigator.clipboard.writeText(user.walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleExportKey = () => {
    // Redirect to Telegram bot for secure key export
    window.open('https://t.me/core_dot_fun_bot?start=export', '_blank')
    setExportedKey(true)
    setTimeout(() => setExportedKey(false), 3000)
  }

  const openExplorer = () => {
    if (user?.walletAddress) {
      const explorerUrl = process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
        ? `https://scan.coredao.org/address/${user.walletAddress}`
        : `https://scan.test2.btcs.network/address/${user.walletAddress}`
      window.open(explorerUrl, '_blank')
    }
  }

  if (!user) {
    return (
      <Card className="bg-card/80 border-border/50">
        <CardContent className="p-12 text-center">
          <WalletIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Wallet Connected</h3>
          <p className="text-muted-foreground">Please login to view your wallet</p>
        </CardContent>
      </Card>
    )
  }

  const shortAddress = user.walletAddress 
    ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
    : 'No wallet'

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Wallet Card */}
        <div className="lg:col-span-2">
          <Card className="bg-card/80 border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <WalletIcon className="h-5 w-5 text-orange-400" />
                  Your Wallet
                </CardTitle>
                <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-400">
                  Core Blockchain
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Wallet Address */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Wallet Address</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted/50 rounded-lg font-mono text-sm">
                    {user.walletAddress}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyAddress}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-orange-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {shortAddress} • Use this address to receive CORE and tokens
                </p>
              </div>

              {/* Balance Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">CORE Balance</p>
                  <p className="text-2xl font-bold">{formatNumber(coreBalance)}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">USD Value</p>
                  <p className="text-2xl font-bold">${formatNumber(usdBalance)}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowReceiveModal(true)}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Receive
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowSendModal(true)}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Send
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleExportKey}
                  className="flex-1"
                >
                  <Key className="h-4 w-4 mr-2" />
                  {exportedKey ? 'Opening Telegram...' : 'Export Key via Telegram'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={openExplorer}
                  className="flex-1"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Explorer
                </Button>
              </div>

              {/* Recent Transactions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Recent Transactions</p>
                  <Button variant="ghost" size="sm">
                    <History className="h-4 w-4 mr-2" />
                    View All
                  </Button>
                </div>
                <div className="space-y-2">
                  {transactions.length > 0 ? (
                    transactions.slice(0, 5).map((tx) => (
                      <div key={tx.hash} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            tx.type === 'send' ? 'bg-red-500/20' : 'bg-orange-500/20'
                          }`}>
                            {tx.type === 'send' ? (
                              <Upload className="h-4 w-4 text-red-400" />
                            ) : (
                              <Download className="h-4 w-4 text-orange-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {tx.type === 'send' ? 'Sent' : 'Received'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {tx.type === 'send' ? '-' : '+'}{tx.value} CORE
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No transactions yet
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Card */}
        <div className="lg:col-span-1">
          <Card className="bg-card/80 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Wallet Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Network</span>
                  <Badge variant="outline">
                    {process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/30">
                    Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tier</span>
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                    {user.subscriptionTier}
                  </Badge>
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-medium">Total Value</p>
                <p className="text-3xl font-bold">${formatNumber(usdBalance)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatNumber(coreBalance)} CORE
                </p>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Your wallet is secured with AES-256 encryption. 
                  Always keep your private key safe and never share it with anyone.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <WalletSendModal 
        open={showSendModal}
        onOpenChange={setShowSendModal}
      />
      
      <WalletReceiveModal 
        open={showReceiveModal}
        onOpenChange={setShowReceiveModal}
      />
    </>
  )
}