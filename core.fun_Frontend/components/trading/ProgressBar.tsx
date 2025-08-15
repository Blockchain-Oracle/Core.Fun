'use client'

import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Zap, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  progress: number
  sold: number
  raised: number
  showDetails?: boolean
  className?: string
}

export function ProgressBar({ 
  progress, 
  sold, 
  raised, 
  showDetails = true,
  className = '' 
}: ProgressBarProps) {
  const getStatusColor = () => {
    if (progress >= 100) return 'text-yellow-400'
    if (progress >= 80) return 'text-orange-400'
    if (progress >= 50) return 'text-blue-400'
    return 'text-orange-400'
  }

  const getStatusIcon = () => {
    if (progress >= 100) return <Zap className="h-3 w-3" />
    if (progress >= 80) return <GraduationCap className="h-3 w-3" />
    return <TrendingUp className="h-3 w-3" />
  }

  const getStatusText = () => {
    if (progress >= 100) return 'Graduated!'
    if (progress >= 80) return 'Graduating Soon'
    if (progress >= 50) return 'Growing'
    return 'Just Started'
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={cn('transition-colors', getStatusColor())}>
            {getStatusIcon()}
          </span>
          <span className="text-white/60">{getStatusText()}</span>
        </div>
        <span className="font-medium text-white">
          {progress.toFixed(1)}%
        </span>
      </div>
      
      <Progress 
        value={Math.min(progress, 100)} 
        className="h-1.5"
      />
      
      {showDetails && (
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{(sold / 1000).toFixed(1)}K sold</span>
          <span>{raised.toFixed(2)} CORE raised</span>
        </div>
      )}
    </div>
  )
}

export default ProgressBar