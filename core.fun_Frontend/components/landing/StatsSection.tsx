"use client"

import { motion, useInView } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { ArrowUpRight, TrendingUp } from "lucide-react"

export function StatsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })

  return (
    <section id="stats" className="py-20 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="space-y-12"
        >
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trading Volume Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Card className="h-full bg-black/50 border-gray-800 p-6 relative overflow-hidden group hover:border-orange-500/50 transition-all">
                <div className="absolute top-6 right-6">
                  <ArrowUpRight className="w-5 h-5 text-gray-500 group-hover:text-orange-400 transition-colors" />
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Total Volume (24h)</p>
                  <AnimatedCounter 
                    end={12500000} 
                    prefix="$" 
                    decimals={0}
                    isInView={isInView}
                  />
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                    <span className="text-orange-400 text-sm">+45.3% from yesterday</span>
                  </div>
                  
                  {/* Mini chart visualization */}
                  <MiniChart />
                </div>
              </Card>
            </motion.div>

            {/* Active Tokens Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Card className="h-full bg-black/50 border-gray-800 p-6 relative overflow-hidden group hover:border-yellow-500/50 transition-all">
                <div className="absolute top-6 right-6">
                  <ArrowUpRight className="w-5 h-5 text-gray-500 group-hover:text-yellow-400 transition-colors" />
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Active Tokens</p>
                  <AnimatedCounter 
                    end={1247} 
                    decimals={0}
                    isInView={isInView}
                  />
                  <p className="text-gray-400 text-sm">Across all trading pairs</p>
                  
                  {/* Token logos ticker */}
                  <TokenTicker />
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Secondary Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: 52340, color: "text-orange-400", delay: 0.4 },
              { label: "Staked Value", value: 8900000, prefix: "$", color: "text-yellow-400", delay: 0.5 },
              { label: "Rewards Distributed", value: 450000, prefix: "$", color: "text-amber-400", delay: 0.6 },
              { label: "Transactions", value: 892000, color: "text-orange-500", delay: 0.7 }
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: stat.delay }}
              >
                <Card className="bg-black/30 border-gray-800 p-4 text-center hover:bg-black/50 transition-all">
                  <p className="text-xs text-gray-500 mb-2">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>
                    <AnimatedCounter 
                      end={stat.value} 
                      prefix={stat.prefix}
                      decimals={0}
                      isInView={isInView}
                      duration={2000}
                    />
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Platform Metrics Highlight */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <Card className="bg-gradient-to-r from-orange-500/5 to-yellow-500/5 border-orange-500/20 p-8">
              <div className="text-center space-y-4">
                <h3 className="text-3xl font-bold text-white">
                  Platform Performance
                </h3>
                <div className="flex justify-center gap-8 flex-wrap">
                  <div>
                    <p className="text-4xl font-bold text-orange-400">99.9%</p>
                    <p className="text-sm text-gray-400">Uptime</p>
                  </div>
                  <div>
                    <p className="text-4xl font-bold text-yellow-400">&lt; 1s</p>
                    <p className="text-sm text-gray-400">Avg. Transaction</p>
                  </div>
                  <div>
                    <p className="text-4xl font-bold text-amber-400">$0.01</p>
                    <p className="text-sm text-gray-400">Avg. Gas Fee</p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

interface AnimatedCounterProps {
  end: number
  prefix?: string
  decimals?: number
  isInView: boolean
  duration?: number
}

function AnimatedCounter({ 
  end, 
  prefix = "", 
  decimals = 0, 
  isInView, 
  duration = 1500 
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return

    let startTime: number
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      
      setCount(Math.floor(progress * end))
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [isInView, end, duration])

  const formattedCount = count.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })

  return (
    <h3 className="text-4xl font-bold text-white">
      {prefix}{formattedCount}
    </h3>
  )
}

function MiniChart() {
  const points = [20, 35, 28, 45, 38, 52, 48, 65, 58, 72, 68, 85]
  
  return (
    <div className="h-20 flex items-end gap-1">
      {points.map((height, i) => (
        <motion.div
          key={i}
          className="flex-1 bg-gradient-to-t from-orange-500 to-yellow-500 rounded-t"
          initial={{ height: 0 }}
          animate={{ height: `${height}%` }}
          transition={{ delay: i * 0.05, duration: 0.5 }}
        />
      ))}
    </div>
  )
}

function TokenTicker() {
  const tokens = ["🚀", "💎", "🌙", "🔥", "⚡", "💰", "🎯", "🎲"]
  
  return (
    <div className="flex gap-2 overflow-hidden">
      <motion.div
        className="flex gap-2"
        animate={{ x: [0, -200] }}
        transition={{ 
          duration: 10, 
          repeat: Infinity, 
          ease: "linear" 
        }}
      >
        {[...tokens, ...tokens].map((token, i) => (
          <div
            key={i}
            className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-xl"
          >
            {token}
          </div>
        ))}
      </motion.div>
    </div>
  )
}