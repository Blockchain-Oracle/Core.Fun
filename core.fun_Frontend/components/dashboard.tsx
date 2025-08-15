"use client"

import { useEffect, useState } from "react"
import { useTokenStore } from "@/lib/stores"
import Sidebar from "@/components/layout/sidebar"
import Topbar from "@/components/layout/topbar"
import SectionColumn from "@/components/sections/section-column"
import NewCreationCard from "@/components/cards/new-creation-card"
import AboutGraduateCard from "@/components/cards/about-graduate-card"
import GraduatedCard from "@/components/cards/graduated-card"
import { Loader2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ITEMS_PER_COLUMN = 10

export default function Dashboard() {
  const { 
    allTokens,
    newTokens,
    graduatedTokens,
    isLoading,
    fetchTokens 
  } = useTokenStore()

  const [showMoreNew, setShowMoreNew] = useState(false)
  const [showMoreGraduating, setShowMoreGraduating] = useState(false)
  const [showMoreGraduated, setShowMoreGraduated] = useState(false)

  useEffect(() => {
    if (allTokens.length === 0) {
      fetchTokens({ reset: true })
    }
  }, [])

  // Filter tokens that are close to graduation (> 80% progress)
  const aboutToGraduate = allTokens.filter(token => {
    if (token.status !== 'CREATED') return false
    const progress = token.graduationPercentage || 0
    return progress >= 80 && progress < 100
  })

  // Determine how many items to show in each column
  const newTokensToShow = showMoreNew ? newTokens : newTokens.slice(0, ITEMS_PER_COLUMN)
  const graduatingToShow = showMoreGraduating ? aboutToGraduate : aboutToGraduate.slice(0, ITEMS_PER_COLUMN)
  const graduatedToShow = showMoreGraduated ? graduatedTokens : graduatedTokens.slice(0, ITEMS_PER_COLUMN)

  if (isLoading && allTokens.length === 0) {
    return (
      <div className="flex min-h-screen w-full bg-background font-sans">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-4 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-400" />
              <p className="mt-4 text-white/60">Loading tokens...</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full bg-background font-sans">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-2 sm:p-4">
          {/* Mobile: Stack columns vertically */}
          {/* Tablet: 2 columns with the third below */}
          {/* Desktop: 3 columns side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 h-auto xl:h-[calc(100vh-56px-2rem)]">
            {/* New Creations Column */}
            <div className="flex flex-col h-auto xl:h-full">
              <SectionColumn title="New Creations" itemsCount={newTokens.length}>
                <div className="space-y-2">
                  {newTokensToShow.map((token) => (
                    <NewCreationCard key={token.address} token={token} />
                  ))}
                  
                  {newTokens.length > ITEMS_PER_COLUMN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMoreNew(!showMoreNew)}
                      className="w-full text-white/60 hover:text-white hover:bg-white/10"
                    >
                      {showMoreNew ? (
                        <>Show Less</>
                      ) : (
                        <>
                          Show {newTokens.length - ITEMS_PER_COLUMN} More
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                  
                  {newTokens.length === 0 && (
                    <div className="text-center py-8 text-white/40 text-sm">
                      No new tokens yet
                    </div>
                  )}
                </div>
              </SectionColumn>
            </div>

            {/* About to Graduate Column */}
            <div className="flex flex-col h-auto xl:h-full">
              <SectionColumn title="About to Graduate" itemsCount={aboutToGraduate.length}>
                <div className="space-y-2">
                  {graduatingToShow.map((token) => (
                    <AboutGraduateCard key={token.address} token={token} />
                  ))}
                  
                  {aboutToGraduate.length > ITEMS_PER_COLUMN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMoreGraduating(!showMoreGraduating)}
                      className="w-full text-white/60 hover:text-white hover:bg-white/10"
                    >
                      {showMoreGraduating ? (
                        <>Show Less</>
                      ) : (
                        <>
                          Show {aboutToGraduate.length - ITEMS_PER_COLUMN} More
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                  
                  {aboutToGraduate.length === 0 && (
                    <div className="text-center py-8 text-white/40 text-sm">
                      No tokens close to graduation
                    </div>
                  )}
                </div>
              </SectionColumn>
            </div>

            {/* Graduated Column - Full width on tablet, 1/3 on desktop */}
            <div className="flex flex-col h-auto md:col-span-2 xl:col-span-1 xl:h-full">
              <SectionColumn title="Graduated" itemsCount={graduatedTokens.length}>
                <div className="space-y-2">
                  {graduatedToShow.map((token) => (
                    <GraduatedCard key={token.address} token={token} />
                  ))}
                  
                  {graduatedTokens.length > ITEMS_PER_COLUMN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMoreGraduated(!showMoreGraduated)}
                      className="w-full text-white/60 hover:text-white hover:bg-white/10"
                    >
                      {showMoreGraduated ? (
                        <>Show Less</>
                      ) : (
                        <>
                          Show {graduatedTokens.length - ITEMS_PER_COLUMN} More
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                  
                  {graduatedTokens.length === 0 && (
                    <div className="text-center py-8 text-white/40 text-sm">
                      No graduated tokens yet
                    </div>
                  )}
                </div>
              </SectionColumn>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}