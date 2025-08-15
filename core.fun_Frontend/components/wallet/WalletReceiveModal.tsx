'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Check, QrCode, Wallet } from 'lucide-react'
import QRCode from 'qrcode'

interface WalletReceiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  address?: string
}

export function WalletReceiveModal({ open, onOpenChange, address: propAddress }: WalletReceiveModalProps) {
  const { user } = useAuthStore()
  const address = propAddress || user?.walletAddress || ''
  const [copied, setCopied] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')

  // Generate QR code when address changes
  useEffect(() => {
    if (address) {
      QRCode.toDataURL(address, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
        .then(url => setQrCodeUrl(url))
        .catch(err => console.error('Failed to generate QR code:', err))
    }
  }, [address])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Wallet className="w-5 h-5 mr-2" />
            Receive Funds
          </DialogTitle>
          <DialogDescription>
            Send CORE or tokens to your wallet address
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* QR Code */}
          <div className="flex justify-center">
            {qrCodeUrl ? (
              <div className="p-4 bg-white rounded-lg shadow-lg">
                <img 
                  src={qrCodeUrl} 
                  alt="Wallet Address QR Code"
                  className="w-48 h-48"
                />
              </div>
            ) : (
              <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/25">
                <div className="text-center">
                  <QrCode className="w-12 h-12 mx-auto mb-2 text-muted-foreground animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    Generating QR Code...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Wallet Address */}
          <div className="space-y-2">
            <Label>Your Wallet Address</Label>
            <div className="flex space-x-2">
              <Input
                value={address}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-orange-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {shortAddress} • Core Blockchain
            </p>
          </div>

          {/* Instructions */}
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm">Instructions:</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Copy your wallet address above</li>
              <li>• Send CORE or tokens to this address</li>
              <li>• Transactions usually take 1-2 minutes to confirm</li>
              <li>• Only send Core blockchain compatible tokens</li>
            </ul>
          </div>

          {/* Warning */}
          <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center mt-0.5 shrink-0">
                <span className="text-yellow-800 text-xs font-bold">!</span>
              </div>
              <div className="text-sm">
                <p className="font-medium text-yellow-800 mb-1">Important:</p>
                <p className="text-yellow-700">
                  Only send Core blockchain compatible assets to this address. 
                  Sending tokens from other blockchains may result in permanent loss.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}