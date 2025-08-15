"use client"

import { usePathname } from "next/navigation"
import BaseTopbar from "../topbar"
import ExploreTopbar from "./topbar-explore"
import NeoTopbar from "./topbar-neo"
import WalletTopbar from "./topbar-wallet"

export default function TopbarSwitcher() {
  const pathname = usePathname()

  if (pathname.startsWith("/explore")) return <ExploreTopbar />
  if (pathname.startsWith("/neo")) return <NeoTopbar />
  if (pathname.startsWith("/wallet")) return <WalletTopbar />

  return <BaseTopbar />
} 