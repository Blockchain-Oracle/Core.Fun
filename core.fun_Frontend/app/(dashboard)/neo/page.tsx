"use client"

import { useEffect, useState } from "react"
import { useTokenStore } from "@/lib/stores"
import SectionColumn from "@/components/sections/section-column"
import NewCreationCard from "@/components/cards/new-creation-card"
import AboutGraduateCard from "@/components/cards/about-graduate-card"
import GraduatedCard from "@/components/cards/graduated-card"
import NeoBottomBar from "@/components/layout/neo-bottom-bar"
import { Loader2 } from "lucide-react"

const tabs = ["New Creations", "Graduating Soon", "Graduated"] as const

export default function NeoPage() {
  const [active, setActive] = useState<(typeof tabs)[number]>("New Creations")
  const { 
    allTokens,
    newTokens,
    graduatedTokens,
    isLoading,
    fetchTokens 
  } = useTokenStore()

  useEffect(() => {
    if (allTokens.length === 0) {
      fetchTokens({ reset: true })
    }
  }, [])

  // Filter tokens that are close to graduation (> 80% progress)
  const aboutToGraduate = allTokens.filter(token => {
    if (token.status !== 'CREATED') return false
    const progress = ((token.liquidity || 0) / 250) * 100
    return progress >= 80
  })

  if (isLoading && allTokens.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px-40px)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-400" />
          <p className="mt-4 text-white/60">Loading tokens...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3 lg:h-[calc(100vh-56px-40px)] pb-16 lg:pb-0">
      {/* Desktop three columns */}
      <div className="hidden lg:block">
        <SectionColumn title="New Creations" itemsCount={newTokens.length}>
          {newTokens.map((token) => (
            <NewCreationCard key={token.address} token={token} />
          ))}
        </SectionColumn>
      </div>
      <div className="hidden lg:block">
        <SectionColumn title="About to Graduate" itemsCount={aboutToGraduate.length}>
          {aboutToGraduate.map((token) => (
            <AboutGraduateCard key={token.address} token={token} />
          ))}
        </SectionColumn>
      </div>
      <div className="hidden lg:block">
        <SectionColumn title="Graduated" premium itemsCount={graduatedTokens.length}>
          {graduatedTokens.map((token) => (
            <GraduatedCard key={token.address} token={token} />
          ))}
        </SectionColumn>
      </div>

      {/* Mobile: single column; tab buttons are in fixed bottom bar */}
      <div className="lg:hidden">
        {active === "New Creations" && (
          <SectionColumn title="New Creations" itemsCount={newTokens.length}>
            {newTokens.map((token) => (
              <NewCreationCard key={token.address} token={token} />
            ))}
          </SectionColumn>
        )}
        {active === "Graduating Soon" && (
          <SectionColumn title="About to Graduate" itemsCount={aboutToGraduate.length}>
            {aboutToGraduate.map((token) => (
              <AboutGraduateCard key={token.address} token={token} />
            ))}
          </SectionColumn>
        )}
        {active === "Graduated" && (
          <SectionColumn title="Graduated" premium itemsCount={graduatedTokens.length}>
            {graduatedTokens.map((token) => (
              <GraduatedCard key={token.address} token={token} />
            ))}
          </SectionColumn>
        )}
      </div>

      {/* Mobile bottom bar */}
      <NeoBottomBar active={active} setActive={setActive} tabs={tabs} />
    </div>
  )
}