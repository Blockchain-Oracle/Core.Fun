"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Wallet, Settings, LineChart } from "lucide-react"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/neo", icon: LineChart, label: "Neo" },
  { href: "/wallet", icon: Wallet, label: "Wallet" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export default function MobileNav() {
  const path = usePathname()
  if (path.startsWith("/neo")) return null
  return (
    <div className="fixed bottom-0 left-0 z-50 w-full border-t border-white/5 bg-black/70 backdrop-blur-sm md:hidden">
      <div className="grid h-14 grid-cols-4">
        {nav.map((n) => {
          const active = path.startsWith(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex flex-col items-center justify-center text-[11px] text-white/70",
                active && "text-orange-400",
              )}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
