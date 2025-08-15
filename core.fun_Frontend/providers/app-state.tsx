"use client"

import type React from "react"

import { createContext, useContext, useState } from "react"

type Chain = "core"
type AppState = { selectedChain: Chain; setSelectedChain: (c: Chain) => void }
const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [selectedChain, setSelectedChain] = useState<Chain>("core")
  return <Ctx.Provider value={{ selectedChain, setSelectedChain }}>{children}</Ctx.Provider>
}

export function useAppState() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider")
  return ctx
}
