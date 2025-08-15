'use client'

import React from 'react'
import { AuthContext_Export, useAuthProvider } from '@/hooks/use-auth-store'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const authValue = useAuthProvider()

  return (
    <AuthContext_Export.Provider value={authValue}>
      {children}
    </AuthContext_Export.Provider>
  )
}