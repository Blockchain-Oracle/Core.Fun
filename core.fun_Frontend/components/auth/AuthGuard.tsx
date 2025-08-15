'use client'

import { useAuthStore } from '@/lib/stores'
import { LoginButton } from './LoginButton'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  requireAuth?: boolean
}

export function AuthGuard({ 
  children, 
  fallback, 
  requireAuth = true 
}: AuthGuardProps) {
  const { isAuthenticated, initializeAuth } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      await initializeAuth()
      setIsLoading(false)
    }
    init()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (requireAuth && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        {fallback || (
          <>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
              <p className="text-muted-foreground">
                Please connect your Telegram account to continue
              </p>
            </div>
            <LoginButton />
          </>
        )}
      </div>
    )
  }

  return <>{children}</>
}

// Wrapper for pages that require authentication
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    fallback?: React.ReactNode
  }
) {
  return function AuthenticatedComponent(props: P) {
    return (
      <AuthGuard fallback={options?.fallback}>
        <Component {...props} />
      </AuthGuard>
    )
  }
}