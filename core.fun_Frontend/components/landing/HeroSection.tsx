"use client"

import { motion } from "framer-motion"
import { TypingHero } from "./TypingHero"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Rocket, Users } from "lucide-react"

export function HeroSection() {
  return (
    <section className="flex flex-col items-center justify-center min-h-[90vh] px-4 sm:px-6">
      <div className="max-w-5xl mx-auto text-center space-y-6">
        {/* Core Logo and Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 flex flex-col items-center gap-4"
        >
          <img 
            src="/Core.FunLogo.png" 
            alt="Core.Fun" 
            className="h-16 w-auto"
          />
          <Badge className="px-4 py-2 text-sm bg-orange-500/10 text-orange-400 border-orange-500/20">
            🔥 Building on Core Blockchain
          </Badge>
        </motion.div>

        {/* Animated Hero Text */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-yellow-500/20 to-orange-500/20 rounded-2xl blur-3xl"></div>
          <div className="relative z-10">
            <TypingHero />
          </div>
        </motion.div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="h-px w-24 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto my-8"
        />

        {/* Description */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-black/60 rounded-xl blur-2xl"></div>
          <p className="relative z-10 text-gray-300 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
            The ultimate meme token launchpad on Core blockchain. Create tokens, copy successful traders, 
            and earn rewards with revolutionary bonding curves and community-driven liquidity.
          </p>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto pt-8"
        >
          <div className="flex flex-col items-center p-4 rounded-lg bg-black/30 border border-gray-800">
            <CheckCircle2 className="w-8 h-8 text-orange-400 mb-2" />
            <h3 className="text-lg font-bold text-white">Live on Testnet</h3>
            <p className="text-sm text-gray-400">Ready for testing</p>
          </div>
          <div className="flex flex-col items-center p-4 rounded-lg bg-black/30 border border-gray-800">
            <Rocket className="w-8 h-8 text-orange-400 mb-2" />
            <h3 className="text-lg font-bold text-white">Copy Trading</h3>
            <p className="text-sm text-gray-400">Follow top traders</p>
          </div>
          <div className="flex flex-col items-center p-4 rounded-lg bg-black/30 border border-gray-800">
            <Users className="w-8 h-8 text-yellow-400 mb-2" />
            <h3 className="text-lg font-bold text-white">Community First</h3>
            <p className="text-sm text-gray-400">Built for degens</p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}