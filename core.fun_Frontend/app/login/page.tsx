'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth-store'
import { LoginButton } from '@/components/auth/LoginButton'

export default function LoginPage() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated) router.replace('/explore')
  }, [isAuthenticated, router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-bold">Login with Telegram</h1>
        <p className="text-muted-foreground">Connect your Telegram to continue.</p>
        <div className="flex justify-center">
          <LoginButton />
        </div>
      </div>
    </div>
  )
} 