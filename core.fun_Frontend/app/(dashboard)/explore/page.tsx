"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { useTokenStore, useUIStore } from "@/lib/stores"
import type { TokenData } from "@/lib/api"
import TokenCard from "@/components/explore/token-card"
import ExploreFilters from "@/components/explore/explore-filters"
import ExploreStats from "@/components/explore/explore-stats"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  TrendingUp, 
  Sparkles, 
  GraduationCap, 
  Trophy,
  RefreshCw,
  Grid3x3,
  Grid2x2,
  List,
  Loader2,
  ChevronDown
} from "lucide-react"
import { cn } from "@/lib/utils"

const ITEMS_PER_PAGE = 12

export default function ExplorePage() {
  const { preferences, updatePreferences } = useUIStore()
  const [selectedTab, setSelectedTab] = useState("all")
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE)
  const [gridCols, setGridCols] = useState<2 | 3>("3")
  const params = useSearchParams()
  
  const {
    allTokens,
    newTokens,
    graduatedTokens,
    isLoading,
    error,
    fetchTokens,
    updateFilters,
    filters,
    searchQuery,
    searchResults,
    searchTokens,
    clearSearch
  } = useTokenStore()

  // Fetch tokens and hydrate search from URL on mount
  useEffect(() => {
    fetchTokens({ reset: true })
    const q = params.get('search')?.trim()
    if (q) {
      searchTokens(q)
    }
  }, [])

  // Reset display count when tab changes
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE)
  }, [selectedTab])

  const handleTabChange = (value: string) => {
    setSelectedTab(value)
    setDisplayCount(ITEMS_PER_PAGE)
    
    // Update filters based on tab
    if (value === "new") {
      updateFilters({ status: 'new' })
    } else if (value === "graduating") {
      updateFilters({ status: 'graduating' })
    } else if (value === "graduated") {
      updateFilters({ status: 'graduated' })
    } else {
      updateFilters({ status: 'all' })
    }
  }

  const getFilteredTokens = (): TokenData[] => {
    switch (selectedTab) {
      case "new":
        return newTokens
      case "graduating":
        // Filter tokens that are close to graduation (e.g., > 80% to target)
        return allTokens.filter(t => {
          if (t.status !== 'CREATED') return false
          const progressPercentage = ((t.graduationPercentage || 0))
          return progressPercentage >= 80 && progressPercentage < 100
        })
      case "graduated":
        return graduatedTokens
      default:
        return allTokens
    }
  }

  const filteredTokens = useMemo(() => {
    if (searchQuery && searchResults.length >= 0) {
      return searchResults
    }
    return getFilteredTokens()
  }, [searchQuery, searchResults, selectedTab, allTokens, newTokens, graduatedTokens])

  // Paginated tokens for display
  const displayedTokens = useMemo(() => {
    return filteredTokens.slice(0, displayCount)
  }, [filteredTokens, displayCount])

  const hasMore = displayCount < filteredTokens.length

  const handleLoadMore = useCallback(() => {
    setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredTokens.length))
  }, [filteredTokens.length])

  const handleRefresh = () => {
    fetchTokens({ reset: true })
    setDisplayCount(ITEMS_PER_PAGE)
  }

  // Grid column classes based on view preference
  const getGridClasses = () => {
    if (preferences.viewMode === "list") {
      return "grid-cols-1"
    }
    
    if (gridCols === "2") {
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2"
    }
    
    // Default 3 column responsive grid
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center ring-1 ring-orange-500/30">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
                </div>
                Explore Tokens
              </h1>
              <p className="text-xs sm:text-sm text-white/50 mt-1">
                Discover and trade the hottest tokens on Core
              </p>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="text-white/60 hover:text-white hover:bg-white/10"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              
              <div className="flex items-center bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => {
                    updatePreferences({ viewMode: 'grid' })
                    setGridCols("3")
                  }}
                  className={cn(
                    "p-1.5 rounded transition-all",
                    preferences.viewMode === "grid" && gridCols === "3"
                      ? "bg-orange-500/20 text-orange-400" 
                      : "text-white/60 hover:text-white"
                  )}
                  title="3 Column Grid"
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    updatePreferences({ viewMode: 'grid' })
                    setGridCols("2")
                  }}
                  className={cn(
                    "p-1.5 rounded transition-all",
                    preferences.viewMode === "grid" && gridCols === "2"
                      ? "bg-orange-500/20 text-orange-400" 
                      : "text-white/60 hover:text-white"
                  )}
                  title="2 Column Grid"
                >
                  <Grid2x2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => updatePreferences({ viewMode: 'list' })}
                  className={cn(
                    "p-1.5 rounded transition-all",
                    preferences.viewMode === "list" 
                      ? "bg-orange-500/20 text-orange-400" 
                      : "text-white/60 hover:text-white"
                  )}
                  title="List View"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Stats */}
        <ExploreStats />
        
        {/* Filters */}
        <div className="mt-6">
          <ExploreFilters />
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={handleTabChange} className="mt-6">
          <div className="overflow-x-auto">
            <TabsList className="bg-white/5 border border-white/10 w-full sm:w-auto">
              <TabsTrigger value="all" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">All Tokens</span>
                <span className="sm:hidden">All</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {allTokens.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="new" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                New
                <Badge variant="secondary" className="ml-1 text-xs">
                  {newTokens.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="graduating" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Graduating</span>
                <span className="sm:hidden">Grad</span>
              </TabsTrigger>
              <TabsTrigger value="graduated" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Graduated</span>
                <span className="sm:hidden">Done</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {graduatedTokens.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Token Grid/List */}
          <TabsContent value={selectedTab} className="mt-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {isLoading && filteredTokens.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-400" />
                  <p className="mt-4 text-white/60">Loading tokens...</p>
                </div>
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Sparkles className="h-12 w-12 mx-auto text-white/20" />
                  <p className="mt-4 text-white/60">No tokens found</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      clearSearch()
                      updateFilters({ status: 'all' })
                      setSelectedTab("all")
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Token Count Info */}
                <div className="mb-4 text-sm text-white/60">
                  Showing {displayedTokens.length} of {filteredTokens.length} tokens
                </div>

                {/* Token Grid */}
                <div className={cn(
                  "grid gap-3 sm:gap-4",
                  getGridClasses()
                )}>
                  {displayedTokens.map((token) => (
                    <TokenCard 
                      key={token.address} 
                      token={token} 
                      viewMode={preferences.viewMode}
                    />
                  ))}
                </div>

                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <Button
                      onClick={handleLoadMore}
                      disabled={isLoading}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-white hover:text-white group"
                      size="lg"
                    >
                      <span>Load More</span>
                      <ChevronDown className="ml-2 h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                      <Badge variant="secondary" className="ml-2">
                        {filteredTokens.length - displayedTokens.length} more
                      </Badge>
                    </Button>
                  </div>
                )}

                {/* Show All Loaded Message */}
                {!hasMore && filteredTokens.length > 0 && (
                  <div className="text-center mt-8 text-white/40 text-sm">
                    All {filteredTokens.length} tokens loaded
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}