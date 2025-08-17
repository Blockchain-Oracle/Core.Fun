"use client"

import { Button } from "@/components/ui/button"
import { Info, Globe, Github } from "lucide-react"
import Link from "next/link"

export default function BottomBar() {
  return (
    <div className="hidden md:flex h-10 items-center gap-2 border-t border-orange-500/20 bg-black/95 backdrop-blur-xl px-4 text-[11px]">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        <Link href="/" target="_blank">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
          >
            <Info className="h-3.5 w-3.5" /> 
            <span className="hidden lg:inline">About Core.fun</span>
          </Button>
        </Link>
      </div>

      {/* Right Section */}
      <div className="ml-auto flex items-center gap-2">
        <a href="https://t.me/core_dot_fun_bot" target="_blank" rel="noopener noreferrer">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span className="hidden lg:inline">Telegram</span>
          </Button>
        </a>
        
        <a href="https://github.com/Blockchain-Oracle/Core.Fun" target="_blank" rel="noopener noreferrer">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
          >
            <Github className="h-3.5 w-3.5" /> 
            <span className="hidden lg:inline">GitHub</span>
          </Button>
        </a>
        
        <a href="https://coredao.org" target="_blank" rel="noopener noreferrer">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 gap-1.5 text-white/50 hover:text-orange-400 hover:bg-orange-500/10 px-2"
          >
            <Globe className="h-3.5 w-3.5" /> 
            <span className="hidden lg:inline">Core DAO</span>
          </Button>
        </a>
      </div>
    </div>
  )
}
