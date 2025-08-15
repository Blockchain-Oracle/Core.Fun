"use client"

import { useState, useEffect } from "react"
import { useTokenStore } from "@/lib/stores"
import TokenCard from "./token-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { RefreshCw, ArrowUp, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ExploreList() {
  const [showScrollTop, setShowScrollTop] = useState(false)
  const { 
    allTokens, 
    isLoading, 
    hasMore,
    fetchTokens 
  } = useTokenStore()

  useEffect(() => {
    if (allTokens.length === 0) {
      fetchTokens({ reset: true })
    }
  }, [])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    setShowScrollTop(scrollTop > 500)
  }

  const scrollToTop = () => {
    const element = document.querySelector('.explore-scroll-area')
    if (element) {
      element.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleRefresh = () => {
    fetchTokens({ reset: true })
    scrollToTop()
  }

  const handleLoadMore = () => {
    fetchTokens()
  }

  return (
    <div className="relative h-full">
      <ScrollArea 
        className="h-full explore-scroll-area" 
        onScroll={handleScroll}
      >
        <div className="space-y-3 p-4">
          {allTokens.map((token) => (
            <TokenCard 
              key={token.address} 
              token={token} 
              variant="detailed" 
            />
          ))}
          
          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center py-8">
              <Button
                variant="outline"
                size="lg"
                onClick={handleLoadMore}
                disabled={isLoading}
                className="bg-white/5 hover:bg-white/10"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Load More
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && allTokens.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-white/60 mb-4">No tokens found</p>
              <Button
                variant="outline"
                onClick={handleRefresh}
                className="bg-white/5 hover:bg-white/10"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Scroll to Top Button */}
      <Button
        size="icon"
        variant="outline"
        onClick={scrollToTop}
        className={cn(
          "absolute bottom-4 right-4 bg-black/80 border-white/20 hover:bg-black/90 transition-all duration-300",
          showScrollTop 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  )
}