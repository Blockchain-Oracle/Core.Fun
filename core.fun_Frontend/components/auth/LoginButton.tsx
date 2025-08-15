'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/stores'
import { useTelegramWebApp } from '@/hooks/use-auth-store'
import { Loader2, ExternalLink } from 'lucide-react'

interface LoginButtonProps {
  className?: string
  returnUrl?: string
  children?: React.ReactNode
}

export function LoginButton({ className, returnUrl, children }: LoginButtonProps) {
  const { login, generateAuthUrl } = useAuthStore()
  const { isTelegramWebApp, initData, showAlert } = useTelegramWebApp()
  const [loginLoading, setLoginLoading] = useState(false)

  const handleLogin = async () => {
    if (isTelegramWebApp && initData) {
      // Direct login using Telegram Web App data
      setLoginLoading(true)
      try {
        const success = await login(initData)
        if (!success) {
          showAlert('Authentication failed. Please try again.')
        }
      } catch (error) {
        console.error('Login error:', error)
        showAlert('Login error occurred. Please try again.')
      } finally {
        setLoginLoading(false)
      }
    } else {
      // Redirect to Telegram bot for authentication
      const authUrl = await generateAuthUrl(returnUrl || window.location.href)
      window.open(authUrl, '_blank')
    }
  }

  const isButtonLoading = loginLoading

  return (
    <Button
      onClick={handleLogin}
      disabled={isButtonLoading}
      className={className}
      size="lg"
    >
      {isButtonLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        !isTelegramWebApp && <ExternalLink className="w-4 h-4 mr-2" />
      )}
      {children || (isTelegramWebApp ? 'Login with Telegram' : 'Connect Telegram')}
    </Button>
  )
}

export function QuickLoginButton({ className }: { className?: string }) {
  return (
    <LoginButton className={className}>
      <div className="flex items-center">
        <div className="w-5 h-5 mr-2 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
          <span className="text-xs text-white font-bold">t</span>
        </div>
        Login via Telegram
      </div>
    </LoginButton>
  )
}