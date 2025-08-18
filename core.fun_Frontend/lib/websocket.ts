import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { create } from 'zustand'

const getWebSocketUrl = () => {
  // In browser, determine URL dynamically
  if (typeof window !== 'undefined') {
    // Check for environment variable first
    if (process.env.NEXT_PUBLIC_WEBSOCKET_URL) {
      return process.env.NEXT_PUBLIC_WEBSOCKET_URL
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    // Use port 8081 for WebSocket
    return `${protocol}//${host}:8081`
  }
  
  // Server-side: use environment variable or default
  return process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8081'
}

interface WebSocketState {
  socket: Socket | null
  isConnected: boolean
  reconnectAttempts: number
  lastError: string | null
  
  // Subscriptions
  subscriptions: Set<string>
  
  // Actions
  connect: () => void
  disconnect: () => void
  subscribe: (channel: string) => void
  unsubscribe: (channel: string) => void
  emit: (event: string, data: any) => void
  
  // Event handlers
  onPriceUpdate: (callback: (data: any) => void) => () => void
  onTokenCreated: (callback: (data: any) => void) => () => void
  onTokenTraded: (callback: (data: any) => void) => () => void
  onTokenGraduated: (callback: (data: any) => void) => () => void
  onAlert: (callback: (data: any) => void) => () => void
}

export const useWebSocket = create<WebSocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  reconnectAttempts: 0,
  lastError: null,
  subscriptions: new Set(),

  connect: () => {
    const { socket } = get()
    
    // Don't connect if already connected
    if (socket?.connected) return

    // Get URL dynamically when connecting
    const wsUrl = getWebSocketUrl()
    console.log('Connecting to WebSocket:', wsUrl)
    
    const newSocket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    // Connection events
    newSocket.on('connect', () => {
      console.log('WebSocket connected')
      set({ isConnected: true, reconnectAttempts: 0, lastError: null })
      
      // Re-subscribe to channels after reconnection
      const { subscriptions } = get()
      subscriptions.forEach(channel => {
        newSocket.emit('subscribe', { channel })
      })
    })

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
      set({ isConnected: false })
    })

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error)
      set(state => ({
        lastError: error.message,
        reconnectAttempts: state.reconnectAttempts + 1
      }))
    })

    // Data events
    newSocket.on('price:update', (data) => {
      window.dispatchEvent(new CustomEvent('ws:price:update', { detail: data }))
    })

    newSocket.on('token:created', (data) => {
      window.dispatchEvent(new CustomEvent('ws:token:created', { detail: data }))
    })

    newSocket.on('token:traded', (data) => {
      window.dispatchEvent(new CustomEvent('ws:token:traded', { detail: data }))
    })

    newSocket.on('token:graduated', (data) => {
      window.dispatchEvent(new CustomEvent('ws:token:graduated', { detail: data }))
    })

    newSocket.on('alert', (data) => {
      window.dispatchEvent(new CustomEvent('ws:alert', { detail: data }))
    })

    set({ socket: newSocket })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, isConnected: false, subscriptions: new Set() })
    }
  },

  subscribe: (channel: string) => {
    const { socket, subscriptions } = get()
    
    if (!subscriptions.has(channel)) {
      subscriptions.add(channel)
      set({ subscriptions: new Set(subscriptions) })
      
      if (socket?.connected) {
        socket.emit('subscribe', { channel })
      }
    }
  },

  unsubscribe: (channel: string) => {
    const { socket, subscriptions } = get()
    
    if (subscriptions.has(channel)) {
      subscriptions.delete(channel)
      set({ subscriptions: new Set(subscriptions) })
      
      if (socket?.connected) {
        socket.emit('unsubscribe', { channel })
      }
    }
  },

  emit: (event: string, data: any) => {
    const { socket } = get()
    if (socket?.connected) {
      socket.emit(event, data)
    }
  },

  onPriceUpdate: (callback: (data: any) => void) => {
    const handler = (event: CustomEvent) => callback(event.detail)
    window.addEventListener('ws:price:update', handler as any)
    return () => window.removeEventListener('ws:price:update', handler as any)
  },

  onTokenCreated: (callback: (data: any) => void) => {
    const handler = (event: CustomEvent) => callback(event.detail)
    window.addEventListener('ws:token:created', handler as any)
    return () => window.removeEventListener('ws:token:created', handler as any)
  },

  onTokenTraded: (callback: (data: any) => void) => {
    const handler = (event: CustomEvent) => callback(event.detail)
    window.addEventListener('ws:token:traded', handler as any)
    return () => window.removeEventListener('ws:token:traded', handler as any)
  },

  onTokenGraduated: (callback: (data: any) => void) => {
    const handler = (event: CustomEvent) => callback(event.detail)
    window.addEventListener('ws:token:graduated', handler as any)
    return () => window.removeEventListener('ws:token:graduated', handler as any)
  },

  onAlert: (callback: (data: any) => void) => {
    const handler = (event: CustomEvent) => callback(event.detail)
    window.addEventListener('ws:alert', handler as any)
    return () => window.removeEventListener('ws:alert', handler as any)
  },
}))

