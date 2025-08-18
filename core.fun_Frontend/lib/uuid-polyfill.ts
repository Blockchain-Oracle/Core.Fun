// Polyfill for crypto.randomUUID if not available
if (typeof window !== 'undefined' && !window.crypto?.randomUUID) {
  if (window.crypto) {
    window.crypto.randomUUID = function(): string {
      // Generate UUID v4 using crypto.getRandomValues
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      
      // Set version (4) and variant bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      
      // Convert to hex string
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  }
}

export {}