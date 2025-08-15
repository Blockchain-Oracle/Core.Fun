"use client"

type Props = { data?: number[]; width?: number; height?: number; positiveColor?: string; negativeColor?: string }
export default function MiniBarChart({
  data = [],
  width = 48,
  height = 36,
  positiveColor = "#22c55e",
  negativeColor = "#ef4444",
}: Props) {
  if (!data.length) return null
  const max = Math.max(...data)
  const barWidth = width / data.length
  const gap = barWidth * 0.2
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {data.map((v, i) => {
        const h = Math.max(1, (v / (max || 1)) * (height - 2))
        const up = i % 3 !== 0
        return (
          <rect
            key={i}
            x={i * barWidth + gap / 2}
            y={height - h}
            width={barWidth - gap}
            height={h}
            rx={1}
            fill={up ? positiveColor : negativeColor}
          />
        )
      })}
    </svg>
  )
}
