"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell, Twitter, MessageSquare, Flame, Info, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

export default function BottomBar() {
  return (
    <div className="hidden md:flex h-10 items-center gap-2 border-t border-orange-500/20 bg-black/95 backdrop-blur-xl px-4 text-[11px]">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
        >
          <Bell className="h-3.5 w-3.5" /> 
          <span className="hidden lg:inline">Alerts</span>
        </Button>
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
        >
          <Twitter className="h-3.5 w-3.5" /> 
          <span className="hidden lg:inline">Twitter Tracker</span>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1 h-4">99+</Badge>
        </Button>
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
        >
          <MessageSquare className="h-3.5 w-3.5" /> 
          <span className="hidden lg:inline">Notifications</span>
        </Button>
      </div>

      {/* Right Section */}
      <div className="ml-auto flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
        >
          <Info className="h-3.5 w-3.5" /> 
          <span className="hidden lg:inline">About Core.fun</span>
        </Button>
      </div>
    </div>
  )
}
