"use client"

import { useEffect, useState } from "react"

export function useLiveSeries(initial: number[], live = true) {
  const [series, setSeries] = useState(initial)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1] ?? 100
        const next = Math.max(1, last + (Math.random() - 0.5) * 5)
        const arr = [...prev.slice(-23), next]
        return arr
      })
    }, 1200)
    return () => clearInterval(id)
  }, [live])
  return series
}
