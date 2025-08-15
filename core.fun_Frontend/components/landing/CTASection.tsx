"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { useAuthStore } from "@/lib/stores/auth.store"
import { Zap, ArrowRight, Sparkles } from "lucide-react"

export function CTASection() {
  const { isAuthenticated } = useAuthStore()

  return (
    <section id="cta" className="py-20 px-4 sm:px-6 relative">
      <div className="max-w-4xl mx-auto text-center space-y-12">
        <div className="space-y-6">
          <motion.h2
            className="text-4xl sm:text-5xl font-bold"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <span className="text-white">Ready to </span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-yellow-400">
              go to the moon?
            </span>
          </motion.h2>
          
          <motion.div
            className="h-px w-24 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          />
          
          <motion.p
            className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
          >
            Test our platform on Core Testnet today. Launch tokens, copy top traders, 
            and experience the future of meme token trading.
          </motion.p>
        </div>

        <motion.div
          className="pt-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="flex flex-col items-center space-y-6">
            {/* Main CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/explore"
                    className="group relative px-8 py-4 bg-gradient-to-r from-orange-500 to-yellow-500 text-black rounded-lg font-bold text-lg hover:from-orange-400 hover:to-yellow-400 transition-all duration-300 transform hover:scale-105 hover:shadow-[0_0_30px_rgba(251,146,60,0.4)]"
                  >
                    <span className="flex items-center space-x-2">
                      <Zap className="w-5 h-5" />
                      <span>Go to Dashboard</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </Link>
                  
                  <Link
                    href="/create-token"
                    className="group relative px-8 py-4 bg-gray-800 text-white rounded-lg font-bold text-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 border border-gray-700"
                  >
                    <span className="flex items-center space-x-2">
                      <Sparkles className="w-5 h-5" />
                      <span>Create Token</span>
                    </span>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="group relative px-8 py-4 bg-gradient-to-r from-orange-500 to-yellow-500 text-black rounded-lg font-bold text-lg hover:from-orange-400 hover:to-yellow-400 transition-all duration-300 transform hover:scale-105 hover:shadow-[0_0_30px_rgba(251,146,60,0.4)]"
                  >
                    <span className="flex items-center space-x-2">
                      <Zap className="w-5 h-5" />
                      <span>Get Started</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </Link>
                  
                  <Link
                    href="/explore"
                    className="group relative px-8 py-4 bg-gray-800 text-white rounded-lg font-bold text-lg hover:bg-gray-700 transition-all duration-300 transform hover:scale-105 border border-gray-700"
                  >
                    <span className="flex items-center space-x-2">
                      <span>Explore Tokens</span>
                    </span>
                  </Link>
                </>
              )}
            </div>

            {/* Benefits list */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center max-w-3xl mt-8">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <span className="text-orange-400 font-bold text-sm">✓</span>
                </div>
                <p className="text-sm text-gray-400">No coding required</p>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-sm">✓</span>
                </div>
                <p className="text-sm text-gray-400">Instant liquidity</p>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center">
                  <span className="text-amber-400 font-bold text-sm">✓</span>
                </div>
                <p className="text-sm text-gray-400">Community-driven</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Footer text */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          viewport={{ once: true }}
          className="pt-8"
        >
          <p className="text-xs text-gray-500">
            Powered by Core Blockchain • Audited Smart Contracts • 100% Decentralized
          </p>
        </motion.div>
      </div>
    </section>
  )
}