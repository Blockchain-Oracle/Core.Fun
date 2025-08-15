"use client"

import { useEffect, useState } from "react"

export function usePulse(on = true, interval = 3000, dutyCycle = 0.5) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!on) return
    let mounted = true
    const id = setInterval(() => {
      if (!mounted) return
      setActive(true)
      setTimeout(() => mounted && setActive(false), interval * dutyCycle)
    }, interval)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [on, interval, dutyCycle])
  return active
}
