'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowDownUp, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Loader2,
  Info,
  Zap,
  Check,
  ExternalLink,
  Send
} from 'lucide-react'
import { useAuthStore, useTreasuryStore } from '@/lib/stores'
import { apiClient } from '@/lib/api'
import { formatNumber } from '@/lib/data-transform'
import { Separator } from '@/components/ui/separator'

interface TradingPanelProps {
  tokenAddress: string
  tokenSymbol: string
  currentSold: number
  currentRaised: number
  isLaunched: boolean
}

export function TradingPanel({
  tokenAddress,
  tokenSymbol,
  currentSold,
  currentRaised,
  isLaunched
}: TradingPanelProps) {
  const { session, isAuthenticated, user } = useAuthStore()
  // Staking removed from platform
  const { calculateFee } = useTreasuryStore()
  
  // Check if running in Telegram WebApp
  const isTelegramWebApp = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp
  
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(5)
  const [quote, setQuote] = useState<{
    expectedAmount: string
    priceImpact: number
    rate: number
  } | null>(null)
  const [gasEstimate, setGasEstimate] = useState<{
    gasLimit: string
    gasPrice: string
    totalCost: string
  } | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [insufficientReason, setInsufficientReason] = useState<string | null>(null)

  // Fetch quote and gas estimate when amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setQuote(null)
        setGasEstimate(null)
        return
      }

      setIsLoadingQuote(true)
      setError(null)

      try {
        // Fetch quote
        let result
        if (tradeType === 'buy') {
          result = await apiClient.calculateBuyReturn(tokenAddress, amount)
        } else {
          result = await apiClient.calculateSellReturn(tokenAddress, amount)
        }
        console.log('[TradingPanel] Quote result:', result)

        if (result.success) {
          // Calculate price impact based on bonding curve
          const inputAmount = parseFloat(amount)
          const outputAmount = parseFloat(tradeType === 'buy' ? (result as any).tokenAmount : (result as any).coreAmount)
          const spotPrice = currentRaised > 0 ? currentSold / currentRaised : 1
          const executionPrice = tradeType === 'buy' ? inputAmount / outputAmount : outputAmount / inputAmount
          const priceImpact = Math.abs((executionPrice - spotPrice) / spotPrice) * 100
          
          setQuote({
            expectedAmount: tradeType === 'buy' ? (result as any).tokenAmount : (result as any).coreAmount,
            priceImpact: isNaN(priceImpact) ? 0 : priceImpact,
            rate: (result as any).rate
          })
        } else {
          setError((result as any).error || 'Failed to get quote')
        }
        
        // Fetch gas estimate
        try {
          const gasResult = await apiClient.estimateGas({
            type: tradeType === 'buy' ? 'buyToken' : 'sellToken',
            params: tradeType === 'buy' 
              ? { tokenAddress, coreAmount: amount }
              : { tokenAddress, tokenAmount: amount }
          })
          console.log('[TradingPanel] Gas estimate:', gasResult)
          if (gasResult.success) {
            setGasEstimate({
              gasLimit: (gasResult as any).gasLimit,
              gasPrice: (gasResult as any).gasPrice,
              totalCost: (gasResult as any).totalCost
            })
          }
        } catch (e) {
          console.warn('[TradingPanel] Gas estimate failed (possibly unauthenticated):', e)
        }
      } catch (err) {
        console.error('[TradingPanel] Failed to fetch quote:', err)
        setError('Failed to fetch quote')
      } finally {
        setIsLoadingQuote(false)
      }
    }

    const timer = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timer)
  }, [amount, tradeType, tokenAddress, currentSold, currentRaised])

  // Pre-validate balance and disable action if insufficient
  useEffect(() => {
    const validateBalance = async () => {
      setInsufficientReason(null)
      if (!isAuthenticated) return
      if (!amount || parseFloat(amount) <= 0) return
      try {
        const walletInfo = await apiClient.getWalletInfo()
        console.log('[TradingPanel] Wallet info:', walletInfo)
        if (walletInfo.success) {
          const tradeAmount = parseFloat(amount)
          // Fix: Access balance from data object
          const userCoreBalance = parseFloat(walletInfo.data?.coreBalance || walletInfo.coreBalance || '0')

          if (tradeType === 'buy') {
            if (userCoreBalance < tradeAmount) {
              setInsufficientReason(`Insufficient CORE. You have ${userCoreBalance.toFixed(4)} CORE`)
              return
            }
            const requiredBalance = tradeAmount * 1.1
            if (userCoreBalance < requiredBalance) {
              setInsufficientReason(`Not enough for gas. Need ~${requiredBalance.toFixed(4)} CORE`)
              return
            }
          } else {
            // Fix: Access tokenBalances from data object
            const tokenBalances = walletInfo.data?.tokenBalances || walletInfo.tokenBalances || []
            const tokenBalance = tokenBalances.find((t: any) =>
              (t.token || '').toLowerCase() === tokenAddress.toLowerCase()
            )
            const userTokenBalance = parseFloat(tokenBalance?.balance || '0')
            if (userTokenBalance < tradeAmount) {
              setInsufficientReason(`Insufficient tokens. You have ${userTokenBalance.toFixed(4)}`)
              return
            }
          }
        }
      } catch (e) {
        console.warn('[TradingPanel] Balance validation failed:', e)
      }
    }
    validateBalance()
  }, [isAuthenticated, amount, tradeType, tokenAddress])

  const handleTrade = async () => {
    if (!isAuthenticated) {
      setError('Please connect your wallet first')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    // Balance validation
    try {
      const walletInfo = await apiClient.getWalletInfo()
      console.log('[TradingPanel] handleTrade walletInfo:', walletInfo)
      if (walletInfo.success) {
        // Fix: Access balance from data object
        const userCoreBalance = parseFloat(walletInfo.data?.coreBalance || walletInfo.coreBalance || '0')
        const tradeAmount = parseFloat(amount)
        
        if (tradeType === 'buy') {
          // Check if user has enough CORE for buy order
          if (userCoreBalance < tradeAmount) {
            setError(`Insufficient balance. You have ${userCoreBalance.toFixed(4)} CORE but need ${tradeAmount} CORE`)
            return
          }
          
          // Add 10% buffer for gas fees
          const requiredBalance = tradeAmount * 1.1
          if (userCoreBalance < requiredBalance) {
            setError(`Insufficient balance for gas fees. You need at least ${requiredBalance.toFixed(4)} CORE (including gas)`)
            return
          }
        } else {
          // For sell orders, check token balance
          const tokenBalance = walletInfo.tokenBalances?.find((t) => 
            (t.token || '').toLowerCase() === tokenAddress.toLowerCase()
          )
          const userTokenBalance = parseFloat(tokenBalance?.balance || '0')
          
          if (userTokenBalance < tradeAmount) {
            setError(`Insufficient token balance. You have ${userTokenBalance.toFixed(4)} tokens but need ${tradeAmount}`)
            return
          }
        }
      }
    } catch (err) {
      console.warn('Failed to check balance, proceeding with trade:', err)
    }

    setIsExecuting(true)
    setError(null)
    setSuccess(null)
    setTxHash(null)

    try {
      let result
      if (tradeType === 'buy') {
        console.log('[TradingPanel] Executing BUY', { tokenAddress, amount })
        result = await apiClient.buyToken(tokenAddress, amount)
      } else {
        console.log('[TradingPanel] Executing SELL', { tokenAddress, amount })
        result = await apiClient.sellToken(tokenAddress, amount)
      }

      if (result.success) {
        const tokenAmount = quote?.expectedAmount || '0'
        const successMessage = tradeType === 'buy' 
          ? `Successfully bought ${parseFloat(tokenAmount).toFixed(2)} ${tokenSymbol} for ${amount} CORE!`
          : `Successfully sold ${amount} ${tokenSymbol} for ${tokenAmount} CORE!`
        setSuccess(successMessage)
        setTxHash((result as any).txHash)
        setAmount('')
        setQuote(null)
        
        // Clear success message after 10 seconds
        setTimeout(() => {
          setSuccess(null)
          setTxHash(null)
        }, 10000)
      } else {
        setError((result as any).error || 'Transaction failed')
      }
    } catch (err) {
      console.error('[TradingPanel] Transaction error:', err)
      setError('Transaction failed. Please try again.')
    } finally {
      setIsExecuting(false)
    }
  }

  const handlePercentageClick = (percentage: number) => {
    // TODO: Implement percentage calculation based on user balance
    // For now, just set some example amounts
    if (tradeType === 'buy') {
      const exampleAmounts = { 25: '0.25', 50: '0.5', 75: '0.75', 100: '1' }
      setAmount(exampleAmounts[percentage as keyof typeof exampleAmounts] || '0.1')
    } else {
      const exampleAmounts = { 25: '250', 50: '500', 75: '750', 100: '1000' }
      setAmount(exampleAmounts[percentage as keyof typeof exampleAmounts] || '100')
    }
  }

  const progress = (currentSold / 500000) * 100 // 500K token graduation limit

  if (isLaunched) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <Zap className="h-4 w-4" />
            <AlertDescription>
              This token has graduated! Trade it on DEX instead.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Show Telegram trading prompt for web users
  if (!isTelegramWebApp) {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'core_dot_fun_bot'
    // Pre-fill the message with the token address - the bot will auto-detect and show token preview
    const deepLink = `https://t.me/${botUsername}?text=${encodeURIComponent(tokenAddress)}`
    
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trade {tokenSymbol}</CardTitle>
            <Badge variant="outline" className="text-xs">
              Telegram Only
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-orange-500/10 border-orange-500/30">
            <Send className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">Trading is currently available on Telegram only</p>
              <p className="text-sm text-white/60">
                Web trading is coming soon! For now, trade this token directly in our Telegram bot.
              </p>
            </AlertDescription>
          </Alert>
          
          <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Token Address</span>
              <code className="text-xs">{tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}</code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Current Price</span>
              <span>{(currentRaised / currentSold).toFixed(6)} CORE</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Progress to Graduation</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
          </div>
          
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 rounded-lg transition-all transform hover:scale-[1.02]"
          >
            <Send className="h-5 w-5" />
            <span className="font-medium">Trade on Telegram</span>
            <ExternalLink className="h-4 w-4" />
          </a>
          
          <p className="text-xs text-center text-white/40">
            Open in Telegram to buy or sell {tokenSymbol} tokens
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Trade {tokenSymbol}</CardTitle>
          <Badge variant="outline" className="text-xs">
            Bonding Curve
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tradeType} onValueChange={(v) => setTradeType(v as 'buy' | 'sell')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className="data-[state=active]:bg-orange-500/20">
              <TrendingUp className="h-4 w-4 mr-2" />
              Buy
            </TabsTrigger>
            <TabsTrigger value="sell" className="data-[state=active]:bg-red-500/20">
              <TrendingDown className="h-4 w-4 mr-2" />
              Sell
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tradeType} className="space-y-4">
            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount">
                {tradeType === 'buy' ? 'CORE Amount' : 'Token Amount'}
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isExecuting}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60">
                  {tradeType === 'buy' ? 'CORE' : tokenSymbol}
                </span>
              </div>
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePercentageClick(pct)}
                  disabled={isExecuting}
                  className="flex-1"
                >
                  {pct}%
                </Button>
              ))}
            </div>

            {/* Quote Display */}
            {quote && !isLoadingQuote && (
              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">You will receive</span>
                  <span className="font-medium">
                    {tradeType === 'buy' 
                      ? `${formatNumber(parseFloat(quote.expectedAmount || '0'))} ${tokenSymbol}`
                      : `${formatNumber(parseFloat(quote.expectedAmount || '0'))} CORE`
                    }
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Rate</span>
                  <span>{quote.rate.toFixed(6)} {tradeType === 'buy' ? `${tokenSymbol}/CORE` : `CORE/${tokenSymbol}`}</span>
                </div>
                {quote.priceImpact > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Price impact</span>
                    <span className={quote.priceImpact > 5 ? 'text-orange-400' : ''}>
                      {quote.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Platform fee (1%)</span>
                  <span>{(parseFloat(amount || '0') * 0.01).toFixed(6)} CORE</span>
                </div>
                {gasEstimate && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Estimated gas</span>
                      <span>{formatNumber(parseFloat(gasEstimate.totalCost))} CORE</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-white/80">Total cost</span>
                      <span>
                        {formatNumber(
                          parseFloat(amount || '0') + 
                          (parseFloat(amount || '0') * 0.01) +
                          parseFloat(gasEstimate.totalCost)
                        )} CORE
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {isLoadingQuote && amount && parseFloat(amount) > 0 && (
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-center mb-2">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-white/60">Calculating best price...</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/5 rounded h-2 animate-pulse" />
                  <div className="bg-white/5 rounded h-2 animate-pulse" />
                  <div className="bg-white/5 rounded h-2 animate-pulse" />
                </div>
              </div>
            )}

            {/* Slippage Settings */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Slippage Tolerance</Label>
                <span className="text-sm text-white/60">{slippage}%</span>
              </div>
              <Slider
                value={[slippage]}
                onValueChange={([v]) => setSlippage(v)}
                min={0.1}
                max={20}
                step={0.1}
                disabled={isExecuting}
              />
            </div>

            {/* Warnings */}
            {quote && quote.priceImpact > 10 && (
              <Alert className="bg-orange-500/10 border-orange-500/30">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  High price impact! Consider reducing your trade size.
                </AlertDescription>
              </Alert>
            )}

            {/* Error/Success Messages */}
            {insufficientReason && !error && (
              <Alert className="bg-yellow-500/10 border-yellow-500/30">
                <Info className="h-4 w-4" />
                <AlertDescription>{insufficientReason}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-500/10 border-green-500/30">
                <Check className="h-4 w-4 text-green-400" />
                <AlertDescription className="flex flex-col gap-2">
                  <span className="font-medium">{success}</span>
                  {txHash && (
                    <a 
                      href={`https://scan.test.btcs.network/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-400 hover:text-green-300 underline flex items-center gap-1"
                    >
                      View transaction
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Trade Button */}
            <Button
              onClick={handleTrade}
              disabled={!isAuthenticated || isExecuting || !quote || !amount || !!insufficientReason}
              className="w-full"
              size="lg"
            >
              {isExecuting ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Processing Transaction...</span>
                  </div>
                  <span className="text-xs opacity-70">Please wait, this may take a moment</span>
                </div>
              ) : !isAuthenticated ? (
                'Connect Wallet'
              ) : !amount || parseFloat(amount) <= 0 ? (
                'Enter Amount'
              ) : isLoadingQuote ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Getting Quote...
                </>
              ) : insufficientReason ? (
                'Insufficient Balance'
              ) : (
                <>
                  {tradeType === 'buy' ? (
                    <TrendingUp className="h-4 w-4 mr-2" />
                  ) : (
                    <TrendingDown className="h-4 w-4 mr-2" />
                  )}
                  {tradeType === 'buy' ? 'Buy' : 'Sell'} {tokenSymbol}
                </>
              )}
            </Button>

            {/* Info */}
            <div className="text-xs text-white/40 text-center">
              Progress: {progress.toFixed(1)}% to graduation
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default TradingPanel