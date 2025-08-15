/**
 * Token utility functions
 */

/**
 * Generate a deterministic color based on token address
 */
export function getTokenColor(address: string): string {
  // Use address to generate a consistent color
  const colors = [
    'from-blue-500 to-purple-500',
    'from-orange-500 to-orange-500',
    'from-orange-500 to-red-500',
    'from-pink-500 to-rose-500',
    'from-yellow-500 to-amber-500',
    'from-indigo-500 to-blue-500',
    'from-purple-500 to-pink-500',
    'from-cyan-500 to-blue-500',
    'from-teal-500 to-orange-500',
    'from-lime-500 to-orange-500',
  ]
  
  // Simple hash of address to get consistent index
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Get token image URL with fallback
 */
export function getTokenImageUrl(token: {
  image_url?: string | null
  imageUrl?: string | null
  symbol: string
  address: string
}): string | null {
  // Check if token has a real image URL
  const imageUrl = token.image_url || token.imageUrl
  
  if (imageUrl && imageUrl.startsWith('http')) {
    return imageUrl
  }
  
  // Return null to use fallback avatar
  return null
}

/**
 * Get initials for token avatar
 */
export function getTokenInitials(symbol: string): string {
  // Get first 1-2 characters of symbol
  const clean = symbol.replace(/[\$\-\_]/g, '').toUpperCase()
  return clean.slice(0, Math.min(2, clean.length))
}