'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth-store'
import { useWalletStore } from '@/lib/stores'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  User, 
  Wallet, 
  CreditCard, 
  LogOut, 
  Copy, 
  ExternalLink,
  Key
} from 'lucide-react'
import { formatNumber } from '@/lib/data-transform'

export function UserMenu() {
  const { user, logout, wallet } = useAuth()
  const { exportPrivateKey } = useWalletStore()
  const [showingKey, setShowingKey] = useState(false)

  if (!user) return null

  const handleCopyAddress = () => {
    if (user.walletAddress) {
      navigator.clipboard.writeText(user.walletAddress)
    }
  }

  const handleExportKey = async () => {
    // Redirect to Telegram bot for secure key export
    window.open('https://t.me/core_dot_fun_bot?start=export', '_blank')
    // Show message
    setShowingKey(true)
    setTimeout(() => setShowingKey(false), 3000)
  }

  const shortAddress = user.walletAddress 
    ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
    : 'No wallet'

  const tierColors = {
    FREE: 'bg-gray-100 text-gray-800',
    PREMIUM: 'bg-blue-100 text-blue-800',
    VIP: 'bg-purple-100 text-purple-800'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.photoUrl} alt={user.firstName} />
            <AvatarFallback>
              {user.firstName[0]}{user.lastName?.[0] || ''}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium leading-none">
                {user.firstName} {user.lastName}
              </p>
              <Badge className={tierColors[user.subscriptionTier]}>
                {user.subscriptionTier}
              </Badge>
            </div>
            {user.username && (
              <p className="text-xs text-muted-foreground">
                @{user.username}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        {/* Wallet Section */}
        <div className="p-2">
          <div className="flex items-center space-x-2 mb-2">
            <Wallet className="h-4 w-4" />
            <span className="text-sm font-medium">Wallet</span>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Address:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={handleCopyAddress}
              >
                <span className="text-xs">{shortAddress}</span>
                <Copy className="h-3 w-3 ml-1" />
              </Button>
            </div>
            
            {wallet && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">CORE:</span>
                  <span className="text-xs font-medium">
                    {formatNumber(parseFloat(wallet.coreBalance || '0'))}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Balance:</span>
                  <span className="text-xs font-medium">
                    ${formatNumber(parseFloat(wallet.balance || '0'))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleExportKey}>
          <Key className="mr-2 h-4 w-4" />
          {showingKey ? 'Opening Telegram...' : 'Export Key (via Telegram)'}
        </DropdownMenuItem>
        
        <DropdownMenuItem>
          <CreditCard className="mr-2 h-4 w-4" />
          Subscription
        </DropdownMenuItem>
        
        <DropdownMenuItem>
          <ExternalLink className="mr-2 h-4 w-4" />
          View on Explorer
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={logout} className="text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UserProfileCard() {
  const { user, wallet } = useAuth()

  if (!user) return null

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center space-x-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.photoUrl} alt={user.firstName} />
          <AvatarFallback>
            {user.firstName[0]}{user.lastName?.[0] || ''}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold">
              {user.firstName} {user.lastName}
            </h3>
            <Badge className="text-xs">
              {user.subscriptionTier}
            </Badge>
          </div>
          
          {user.username && (
            <p className="text-sm text-muted-foreground">
              @{user.username}
            </p>
          )}
          
          <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
            <span>CORE: {formatNumber(parseFloat(wallet?.coreBalance || '0'))}</span>
            <span>Balance: ${formatNumber(parseFloat(wallet?.balance || '0'))}</span>
          </div>
        </div>
      </div>
    </div>
  )
}