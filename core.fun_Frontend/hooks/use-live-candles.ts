"use client"

import { useEffect, useState } from "react"

type Candle = { o: number; h: number; l: number; c: number }

export function useLiveCandles(initial: Candle[], live = true) {
  const [candles, setCandles] = useState<Candle[]>(initial)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      setCandles((prev) => {
        const last = prev[prev.length - 1] ?? { o: 100, h: 102, l: 98, c: 101 }
        const o = last.c
        const c = Math.max(1, o + (Math.random() - 0.5) * 6)
        const h = Math.max(o, c) + Math.random() * 3
        const l = Math.min(o, c) - Math.random() * 3
        return [...prev.slice(-25), { o, h, l, c }]
      })
    }, 1500)
    return () => clearInterval(id)
  }, [live])
  return candles
}
