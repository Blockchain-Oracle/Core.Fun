import type React from "react"
import Sidebar from "./sidebar"
import TopbarSwitcher from "./topbars/topbar-switcher"
import MobileNav from "./mobile-nav"
import BottomBar from "./bottom-bar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background font-sans">
      {/* Desktop sidebar */}
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopbarSwitcher />
        <main className="flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
        {/* Desktop status bar */}
        <div className="hidden md:block">
          <BottomBar />
        </div>
      </div>
      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  )
}
