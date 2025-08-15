"use client"

import { 
  Sparkles,
  GraduationCap,
  Trophy
} from "lucide-react"

interface NeoBottomBarProps {
  activeTab: "New Creations" | "Graduating Soon" | "Graduated"
  onTabChange: (tab: "New Creations" | "Graduating Soon" | "Graduated") => void
}

export default function NeoBottomBar({ activeTab, onTabChange }: NeoBottomBarProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black backdrop-blur-sm">
      <div className="grid h-14 grid-cols-3">
        {/* New Creations */}
        <button
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "New Creations" 
              ? "text-orange-400 bg-orange-500/10" 
              : "text-white/50 hover:text-white/70"
          }`}
          onClick={() => onTabChange("New Creations")}
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-[10px] font-medium">New Creations</span>
        </button>

        {/* Graduating Soon */}
        <button
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "Graduating Soon" 
              ? "text-orange-400 bg-orange-500/10" 
              : "text-white/50 hover:text-white/70"
          }`}
          onClick={() => onTabChange("Graduating Soon")}
        >
          <GraduationCap className="h-4 w-4" />
          <span className="text-[10px] font-medium">Graduating Soon</span>
        </button>

        {/* Graduated */}
        <button
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "Graduated" 
              ? "text-yellow-400 bg-yellow-500/10" 
              : "text-white/50 hover:text-white/70"
          }`}
          onClick={() => onTabChange("Graduated")}
        >
          <Trophy className="h-4 w-4" />
          <span className="text-[10px] font-medium">Graduated</span>
        </button>
      </div>
    </div>
  )
}