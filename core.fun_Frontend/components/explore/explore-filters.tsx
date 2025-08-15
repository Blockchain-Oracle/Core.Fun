"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Search, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  Users, 
  Zap,
  Filter,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTokenStore } from "@/lib/stores"

interface FilterOption {
  value: string
  label: string
  icon?: React.ReactNode
}

const sortOptions: FilterOption[] = [
  { value: "trending", label: "Trending", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { value: "new", label: "New", icon: <Clock className="h-3.5 w-3.5" /> },
  { value: "marketcap", label: "Market Cap", icon: <DollarSign className="h-3.5 w-3.5" /> },
  { value: "holders", label: "Holders", icon: <Users className="h-3.5 w-3.5" /> },
  { value: "volume", label: "Volume", icon: <Zap className="h-3.5 w-3.5" /> },
]

const categoryOptions: FilterOption[] = [
  { value: "all", label: "All Tokens" },
  { value: "new", label: "New Creations" },
  { value: "graduating", label: "About to Graduate" },
  { value: "graduated", label: "Graduated" },
]

interface ExploreFiltersProps {
  onFilterChange?: (filters: any) => void
}

export default function ExploreFilters({ onFilterChange }: ExploreFiltersProps) {
  const {
    searchQuery: globalSearchQuery,
    searchTokens,
    clearSearch,
    updateFilters
  } = useTokenStore()

  const [searchQuery, setSearchQuery] = useState(globalSearchQuery || "")
  const [selectedSort, setSelectedSort] = useState("trending")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Debounced search handler
  useEffect(() => {
    const handler = setTimeout(() => {
      const q = searchQuery.trim()
      if (q) {
        searchTokens(q)
      } else {
        clearSearch()
      }
      onFilterChange?.({ searchQuery: q })
    }, 250)
    return () => clearTimeout(handler)
  }, [searchQuery])

  const sortValueToStoreField = useMemo(() => ({
    trending: { sortBy: 'volume', sortOrder: 'desc' as const },
    new: { sortBy: 'age', sortOrder: 'desc' as const },
    marketcap: { sortBy: 'marketCap', sortOrder: 'desc' as const },
    holders: { sortBy: 'holders', sortOrder: 'desc' as const },
    volume: { sortBy: 'volume', sortOrder: 'desc' as const }
  }), [])

  return (
    <>
      {/* Desktop Filters */}
      <div className="hidden lg:flex items-center gap-3 p-4 border-b border-white/10 bg-black/40 backdrop-blur-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tokens..."
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-orange-500/50"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2">
          {categoryOptions.map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCategory(option.value)
                const status = option.value as 'all' | 'new' | 'graduating' | 'graduated'
                updateFilters({ status })
                onFilterChange?.({ status })
              }}
              className={cn(
                "h-8 px-3 text-xs font-medium transition-all",
                selectedCategory === option.value
                  ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-white/40">Sort by:</span>
          {sortOptions.map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedSort(option.value)
                const config = sortValueToStoreField[option.value as keyof typeof sortValueToStoreField]
                if (config) {
                  updateFilters(config as any)
                  onFilterChange?.(config)
                }
              }}
              className={cn(
                "h-8 gap-1.5 px-3 text-xs font-medium transition-all",
                selectedSort === option.value
                  ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              {option.icon}
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Mobile Filters */}
      <div className="lg:hidden">
        <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-9 pl-9 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="h-9 px-3 border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile Filter Panel */}
        {showMobileFilters && (
          <div className="border-b border-white/10 bg-black/60 p-3 space-y-3">
            <div>
              <p className="text-xs text-white/40 mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory(option.value)
                      const status = option.value as 'all' | 'new' | 'graduating' | 'graduated'
                      updateFilters({ status })
                      onFilterChange?.({ status })
                    }}
                    className={cn(
                      "h-7 px-2.5 text-xs",
                      selectedCategory === option.value
                        ? "bg-orange-500/20 text-orange-400"
                        : "text-white/60 bg-white/5"
                    )}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-xs text-white/40 mb-2">Sort by</p>
              <div className="flex flex-wrap gap-2">
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedSort(option.value)
                      const config = sortValueToStoreField[option.value as keyof typeof sortValueToStoreField]
                      if (config) {
                        updateFilters(config as any)
                        onFilterChange?.(config)
                      }
                    }}
                    className={cn(
                      "h-7 gap-1 px-2.5 text-xs",
                      selectedSort === option.value
                        ? "bg-orange-500/20 text-orange-400"
                        : "text-white/60 bg-white/5"
                    )}
                  >
                    {option.icon}
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}