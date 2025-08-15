"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { 
  Rocket, 
  TrendingUp, 
  Coins, 
  Users, 
  Shield, 
  Zap,
  ChartLine,
  Trophy,
  Sparkles
} from "lucide-react"
import { Card } from "@/components/ui/card"

export function FeaturesSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.1 })

  const features = [
    {
      icon: <Rocket className="w-8 h-8" />,
      title: "Token Factory",
      description: "Launch meme tokens with bonding curves. No coding required, just creativity.",
      color: "from-orange-500 to-red-500",
      delay: 0.1
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: "Copy Trading",
      description: "Follow successful traders automatically. Copy their strategies and ride the wave.",
      color: "from-yellow-500 to-orange-500",
      delay: 0.2
    },
    {
      icon: <Coins className="w-8 h-8" />,
      title: "Staking System",
      description: "Earn rewards by staking your tokens. Support the ecosystem and get paid.",
      color: "from-amber-500 to-yellow-500",
      delay: 0.3
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: "P2P Trading",
      description: "Trade directly with the community through bonding curves. No middleman needed.",
      color: "from-orange-400 to-amber-500",
      delay: 0.4
    },
    {
      icon: <ChartLine className="w-8 h-8" />,
      title: "Real-time Updates",
      description: "Live price tracking via WebSocket. Never miss a pump or dump.",
      color: "from-red-500 to-orange-500",
      delay: 0.5
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "@core_dot_fun_bot",
      description: "Trade directly from Telegram. Login with Telegram to access all features. Monitor and execute trades on the go.",
      color: "from-yellow-400 to-orange-400",
      delay: 0.6
    }
  ]

  return (
    <section id="features" className="py-20 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            <span className="text-white">Why Choose </span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-yellow-400">
              core.fun?
            </span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            The most advanced meme token platform with everything you need to launch and grow your community.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: feature.delay }}
            >
              <Card className="relative h-full bg-black/50 border-gray-800 hover:border-orange-500/50 transition-all duration-300 group overflow-hidden">
                {/* Gradient overlay on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                
                <div className="relative p-6 space-y-4">
                  {/* Icon with gradient background */}
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${feature.color} p-0.5`}>
                    <div className="w-full h-full bg-black rounded-xl flex items-center justify-center text-white">
                      {feature.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white group-hover:text-orange-400 transition-colors">
                    {feature.title}
                  </h3>
                  
                  <p className="text-gray-400">
                    {feature.description}
                  </p>

                  {/* Animated sparkle on hover */}
                  <motion.div
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100"
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-4 h-4 text-orange-400" />
                  </motion.div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Additional highlight box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-12 relative"
        >
          <Card className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/20 p-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Trophy className="w-12 h-12 text-orange-400" />
                <div>
                  <h3 className="text-2xl font-bold text-white">Ready to launch your moonshot?</h3>
                  <p className="text-gray-400">Join thousands of successful meme token creators</p>
                </div>
              </div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <button className="px-6 py-3 bg-gradient-to-r from-orange-500 to-yellow-500 text-black font-bold rounded-lg hover:from-orange-400 hover:to-yellow-400 transition-all">
                  Start Building
                </button>
              </motion.div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}