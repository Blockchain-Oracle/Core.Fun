"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import WalletManager from "@/components/features/wallet-manager"
import { useTradingStore } from "@/lib/stores"

export default function WalletPage() {
  const params = useSearchParams()
  const { updateSettings, settings } = useTradingStore()

  useEffect(() => {
    const buyAmount = params.get('buyAmount')
    if (buyAmount && buyAmount !== settings.defaultBuyAmount) {
      updateSettings({ defaultBuyAmount: buyAmount })
    }
  }, [params])

  return (
    <div className="container mx-auto max-w-7xl p-4 lg:p-6">
      <WalletManager />
    </div>
  )
}