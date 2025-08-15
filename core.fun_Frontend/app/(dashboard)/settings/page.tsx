'use client'

import { Settings, Send, Palette, Keyboard, Bell, Moon, Globe, Sparkles } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
          Settings Hub
        </h2>
        <p className="text-white/60 text-lg">Your command center is being built! 🚧</p>
      </div>

      {/* Coming Soon Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/10 via-yellow-500/5 to-transparent border border-orange-500/20 p-8">
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="relative space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 p-0.5">
              <div className="w-full h-full bg-black rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Settings Coming Soon!</h3>
              <p className="text-orange-400">We're cooking something special 👨‍🍳</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Features Preview */}
            <div className="space-y-3">
              <h4 className="text-white/80 font-semibold mb-3">What's brewing:</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-white/60">
                  <Palette className="w-4 h-4 text-orange-400" />
                  <span>Custom themes & color schemes</span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <Keyboard className="w-4 h-4 text-orange-400" />
                  <span>Keyboard shortcuts & hotkeys</span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <Bell className="w-4 h-4 text-orange-400" />
                  <span>Notification preferences</span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <Moon className="w-4 h-4 text-orange-400" />
                  <span>Dark/Light mode toggle</span>
                </div>
                <div className="flex items-center gap-2 text-white/60">
                  <Globe className="w-4 h-4 text-orange-400" />
                  <span>Language & region settings</span>
                </div>
              </div>
            </div>

            {/* Telegram CTA */}
            <div className="bg-black/30 rounded-xl p-6 border border-white/10">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-400" />
                  <h4 className="font-semibold text-white">Meanwhile on Telegram...</h4>
                </div>
                <p className="text-white/60 text-sm">
                  Can't wait? Our Telegram bot already has some settings you can configure!
                </p>
                <div className="space-y-2 text-sm">
                  <div className="text-blue-400">• /settings - View current config</div>
                  <div className="text-blue-400">• /alerts on/off - Toggle price alerts</div>
                  <div className="text-blue-400">• /slippage - Set trading slippage</div>
                </div>
                <a 
                  href="https://t.me/core_dot_fun_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:from-blue-400 hover:to-blue-500 transition-all"
                >
                  <Send className="w-4 h-4" />
                  Configure in Telegram
                </a>
              </div>
            </div>
          </div>

          {/* Fun message */}
          <div className="mt-6 p-4 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/20">
            <p className="text-center text-white/70">
              <span className="text-orange-400 font-semibold">Pro tip:</span> While we're building the ultimate settings experience, 
              your current setup is already optimized for maximum degen mode! 🚀
            </p>
          </div>
        </div>
      </div>

      {/* Easter egg */}
      <div className="text-center text-white/40 text-sm">
        <p>🎮 Fun fact: Press <kbd className="px-2 py-1 bg-white/10 rounded text-xs">Ctrl</kbd> + <kbd className="px-2 py-1 bg-white/10 rounded text-xs">K</kbd> anywhere to open quick actions (coming soon™)</p>
      </div>
    </div>
  )
}
