'use client'

import { StakingDashboard } from '@/components/staking/StakingDashboard'

export default function StakingPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Staking Dashboard</h1>
      <StakingDashboard />
    </div>
  )
}
