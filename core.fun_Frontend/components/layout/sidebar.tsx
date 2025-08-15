"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  Compass,
  LineChart,
  Repeat,
  ListOrdered,
  Wallet,
  Users,
  Twitter,
  Settings,
  User,
  Bell,
  Flame,
  Menu,
  X,
  Plus,
  DollarSign,
  BarChart3,
  Coins,
} from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/create-token", icon: Plus, label: "Create Token" },
  { href: "/neo", icon: LineChart, label: "Dashboard" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/portfolio", icon: Wallet, label: "Portfolio" },
  { href: "/wallet", icon: Wallet, label: "Wallet" },
  // Treasury feature not available in backend
  // { href: "/treasury", icon: DollarSign, label: "Treasury" },
  { href: "/staking", icon: Repeat, label: "Staking" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden fixed top-4 left-4 z-50 h-10 w-10 bg-black/80 backdrop-blur border border-white/10"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <TooltipProvider delayDuration={0}>
        <aside className={cn(
          "fixed md:sticky top-0 z-40 h-screen w-[74px] shrink-0 border-r border-orange-500/20 bg-black/95 backdrop-blur-xl transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <nav className="flex w-full flex-col items-center gap-2 p-2">
            <Link href="/" className="mb-3 mt-2 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 ring-1 ring-orange-500/30 hover:from-orange-500/30 hover:to-orange-600/20 transition-all">
              <Image 
                src="/Core.FunLogo.png" 
                alt="Core.Fun" 
                width={28} 
                height={28} 
                className="object-contain"
              />
            </Link>
            <div className="h-px w-9 bg-orange-500/20" />
            
            {items.map(({ href, icon: Icon, label }) => {
              const active = pathname.startsWith(href)
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all",
                        active 
                          ? "bg-gradient-to-br from-orange-500/20 to-orange-600/10 text-orange-400 ring-1 ring-orange-500/30"
                          : "text-white/40 hover:bg-white/5 hover:text-white/80"
                      )}
                      aria-label={label}
                    >
                      {active && (
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/10 to-transparent" />
                      )}
                      <Icon className={cn(
                        "h-5 w-5 relative z-10 transition-transform group-hover:scale-110",
                        active && "text-orange-400"
                      )} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-black/95 border-orange-500/20">
                    {label}
                  </TooltipContent>
                </Tooltip>
              )
            })}
            
            <div className="mt-auto w-full space-y-2">
              <div className="h-px w-9 bg-orange-500/20 mx-auto" />
              <div className="flex flex-col items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link 
                      href="/settings" 
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-white/40 hover:text-orange-400 hover:bg-white/5 transition-all"
                      aria-label="Notifications"
                    >
                      <Bell className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-black/95 border-orange-500/20">
                    Notifications
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </nav>
        </aside>
      </TooltipProvider>
    </>
  )
}
