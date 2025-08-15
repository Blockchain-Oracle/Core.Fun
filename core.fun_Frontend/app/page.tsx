"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CodeRain } from "@/components/landing/CodeRain"
import { SpinningEarth } from "@/components/landing/SpinningEarth"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { MilestoneSection } from "@/components/landing/MilestoneSection"
import { CTASection } from "@/components/landing/CTASection"
import { TelegramSection } from "@/components/landing/TelegramSection"
import { useAuthStore } from "@/lib/stores/auth.store"
import { Menu, X } from "lucide-react"
import { useState } from "react"

export default function Home() {
  const { isAuthenticated } = useAuthStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <main className="relative min-h-screen bg-black text-white overflow-x-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 z-0">
        {/* Spinning Earth */}
        <div className="opacity-10">
          <SpinningEarth />
        </div>
        {/* Code rain */}
        <div className="opacity-10">
          <CodeRain />
        </div>
      </div>

      {/* Hero Video - Full screen background */}
      <div className="fixed inset-0 z-[1] pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-20"
          style={{
            filter: "contrast(1.2) brightness(0.8) saturate(1.5) hue-rotate(10deg)",
          }}
        >
          <source src="https://cdn.pixabay.com/video/2024/02/07/199508-911209154_large.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Content container */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex justify-between items-center h-16">
              {/* Logo */}
              <Link href="/" className="flex items-center space-x-2">
                <span className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  core.fun
                </span>
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center space-x-8">
                <Link href="#features" className="text-gray-300 hover:text-orange-400 transition-colors">
                  Features
                </Link>
                <Link href="#milestones" className="text-gray-300 hover:text-orange-400 transition-colors">
                  Roadmap
                </Link>
                <Link href="/explore" className="text-gray-300 hover:text-orange-400 transition-colors">
                  Explore
                </Link>
                {isAuthenticated ? (
                  <Link 
                    href="/explore" 
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-black font-bold rounded-lg hover:from-orange-400 hover:to-yellow-400 transition-all"
                  >
                    Dashboard
                  </Link>
                ) : (
                  <Link 
                    href="/login" 
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-black font-bold rounded-lg hover:from-orange-400 hover:to-yellow-400 transition-all"
                  >
                    Login
                  </Link>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                className="md:hidden text-gray-300 hover:text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="md:hidden bg-black/95 border-t border-gray-800"
            >
              <div className="px-4 py-4 space-y-3">
                <Link 
                  href="#features" 
                  className="block text-gray-300 hover:text-orange-400 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Features
                </Link>
                <Link 
                  href="#milestones" 
                  className="block text-gray-300 hover:text-orange-400 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Roadmap
                </Link>
                <Link 
                  href="/explore" 
                  className="block text-gray-300 hover:text-orange-400 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Explore
                </Link>
                {isAuthenticated ? (
                  <Link 
                    href="/explore" 
                    className="block w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-black font-bold rounded-lg text-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                ) : (
                  <Link 
                    href="/login" 
                    className="block w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-black font-bold rounded-lg text-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Login
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </nav>

        {/* Main Content */}
        <div className="pt-16">
          <HeroSection />
          <FeaturesSection />
          <TelegramSection />
          <MilestoneSection />
          <CTASection />
        </div>

        {/* Footer */}
        <footer className="relative z-10 bg-black/80 border-t border-gray-800 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="text-gray-400 text-sm">
                © 2024 core.fun - All rights reserved
              </div>
              <div className="flex space-x-6">
                <Link href="#" className="text-gray-400 hover:text-orange-400 transition-colors text-sm">
                  Terms
                </Link>
                <Link href="#" className="text-gray-400 hover:text-orange-400 transition-colors text-sm">
                  Privacy
                </Link>
                <Link href="#" className="text-gray-400 hover:text-orange-400 transition-colors text-sm">
                  Docs
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}