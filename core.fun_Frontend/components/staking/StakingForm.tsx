'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, AlertTriangle, Lock, TrendingUp, TrendingDown } from 'lucide-react'
import { formatTokenAmount } from '@/lib/api-client'

interface StakingFormProps {
  currentStaked: string
  isLoading: boolean
  onStake: (amount: string) => Promise<void>
  onUnstake: (amount: string) => Promise<void>
  canUnstake: boolean
  cooldownEnd?: Date
}

export function StakingForm({
  currentStaked,
  isLoading,
  onStake,
  onUnstake,
  canUnstake,
  cooldownEnd
}: StakingFormProps) {
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [isStaking, setIsStaking] = useState(false)
  const [isUnstaking, setIsUnstaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStake = async () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setError(null)
    setIsStaking(true)
    try {
      await onStake(stakeAmount)
      setStakeAmount('')
    } catch (err: any) {
      setError(err.message || 'Failed to stake tokens')
    } finally {
      setIsStaking(false)
    }
  }

  const handleUnstake = async () => {
    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (parseFloat(unstakeAmount) > parseFloat(currentStaked)) {
      setError('Insufficient staked balance')
      return
    }

    setError(null)
    setIsUnstaking(true)
    try {
      await onUnstake(unstakeAmount)
      setUnstakeAmount('')
    } catch (err: any) {
      setError(err.message || 'Failed to unstake tokens')
    } finally {
      setIsUnstaking(false)
    }
  }

  const setMaxStake = () => {
    // This would need to fetch the user's wallet balance
    // For now, we'll leave it as a placeholder
    setError('Please enter amount manually')
  }

  const setMaxUnstake = () => {
    setUnstakeAmount(currentStaked)
  }

  const isInCooldown = cooldownEnd && new Date(cooldownEnd) > new Date()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Your Stake</CardTitle>
        <CardDescription>
          Stake CMP tokens to unlock tier benefits and earn rewards
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="stake" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stake">
              <TrendingUp className="h-4 w-4 mr-2" />
              Stake
            </TabsTrigger>
            <TabsTrigger value="unstake" disabled={!canUnstake}>
              <TrendingDown className="h-4 w-4 mr-2" />
              Unstake
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stake" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="stake-amount">Amount to Stake</Label>
              <div className="flex space-x-2">
                <Input
                  id="stake-amount"
                  type="number"
                  placeholder="0.0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  disabled={isStaking || isLoading}
                />
                <Button
                  variant="outline"
                  onClick={setMaxStake}
                  disabled={isStaking || isLoading}
                >
                  MAX
                </Button>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currently Staked:</span>
                <span className="font-medium">{formatTokenAmount(currentStaked)} CMP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">After Staking:</span>
                <span className="font-medium">
                  {formatTokenAmount(
                    (parseFloat(currentStaked) + parseFloat(stakeAmount || '0')).toString()
                  )} CMP
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleStake}
              disabled={isStaking || isLoading || !stakeAmount}
            >
              {isStaking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Staking...
                </>
              ) : (
                'Stake Tokens'
              )}
            </Button>
          </TabsContent>

          <TabsContent value="unstake" className="space-y-4 mt-4">
            {isInCooldown ? (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  Unstaking is in cooldown until {new Date(cooldownEnd!).toLocaleString()}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="unstake-amount">Amount to Unstake</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="unstake-amount"
                      type="number"
                      placeholder="0.0"
                      value={unstakeAmount}
                      onChange={(e) => setUnstakeAmount(e.target.value)}
                      disabled={isUnstaking || isLoading || !canUnstake}
                    />
                    <Button
                      variant="outline"
                      onClick={setMaxUnstake}
                      disabled={isUnstaking || isLoading || !canUnstake}
                    >
                      MAX
                    </Button>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Currently Staked:</span>
                    <span className="font-medium">{formatTokenAmount(currentStaked)} CMP</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">After Unstaking:</span>
                    <span className="font-medium">
                      {formatTokenAmount(
                        Math.max(0, parseFloat(currentStaked) - parseFloat(unstakeAmount || '0')).toString()
                      )} CMP
                    </span>
                  </div>
                </div>

                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Unstaking will reset your tier benefits and may trigger a cooldown period
                  </AlertDescription>
                </Alert>

                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={handleUnstake}
                  disabled={isUnstaking || isLoading || !unstakeAmount || !canUnstake}
                >
                  {isUnstaking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Unstaking...
                    </>
                  ) : (
                    'Unstake Tokens'
                  )}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}