'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, Users, Coins, Target } from 'lucide-react'
import { BONDING_CURVE, memeFactory } from '@/lib/meme-factory'

interface BondingCurveChartProps {
  sold: number
  raised: number
  currentPrice: number
  className?: string
}

export function BondingCurveChart({ 
  sold, 
  raised, 
  currentPrice,
  className = '' 
}: BondingCurveChartProps) {
  const progress = (sold / BONDING_CURVE.TOKEN_LIMIT) * 100
  const remainingTokens = BONDING_CURVE.TOKEN_LIMIT - sold
  const remainingCore = BONDING_CURVE.TARGET_RAISED - raised
  
  // Generate curve points
  const curvePoints = useMemo(() => {
    const points = []
    const steps = 50
    
    for (let i = 0; i <= steps; i++) {
      const tokensSold = (BONDING_CURVE.TOKEN_LIMIT / steps) * i
      const price = memeFactory.calculateBondingCurvePrice(tokensSold)
      points.push({
        x: (tokensSold / BONDING_CURVE.TOKEN_LIMIT) * 100,
        y: price * 10000 // Scale for display
      })
    }
    
    return points
  }, [])
  
  // Create SVG path
  const svgPath = useMemo(() => {
    if (curvePoints.length === 0) return ''
    
    const maxY = Math.max(...curvePoints.map(p => p.y))
    const height = 200
    const width = 400
    
    const points = curvePoints.map(p => ({
      x: (p.x / 100) * width,
      y: height - (p.y / maxY) * height
    }))
    
    const pathData = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ')
    
    return pathData
  }, [curvePoints])
  
  // Current position on curve
  const currentX = (progress / 100) * 400
  const currentY = 200 - ((currentPrice * 10000) / Math.max(...curvePoints.map(p => p.y))) * 200

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Bonding Curve</CardTitle>
          <Badge 
            variant={progress >= 100 ? "default" : progress >= 80 ? "secondary" : "outline"}
            className="ml-2"
          >
            {progress >= 100 ? 'Graduated' : `${progress.toFixed(1)}% to Graduation`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SVG Chart */}
        <div className="relative w-full h-[200px] bg-black/40 rounded-lg p-4">
          <svg
            viewBox="0 0 400 200"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="400" height="200" fill="url(#grid)" />
            
            {/* Curve gradient */}
            <defs>
              <linearGradient id="curveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset={`${progress}%`} stopColor="#10b981" stopOpacity="0.6" />
                <stop offset={`${progress}%`} stopColor="#6b7280" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6b7280" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            
            {/* Area under curve */}
            <path
              d={`${svgPath} L 400 200 L 0 200 Z`}
              fill="url(#curveGradient)"
            />
            
            {/* Curve line */}
            <path
              d={svgPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
            />
            
            {/* Current position */}
            <circle
              cx={currentX}
              cy={currentY}
              r="6"
              fill="#10b981"
              stroke="white"
              strokeWidth="2"
            />
            
            {/* Progress line */}
            <line
              x1={currentX}
              y1="0"
              x2={currentX}
              y2="200"
              stroke="white"
              strokeOpacity="0.3"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          </svg>
          
          {/* Labels */}
          <div className="absolute bottom-2 left-2 text-xs text-white/60">0 tokens</div>
          <div className="absolute bottom-2 right-2 text-xs text-white/60">500K tokens</div>
          <div className="absolute top-2 left-2 text-xs text-white/60">Price</div>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Progress to Graduation</span>
            <span className="font-medium">{sold.toLocaleString()} / {BONDING_CURVE.TOKEN_LIMIT.toLocaleString()}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
              <Coins className="h-3 w-3" />
              Current Price
            </div>
            <div className="font-semibold">
              {currentPrice.toFixed(6)} CORE
            </div>
          </div>
          
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              CORE Raised
            </div>
            <div className="font-semibold">
              {raised.toFixed(2)} / {BONDING_CURVE.TARGET_RAISED} CORE
            </div>
          </div>
          
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
              <Users className="h-3 w-3" />
              Tokens Sold
            </div>
            <div className="font-semibold">
              {(sold / 1000).toFixed(1)}K
            </div>
          </div>
          
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
              <Target className="h-3 w-3" />
              Until Launch
            </div>
            <div className="font-semibold">
              {remainingTokens > 0 ? `${(remainingTokens / 1000).toFixed(1)}K tokens` : 'Launched!'}
            </div>
          </div>
        </div>
        
        {/* Graduation Message */}
        {progress >= 80 && progress < 100 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
            <p className="text-sm text-orange-400">
              🎓 Almost there! Only {(remainingTokens / 1000).toFixed(1)}K tokens left until graduation to DEX!
            </p>
          </div>
        )}
        
        {progress >= 100 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
            <p className="text-sm text-orange-400">
              ✅ Graduated! This token has been launched to DEX with {BONDING_CURVE.TARGET_RAISED} CORE liquidity.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default BondingCurveChart