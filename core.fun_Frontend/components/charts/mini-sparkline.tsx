"use client"

import { useMemo } from "react"
export default function MiniSparkline({
  data = [],
  width = 100,
  height = 32,
  strokeWidth = 2,
}: { data?: number[]; width?: number; height?: number; strokeWidth?: number }) {
  const points = useMemo(() => {
    if (!data.length) return ""
    const max = Math.max(...data)
    const min = Math.min(...data)
    const dx = width / (data.length - 1 || 1)
    const norm = (v: number) => (max === min ? height / 2 : height - ((v - min) / (max - min)) * height)
    return data.map((v, i) => `${i * dx},${norm(v)}`).join(" ")
  }, [data, width, height])
  const up = data.length > 1 && data[data.length - 1] >= data[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        fill="none"
        stroke={up ? "#22c55e" : "#ef4444"}
        strokeWidth={strokeWidth}
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
