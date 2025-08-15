"use client"

type Candle = { o: number; h: number; l: number; c: number }
export default function MiniCandles({
  candles = [],
  width = 120,
  height = 40,
}: { candles?: Candle[]; width?: number; height?: number }) {
  if (!candles.length) return null
  const highs = candles.map((c) => c.h)
  const lows = candles.map((c) => c.l)
  const max = Math.max(...highs)
  const min = Math.min(...lows)
  const xStep = width / candles.length
  const y = (v: number) => height - ((v - min) / (max - min || 1)) * height
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {candles.map((c, i) => {
        const isUp = c.c >= c.o
        const x = i * xStep + xStep / 2
        const bodyTop = y(Math.max(c.o, c.c))
        const bodyBottom = y(Math.min(c.o, c.c))
        const bodyH = Math.max(2, bodyBottom - bodyTop)
        return (
          <g key={i}>
            <line x1={x} y1={y(c.h)} x2={x} y2={y(c.l)} stroke="#6b7280" strokeWidth={1} />
            <rect
              x={x - Math.max(2, xStep * 0.25) / 2}
              y={bodyTop}
              width={Math.max(2, xStep * 0.25)}
              height={bodyH}
              fill={isUp ? "#22c55e" : "#ef4444"}
              rx={1}
            />
          </g>
        )
      })}
    </svg>
  )
}
