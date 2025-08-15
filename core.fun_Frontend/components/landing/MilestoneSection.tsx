"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Card } from "@/components/ui/card"
import { 
  CheckCircle2, 
  Rocket, 
  Shield, 
  TrendingUp, 
  Globe,
  Smartphone,
  Link2,
  ChartBar,
  Bell,
  Zap
} from "lucide-react"

export function MilestoneSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.3 })

  const completedMilestones = [
    { icon: <CheckCircle2 className="w-5 h-5" />, text: "Core Testnet Deployment" },
    { icon: <Rocket className="w-5 h-5" />, text: "Token Creation Factory" },
    { icon: <TrendingUp className="w-5 h-5" />, text: "Bonding Curve Trading" },
    { icon: <Link2 className="w-5 h-5" />, text: "Copy Trading System" },
    { icon: <Zap className="w-5 h-5" />, text: "Staking Rewards" },
    { icon: <Bell className="w-5 h-5" />, text: "Telegram Bot Integration" },
  ]

  const upcomingMilestones = [
    { icon: <Globe className="w-5 h-5" />, text: "Mainnet Launch", quarter: "Q3 2025" },
    { icon: <ChartBar className="w-5 h-5" />, text: "Advanced Trading Charts", quarter: "Q3 2025" },
    { icon: <Shield className="w-5 h-5" />, text: "Smart Contract Audit", quarter: "Q3 2025" },
    { icon: <Link2 className="w-5 h-5" />, text: "DEX Integration", quarter: "Q4 2025" },
    { icon: <Smartphone className="w-5 h-5" />, text: "Mobile App", quarter: "Q4 2025" },
  ]

  return (
    <section id="milestones" className="py-20 px-4 sm:px-6 relative">
      <div className="max-w-7xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold mb-4">
            <span className="text-white">Our </span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-yellow-400">
              Journey
            </span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Building the future of meme tokens on Core blockchain
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Live Features */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="h-full bg-black/50 border-gray-800 p-6 relative overflow-hidden hover:border-orange-500/50 transition-all">
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full blur-3xl"></div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                  <h3 className="text-2xl font-bold text-white">Live on Testnet</h3>
                </div>
                
                <div className="space-y-3">
                  {completedMilestones.map((milestone, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                      className="flex items-center gap-3 text-gray-300"
                    >
                      <div className="text-orange-400">
                        {milestone.icon}
                      </div>
                      <span>{milestone.text}</span>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Platform Status</span>
                    <span className="text-sm text-orange-400 font-semibold">Active & Running</span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Roadmap */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="h-full bg-black/50 border-gray-800 p-6 relative overflow-hidden hover:border-orange-500/50 transition-all">
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full blur-3xl"></div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-6">
                  <Rocket className="w-6 h-6 text-orange-400" />
                  <h3 className="text-2xl font-bold text-white">Coming Soon</h3>
                </div>
                
                <div className="space-y-3">
                  {upcomingMilestones.map((milestone, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 text-gray-300">
                        <div className="text-orange-400">
                          {milestone.icon}
                        </div>
                        <span>{milestone.text}</span>
                      </div>
                      <span className="text-xs text-gray-500">{milestone.quarter}</span>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Next Major Update</span>
                    <span className="text-sm text-orange-400 font-semibold">Mainnet Launch</span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Built on Core Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-12"
        >
          <Card className="bg-gradient-to-r from-orange-500/5 to-yellow-500/5 border-orange-500/20 p-8">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <img 
                src="/coreLogo.png" 
                alt="Core DAO" 
                className="h-16 w-auto"
              />
              <div className="text-center md:text-left">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Built on Core Blockchain
                </h3>
                <p className="text-gray-400">
                  Leveraging Bitcoin's security with EVM compatibility for the ultimate meme token experience
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}