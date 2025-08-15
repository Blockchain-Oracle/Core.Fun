"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

export function TypingHero() {
  const [displayText, setDisplayText] = useState("")
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCursor, setShowCursor] = useState(true)

  const phrases = [
    { text: "meme tokens", color: "text-orange-400", cursorColor: "bg-orange-400" },
    { text: "viral communities", color: "text-yellow-400", cursorColor: "bg-yellow-400" },
    { text: "DeFi revolution", color: "text-amber-400", cursorColor: "bg-amber-400" },
    { text: "your moonshot", color: "text-orange-500", cursorColor: "bg-orange-500" },
    { text: "inspired by neo.bullx.io", color: "text-orange-400", cursorColor: "bg-orange-400" },
  ]

  const baseText = "Launch the next "
  const typingSpeed = 100
  const deletingSpeed = 50
  const pauseTime = 2000

  useEffect(() => {
    const currentPhrase = phrases[currentPhraseIndex].text

    if (!isDeleting && currentCharIndex < currentPhrase.length) {
      const timeout = setTimeout(() => {
        setDisplayText(currentPhrase.substring(0, currentCharIndex + 1))
        setCurrentCharIndex(currentCharIndex + 1)
      }, typingSpeed)
      return () => clearTimeout(timeout)
    } else if (!isDeleting && currentCharIndex === currentPhrase.length) {
      const timeout = setTimeout(() => {
        setIsDeleting(true)
      }, pauseTime)
      return () => clearTimeout(timeout)
    } else if (isDeleting && currentCharIndex > 0) {
      const timeout = setTimeout(() => {
        setDisplayText(currentPhrase.substring(0, currentCharIndex - 1))
        setCurrentCharIndex(currentCharIndex - 1)
      }, deletingSpeed)
      return () => clearTimeout(timeout)
    } else if (isDeleting && currentCharIndex === 0) {
      setIsDeleting(false)
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length)
    }

    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 500)

    return () => clearInterval(cursorInterval)
  }, [currentCharIndex, isDeleting, currentPhraseIndex])

  return (
    <h1 className="text-5xl sm:text-7xl font-bold tracking-tighter font-mono">
      <div className="flex flex-wrap justify-center">
        <span className="text-white mr-2">🚀</span>
        <div className="relative">
          <span className="text-white">{baseText}</span>
          <span className={`${phrases[currentPhraseIndex].color} drop-shadow-[0_0_30px_rgba(251,146,60,0.5)]`}>
            {displayText}
          </span>
          {showCursor && (
            <motion.span
              className={`inline-block w-4 h-10 ${phrases[currentPhraseIndex].cursorColor} ml-1`}
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>
      </div>
    </h1>
  )
}