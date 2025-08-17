'use client'

import { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuthStore, useWalletStore, useTradingStore } from '@/lib/stores'
import { UserMenu } from '@/components/auth/UserMenu'
import { LoginButton } from '@/components/auth/LoginButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/data-transform'
import { Wallet, ChevronDown, Search, Menu } from 'lucide-react'
import { AuroraText } from '@/components/magicui/aurora-text'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface HeaderBaseProps {
  title?: ReactNode
  leftContent?: ReactNode
  centerContent?: ReactNode
  rightContent?: ReactNode
  showSearch?: boolean
  showBuyButton?: boolean
  showWalletBalance?: boolean
  className?: string
}

export function HeaderBase({
  title,
  leftContent,
  centerContent,
  rightContent,
  showSearch = true,
  showBuyButton = true,
  showWalletBalance = true,
  className = ''
}: HeaderBaseProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const { coreBalance } = useWalletStore()
  const { settings } = useTradingStore()

  const handleBuyQuick = () => {
    const amount = window.prompt('Enter CORE amount to buy', settings?.defaultBuyAmount || '0.1')
    if (!amount) return
    try {
      // Navigate to wallet page with buy amount parameter
      window.location.href = `/wallet?action=buy&amount=${encodeURIComponent(amount)}`
    } catch (_) {
      console.error('Failed to navigate to wallet page')
    }
  }

  return (
    <header className={`sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-white/5 bg-black/60 px-3 backdrop-blur md:px-4 lg:px-6 ${className}`}>
      {/* Mobile menu */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[86vw] sm:w-[380px] bg-black/90 text-white">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Image 
                src="/Core.FunLogo.png" 
                alt="Core.Fun" 
                width={24} 
                height={24} 
                className="object-contain"
              />
              <span className="text-orange-400">core.fun</span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {showSearch && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                <Input placeholder="Search tokens..." className="w-full bg-white/5 pl-9 placeholder:text-white/40" />
              </div>
            )}
            
            {isAuthenticated && user && (
              <div className="space-y-2 p-4 bg-white/5 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Wallet</span>
                  <span className="text-sm font-medium">
                    {user.walletAddress?.slice(0, 6)}...{user.walletAddress?.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Balance</span>
                  <span className="text-sm font-medium">
                    {formatNumber(coreBalance)} CORE
                  </span>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Logo and left content */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Image 
            src="/Core.FunLogo.png" 
            alt="Core.Fun" 
            width={32} 
            height={32} 
            className="object-contain"
          />
          <span className="text-orange-400 font-bold hidden sm:inline">core.fun</span>
        </Link>
        {leftContent && (
          <div className="flex items-center gap-2">
            {leftContent}
          </div>
        )}
      </div>

      {/* Center content */}
      {centerContent ? (
        <div className="flex-1">{centerContent}</div>
      ) : showSearch ? (
        <div className="mx-2 hidden flex-1 items-center gap-2 md:flex">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="Search tokens, addresses..."
              className="w-full bg-white/5 pl-9 placeholder:text-white/40"
              onKeyDown={(e) => {
                const input = e.currentTarget as HTMLInputElement
                if (e.key === 'Enter' && input.value.trim()) {
                  window.location.href = `/explore?search=${encodeURIComponent(input.value.trim())}`
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Right content */}
      <div className="ml-auto flex items-center gap-2">
        {rightContent}
        
        {/* Common right elements */}
        {isAuthenticated ? (
          <>
            
            {showWalletBalance && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                <Wallet className="h-3 w-3 mr-1" />
                {formatNumber(coreBalance)} CORE
              </Badge>
            )}
            
            <UserMenu />
          </>
        ) : (
          <LoginButton />
        )}
      </div>
    </header>
  )
}