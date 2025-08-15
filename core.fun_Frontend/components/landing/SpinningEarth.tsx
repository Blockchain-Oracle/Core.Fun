"use client"

import { useEffect, useRef } from "react"

export function SpinningEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    let rotation = 0
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const radius = Math.min(canvas.width, canvas.height) * 0.3

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Draw spinning globe wireframe
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(rotation)
      
      // Draw latitude lines
      ctx.strokeStyle = "rgba(255, 165, 0, 0.1)"
      ctx.lineWidth = 1
      
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath()
        const y = (i * radius) / 3
        const x = Math.sqrt(radius * radius - y * y)
        ctx.ellipse(0, y, x, x * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      
      // Draw longitude lines
      for (let i = 0; i < 12; i++) {
        ctx.save()
        ctx.rotate((Math.PI * 2 * i) / 12)
        ctx.beginPath()
        ctx.ellipse(0, 0, radius, radius * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
      
      // Draw outer circle
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(255, 165, 0, 0.2)"
      ctx.stroke()
      
      // Add some floating meme coins around the globe
      const coins = ["🚀", "💎", "🌙", "💰", "🔥"]
      coins.forEach((coin, i) => {
        const angle = rotation * 2 + (Math.PI * 2 * i) / coins.length
        const distance = radius + 50 + Math.sin(rotation * 3 + i) * 20
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance
        
        ctx.font = "24px sans-serif"
        ctx.fillText(coin, x - 12, y + 12)
      })
      
      ctx.restore()
      
      rotation += 0.005
    }

    const interval = setInterval(draw, 50)

    return () => {
      clearInterval(interval)
      window.removeEventListener("resize", resizeCanvas)
    }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full absolute inset-0" />
}