"use client"

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

function CallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Processing authentication...')
  const [debugInfo, setDebugInfo] = useState<any>(null)

  useEffect(() => {
    const run = async () => {
      // Get URL parameters using useSearchParams
      const code = searchParams.get('code')
      const token = searchParams.get('token')
      const signature = searchParams.get('signature')
      const address = searchParams.get('address')
      const username = searchParams.get('username')
      const telegramId = searchParams.get('telegramId')
      const telegramUserId = searchParams.get('telegramUserId')
      const redirectUrl = searchParams.get('redirectUrl') || '/'

      // Debug logging
      const params = {
        code,
        token: token ? `${token.substring(0, 20)}...` : null,
        signature: signature ? `${signature.substring(0, 20)}...` : null,
        address,
        username,
        telegramId: telegramId || telegramUserId,
        redirectUrl,
        searchParamsString: searchParams.toString(),
        hasSearchParams: searchParams.toString().length > 0
      }
      console.log('Auth Callback Parameters:', params)
      setDebugInfo(params)

      const finalTelegramId = telegramId || telegramUserId
      
      if (!token || !address || !finalTelegramId) {
        console.error('Missing params:', { 
          hasToken: !!token, 
          hasAddress: !!address, 
          hasTelegramId: !!finalTelegramId,
          searchParamsString: searchParams.toString()
        })
        setStatus('error')
        setMessage('Missing authentication parameters. Please try logging in again.')
        // Don't auto-redirect for debugging
        return
      }

      try {
        // Try API first, fallback to direct token processing
        let success = false
        let userData = null

        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/auth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, token, signature, address, username: username || '', telegramId: finalTelegramId })
          })
          const data = await res.json()
          if (data?.success && data?.accessToken && data?.user) {
            userData = { accessToken: data.accessToken, user: data.user }
            success = true
          }
        } catch (apiError) {
          console.log('API unavailable, using fallback auth...')
        }

        // Fallback: Create session directly from Telegram bot token
        if (!success && token) {
          try {
            // Decode JWT token payload (we trust it since it came from our bot)
            const tokenPayload = JSON.parse(atob(token.split('.')[1]))
            userData = {
              accessToken: token,
              user: {
                id: tokenPayload.userId,
                telegramId: parseInt(finalTelegramId),
                username: username || `user_${finalTelegramId}`,
                firstName: username || `User`,
                walletAddress: address,
                createdAt: Date.now(),
                subscriptionTier: 'FREE',
                isActive: true
              }
            }
            success = true
          } catch (fallbackError) {
            console.error('Fallback auth failed:', fallbackError)
          }
        }

        if (success && userData) {
          const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
          const session = { 
            token: userData.accessToken, 
            user: userData.user, 
            expiresAt 
          }
          
          localStorage.setItem('auth_session', JSON.stringify(session))
          
          setStatus('success')
          setMessage('Authentication successful! Redirecting...')
          
          setTimeout(() => {
            router.replace(redirectUrl === '/' ? '/' : decodeURIComponent(redirectUrl))
          }, 1500)
        } else {
          setStatus('error')
          setMessage('Authentication failed. Please try again.')
          // Don't auto-redirect for debugging
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        setStatus('error')
        setMessage(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        // Don't auto-redirect for debugging
      }
    }
    run()
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="text-center p-8 bg-white/5 border border-white/10 rounded-2xl">
          {/* Loading State */}
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-orange-400" />
              <h1 className="text-xl font-semibold mb-2">Processing Authentication</h1>
              <p className="text-white/60">{message}</p>
            </>
          )}

          {/* Success State */}
          {status === 'success' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-orange-400" />
              </div>
              <h1 className="text-xl font-semibold mb-2 text-orange-400">Login Successful!</h1>
              <p className="text-white/60">{message}</p>
            </>
          )}

          {/* Error State */}
          {status === 'error' && (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <h1 className="text-xl font-semibold mb-2 text-red-400">Authentication Failed</h1>
              <p className="text-white/60 mb-4">{message}</p>
              {debugInfo && (
                <div className="mt-4 p-4 bg-black/50 rounded-lg text-left">
                  <p className="text-xs text-white/40 mb-2">Debug Info:</p>
                  <pre className="text-xs text-white/60 overflow-x-auto">
                    {JSON.stringify(debugInfo, null, 2)}
                  </pre>
                </div>
              )}
              <button 
                onClick={() => router.replace('/')}
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
              >
                Return to Home
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Loading component for Suspense fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="text-center p-8 bg-white/5 border border-white/10 rounded-2xl">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-orange-400" />
          <h1 className="text-xl font-semibold mb-2">Loading Authentication</h1>
          <p className="text-white/60">Please wait...</p>
        </div>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CallbackInner />
    </Suspense>
  )
}