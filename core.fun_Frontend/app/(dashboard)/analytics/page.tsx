'use client'

import { Card, CardContent } from '@/components/ui/card'
import { BarChart3, TrendingUp, Activity, Clock } from 'lucide-react'

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Platform Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Advanced analytics and insights for the Core Meme Platform
        </p>
      </div>
      
      {/* Coming Soon Card */}
      <Card className="mt-8">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <div className="flex gap-4 mb-6">
            <BarChart3 className="h-12 w-12 text-orange-500/50" />
            <TrendingUp className="h-12 w-12 text-orange-500/50" />
            <Activity className="h-12 w-12 text-orange-500/50" />
            <Clock className="h-12 w-12 text-orange-500/50" />
          </div>
          
          <h2 className="text-2xl font-bold mb-3">Coming Soon</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Advanced analytics features are currently under development. 
            Check back soon for detailed insights, charts, and platform metrics.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}