// Hook for using WebSocket in components
export function useRealtimeUpdates(tokenAddress?: string) {
  const { connect, disconnect, subscribe, unsubscribe, isConnected } = useWebSocket()
  
  useEffect(() => {
    // Connect on mount
    connect()
    
    // Subscribe to token-specific updates if address provided
    if (tokenAddress) {
      subscribe(`token:${tokenAddress}`)
    }
    
    // Subscribe to general channels
    subscribe('prices')
    subscribe('tokens')
    subscribe('trades')
    
    return () => {
      // Unsubscribe from token-specific updates
      if (tokenAddress) {
        unsubscribe(`token:${tokenAddress}`)
      }
      
      // Don't disconnect on unmount as other components might be using it
      // The connection will be closed when the app unmounts
    }
  }, [tokenAddress, connect, subscribe, unsubscribe])
  
  return { isConnected }
}

// Hook for price updates
export function usePriceUpdates(callback: (data: any) => void) {
  const { onPriceUpdate } = useWebSocket()
  
  useEffect(() => {
    const unsubscribe = onPriceUpdate(callback)
    return unsubscribe
  }, [callback, onPriceUpdate])
}

// Hook for new token alerts
export function useNewTokenAlerts(callback: (data: any) => void) {
  const { onTokenCreated } = useWebSocket()
  
  useEffect(() => {
    const unsubscribe = onTokenCreated(callback)
    return unsubscribe
  }, [callback, onTokenCreated])
}

// Hook for trade updates
export function useTradeUpdates(callback: (data: any) => void) {
  const { onTokenTraded } = useWebSocket()
  
  useEffect(() => {
    const unsubscribe = onTokenTraded(callback)
    return unsubscribe
  }, [callback, onTokenTraded])
}

// Hook for graduation alerts
export function useGraduationAlerts(callback: (data: any) => void) {
  const { onTokenGraduated } = useWebSocket()
  
  useEffect(() => {
    const unsubscribe = onTokenGraduated(callback)
    return unsubscribe
  }, [callback, onTokenGraduated])
}

// Hook for general alerts
export function useAlerts(callback: (data: any) => void) {
  const { onAlert } = useWebSocket()
  
  useEffect(() => {
    const unsubscribe = onAlert(callback)
    return unsubscribe
  }, [callback, onAlert])
}

// Export wsClient for compatibility
export const wsClient = {
  connect: () => useWebSocket.getState().connect(),
  disconnect: () => useWebSocket.getState().disconnect(),
  subscribe: (channel: string) => useWebSocket.getState().subscribe(channel),
  unsubscribe: (channel: string) => useWebSocket.getState().unsubscribe(channel),
  emit: (event: string, data: any) => useWebSocket.getState().emit(event, data),
  isConnected: () => useWebSocket.getState().isConnected,
  on: (event: string, callback: (data: any) => void) => {
    const socket = useWebSocket.getState().socket
    if (socket) {
      socket.on(event, callback)
      return () => socket.off(event, callback)
    }
    return () => {}
  },
  off: (event: string, callback?: (data: any) => void) => {
    const socket = useWebSocket.getState().socket
    if (socket) {
      socket.off(event, callback)
    }
  },
}