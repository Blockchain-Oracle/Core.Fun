"use client"

import { HeaderBase } from '../HeaderBase'
import { Button } from "@/components/ui/button"
import { Download, History, Wallet as WalletIcon } from "lucide-react"
import { useWalletStore } from '@/lib/stores'
import { useState } from 'react'
import { WalletReceiveModal } from '@/components/wallet/WalletReceiveModal'

export default function WalletTopbar() {
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const { } = useWalletStore()

  // Private key export removed - now only available in Telegram bot

  const leftContent = (
    <div className="flex items-center gap-2">
      <WalletIcon className="h-5 w-5 text-orange-400" />
      <span className="text-lg font-semibold tracking-tight text-white">Wallet</span>
    </div>
  )

  const rightContent = (
    <>
      {/* Quick actions */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="gap-2"
        onClick={() => setShowReceiveModal(true)}
      >
        <Download className="h-4 w-4" /> 
        Receive
      </Button>
      
      {/* Send button removed - send features removed from platform */}
      
      {/* Export Key button removed - now only available in Telegram bot */}
      
      <Button 
        variant="ghost" 
        size="sm" 
        className="gap-2"
      >
        <History className="h-4 w-4" /> 
        History
      </Button>
    </>
  )

  return (
    <>
      <HeaderBase 
        leftContent={leftContent}
        rightContent={rightContent}
        showSearch={false}
      />
      
      <WalletReceiveModal 
        open={showReceiveModal}
        onOpenChange={setShowReceiveModal}
      />
    </>
  )
}