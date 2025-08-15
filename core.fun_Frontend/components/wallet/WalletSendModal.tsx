'use client'

import { useState } from 'react'
import { useWalletStore } from '@/lib/stores'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Send, AlertTriangle } from 'lucide-react'

interface WalletSendModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WalletSendModal({ open, onOpenChange }: WalletSendModalProps) {
  const { coreBalance, sendToken } = useWalletStore()
  const [recipientAddress, setRecipientAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [tokenAddress, setTokenAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSend = async () => {
    if (!recipientAddress || !amount) {
      setError('Please fill in all required fields')
      return
    }

    // Basic address validation
    if (!recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setError('Invalid recipient address')
      return
    }

    // Amount validation
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await sendToken(
        recipientAddress, 
        amount, 
        tokenAddress || undefined
      )

      if (result.success && result.hash) {
        setSuccess(`Transaction sent successfully! Hash: ${result.hash}`)
        // Reset form
        setRecipientAddress('')
        setAmount('')
        setTokenAddress('')
      } else {
        setError(result.error || 'Transaction failed. Please try again.')
      }
    } catch (err) {
      setError('Transaction failed. Please check your inputs and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setRecipientAddress('')
    setAmount('')
    setTokenAddress('')
    setError(null)
    setSuccess(null)
    onOpenChange(false)
  }

  const balance = parseFloat(coreBalance || '0')
  const hasInsufficientBalance = parseFloat(amount || '0') > balance

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Send className="w-5 h-5 mr-2" />
            Send Transaction
          </DialogTitle>
          <DialogDescription>
            Send CORE or tokens to another address
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient Address */}
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address *</Label>
            <Input
              id="recipient"
              placeholder="0x..."
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                step="any"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                CORE
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Available: {balance.toFixed(6)} CORE
            </p>
            {hasInsufficientBalance && amount && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Insufficient balance for this transaction
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Token Address (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="token">Token Address (Optional)</Label>
            <Input
              id="token"
              placeholder="0x... (leave empty for CORE)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to send native CORE tokens
            </p>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-orange-200 bg-orange-50 text-orange-800">
              <AlertDescription className="break-all">{success}</AlertDescription>
            </Alert>
          )}

          {/* Transaction Warning */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Double-check the recipient address. 
              Transactions on the blockchain are irreversible.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || !recipientAddress || !amount || hasInsufficientBalance}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Transaction
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}