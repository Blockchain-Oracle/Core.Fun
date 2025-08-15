"use client"

import { motion } from "framer-motion"
import { Send, Bot, MessageCircle, Bell } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"

export function TelegramSection() {
  return (
    <section className="py-20 px-4 sm:px-6 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-600/10 via-blue-500/5 to-transparent border-blue-500/20">
            {/* Animated background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-blue-500/10 animate-pulse" />
            
            <div className="relative p-8 md:p-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                {/* Left content */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-0.5">
                      <div className="w-full h-full bg-black rounded-xl flex items-center justify-center">
                        <Send className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-white">Telegram Integration</h2>
                      <p className="text-blue-400 font-medium">@core_dot_fun_bot</p>
                    </div>
                  </div>

                  <p className="text-lg text-gray-300 leading-relaxed">
                    Access core.fun directly from Telegram! Login with your Telegram account to unlock 
                    seamless trading, real-time notifications, and community features.
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Bot className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">Trade from Telegram</h4>
                        <p className="text-sm text-gray-400">Execute trades directly in your chat</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Bell className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">Price Alerts</h4>
                        <p className="text-sm text-gray-400">Get notified when tokens pump or dump</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MessageCircle className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">Community Access</h4>
                        <p className="text-sm text-gray-400">Join token communities and chat with traders</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link 
                      href="/login"
                      className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-bold hover:from-blue-400 hover:to-blue-500 transition-all"
                    >
                      <Send className="w-5 h-5 mr-2" />
                      Login with Telegram
                    </Link>
                    <a 
                      href="https://t.me/core_dot_fun_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-6 py-3 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-700 transition-all border border-gray-700"
                    >
                      Open Bot
                    </a>
                  </div>
                </div>

                {/* Right content - Telegram mockup */}
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="w-72 h-[500px] bg-gradient-to-b from-gray-900 to-black rounded-3xl border border-gray-800 p-4">
                      <div className="bg-blue-600 rounded-2xl p-3 mb-3">
                        <div className="flex items-center gap-2 text-white">
                          <Send className="w-5 h-5" />
                          <span className="font-semibold">@core_dot_fun_bot</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="bg-gray-800/50 rounded-xl p-3">
                          <p className="text-sm text-gray-400">Bot</p>
                          <p className="text-white">Welcome to core.fun! 🚀</p>
                          <p className="text-white mt-1">Login to start trading meme tokens on Core blockchain.</p>
                        </div>
                        
                        <div className="bg-blue-600/20 rounded-xl p-3 ml-12">
                          <p className="text-sm text-blue-400">You</p>
                          <p className="text-white">/start</p>
                        </div>
                        
                        <div className="bg-gray-800/50 rounded-xl p-3">
                          <p className="text-sm text-gray-400">Bot</p>
                          <p className="text-white">✅ Authentication successful!</p>
                          <div className="mt-2 space-y-1">
                            <div className="bg-orange-500/20 rounded px-2 py-1 text-sm text-orange-400 inline-block">
                              /trade - Start trading
                            </div>
                            <div className="bg-orange-500/20 rounded px-2 py-1 text-sm text-orange-400 inline-block ml-2">
                              /portfolio - View holdings
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Floating badges */}
                    <motion.div
                      className="absolute -top-4 -right-4 bg-orange-500 text-black px-3 py-1 rounded-full font-bold text-sm"
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      NEW
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}