"use client"

import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { getTokenColor, getTokenImageUrl, getTokenInitials } from "@/lib/token-utils"

interface TokenAvatarProps {
  token: {
    name: string
    symbol: string
    address: string
    image_url?: string | null
    imageUrl?: string | null
  }
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  showVerifiedBadge?: boolean
  isVerified?: boolean
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg"
}

export function TokenAvatar({ 
  token, 
  size = "lg", 
  className,
  showVerifiedBadge = false,
  isVerified = false
}: TokenAvatarProps) {
  const [imageError, setImageError] = useState(false)
  const imageUrl = getTokenImageUrl(token)
  const shouldShowImage = imageUrl && !imageError
  const initials = getTokenInitials(token.symbol)
  const gradientColors = getTokenColor(token.address)

  return (
    <div className={cn("relative", className)}>
      <div 
        className={cn(
          "rounded-xl overflow-hidden flex items-center justify-center font-bold",
          sizeClasses[size],
          !shouldShowImage && `bg-gradient-to-br ${gradientColors} text-white`,
          shouldShowImage && "bg-black/20"
        )}
      >
        {shouldShowImage ? (
          <Image
            src={imageUrl}
            alt={token.name}
            width={size === "sm" ? 32 : size === "md" ? 40 : size === "lg" ? 48 : 64}
            height={size === "sm" ? 32 : size === "md" ? 40 : size === "lg" ? 48 : 64}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="select-none">{initials}</span>
        )}
      </div>
      
      {/* Verified badge */}
      {showVerifiedBadge && isVerified && (
        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-orange-500 border-2 border-black flex items-center justify-center">
          <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  )
}