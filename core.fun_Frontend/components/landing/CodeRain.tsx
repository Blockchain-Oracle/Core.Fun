"use client"

import { useEffect, useRef } from "react"

export function CodeRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + "px"
      canvas.style.height = window.innerHeight + "px"
      ctx.scale(dpr, dpr)
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    // Crypto and meme-themed characters
    const characters = "₿ΞΔ♦◊$¢£¥€01🚀🌙💎🔥⚡💰🎯🎲🎪🎨🎭"
    const japaneseChars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン"
    const allChars = characters + japaneseChars

    const fontSize = 14
    const columns = Math.floor(window.innerWidth / fontSize)

    const trails: Array<Array<{ char: string; y: number; opacity: number }>> = []
    for (let i = 0; i < columns; i++) {
      trails[i] = []
    }

    const drops: number[] = []
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100
    }

    const isMobile = window.innerWidth <= 768

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      
      // Dark background
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

      for (let i = 0; i < columns; i++) {
        const x = i * fontSize

        if (drops[i] >= 0) {
          const useSpecialChar = Math.random() > 0.8
          const char = useSpecialChar 
            ? characters.charAt(Math.floor(Math.random() * characters.length))
            : allChars.charAt(Math.floor(Math.random() * allChars.length))
          
          trails[i].push({
            char: char,
            y: drops[i] * fontSize,
            opacity: 1,
          })
        }

        trails[i] = trails[i].filter((item) => {
          item.opacity -= 0.05
          return item.opacity > 0
        })

        trails[i].forEach((item, index) => {
          const isHead = index === trails[i].length - 1
          
          // Orange/yellow theme for Core blockchain
          let color
          if (isMobile) {
            color = isHead 
              ? `rgba(255, 165, 0, ${item.opacity * 1.2})` 
              : `rgba(255, 140, 0, ${item.opacity * 0.6})`
          } else {
            color = isHead
              ? `rgba(255, 180, 0, ${item.opacity * 1.3})`
              : `rgba(255, 120, 0, ${item.opacity * 0.7})`
          }

          ctx.fillStyle = color
          ctx.font = `${fontSize}px monospace`
          ctx.fillText(item.char, x, item.y)
        })

        drops[i]++

        if (drops[i] * fontSize > window.innerHeight && Math.random() > 0.975) {
          drops[i] = -Math.random() * 100
          trails[i] = []
        }
      }
    }

    const interval = setInterval(draw, 50)

    return () => {
      clearInterval(interval)
      window.removeEventListener("resize", resizeCanvas)
    }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}