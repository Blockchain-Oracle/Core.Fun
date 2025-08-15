'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth-store'
import { Button } from '@/components/ui/button'
import { Plus, Zap } from 'lucide-react'
import { TokenCreatorModal } from './TokenCreatorModal'
import { AuthGuard } from '@/components/auth/AuthGuard'

interface CreateTokenButtonProps {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showIcon?: boolean
  children?: React.ReactNode
}

export function CreateTokenButton({ 
  variant = 'default',
  size = 'md', 
  className,
  showIcon = true,
  children
}: CreateTokenButtonProps) {
  const { isAuthenticated } = useAuth()
  const [showModal, setShowModal] = useState(false)

  if (!isAuthenticated) {
    return (
      <AuthGuard requireAuth={false}>
        <Button 
          variant={variant}
          size={size}
          className={className}
          onClick={() => {}} // Will be handled by AuthGuard
        >
          {showIcon && <Plus className="w-4 h-4 mr-2" />}
          {children || 'Create Token'}
        </Button>
      </AuthGuard>
    )
  }

  return (
    <>
      <Button 
        variant={variant}
        size={size}
        className={className}
        onClick={() => setShowModal(true)}
      >
        {showIcon && <Plus className="w-4 h-4 mr-2" />}
        {children || 'Create Token'}
      </Button>
      
      <TokenCreatorModal
        open={showModal}
        onOpenChange={setShowModal}
      />
    </>
  )
}

// Hero-style create button for prominent placement
export function CreateTokenHero() {
  const [showModal, setShowModal] = useState(false)

  return (
    <AuthGuard fallback={
      <div className="text-center p-12 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/20">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Launch Your Token</h2>
          <p className="text-muted-foreground mb-6">
            Create and launch your own meme token on Core blockchain in minutes. 
            No coding required!
          </p>
          <CreateTokenButton size="lg" className="px-8 py-3 text-lg">
            <Zap className="w-5 h-5 mr-2" />
            Get Started
          </CreateTokenButton>
        </div>
      </div>
    }>
      <div className="text-center p-12 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/20">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Launch Your Token</h2>
          <p className="text-muted-foreground mb-6">
            Create and launch your own meme token on Core blockchain in minutes. 
            No coding required!
          </p>
          <Button 
            size="lg" 
            className="px-8 py-3 text-lg"
            onClick={() => setShowModal(true)}
          >
            <Zap className="w-5 h-5 mr-2" />
            Launch Token
          </Button>
        </div>
      </div>

      <TokenCreatorModal
        open={showModal}
        onOpenChange={setShowModal}
      />
    </AuthGuard>
  )
}