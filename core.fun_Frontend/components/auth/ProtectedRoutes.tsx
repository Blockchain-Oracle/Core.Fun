'use client'

import { usePathname } from 'next/navigation'
import { AuthGuard } from './AuthGuard'

const PUBLIC_PREFIXES = ['/auth/callback', '/login']
const PUBLIC_EXACT_PATHS = ['/']

export function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || PUBLIC_EXACT_PATHS.includes(pathname)
  if (isPublic) return <>{children}</>
  return <AuthGuard>{children}</AuthGuard>
} 