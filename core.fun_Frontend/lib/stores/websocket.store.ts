import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { io, Socket } from 'socket.io-client'
import { useTokenStore } from './token.store'
import { usePortfolioStore } from './portfolio.store'
import { useNotificationStore } from './notification.store'
import { useWalletStore } from './wallet.store'

// Enable MapSet plugin for Immer to handle Sets and Maps
enableMapSet()

interface WebSocketState {
  socket: Socket | null
  isConnected: boolean
  reconnectAttempts: number
  error: string | null
  
  // Subscriptions
  subscribedChannels: Set<string>
  subscribedTokens: Set<string>
  
  // Actions
  connect: (token?: string) => void
  disconnect: () => void
  subscribe: (channel: string) => void
  unsubscribe: (channel: string) => void
  subscribeToToken: (address: string) => void
  unsubscribeFromToken: (address: string) => void
  emit: (event: string, data: any) => void
}

const WS_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || 'http://localhost:8081'

export const useWebSocketStore = create<WebSocketState>()(
  immer((set, get) => ({
    socket: null,
    isConnected: false,
    reconnectAttempts: 0,
    error: null,
    subscribedChannels: new Set(),
    subscribedTokens: new Set(),

    connect: (token) => {
      const { socket } = get()
      
      // Don't reconnect if already connected
      if (socket?.connected) return

      const newSocket = io(WS_URL, {
        auth: token ? { token } : {},
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      })

      // Connection events
      newSocket.on('connect', () => {
        console.log('WebSocket connected')
        set((state) => {
          state.isConnected = true
          state.reconnectAttempts = 0
          state.error = null
        })

        // Resubscribe to channels
        const { subscribedChannels, subscribedTokens } = get()
        subscribedChannels.forEach(channel => {
          newSocket.emit(`subscribe:${channel}`, {})
        })
        subscribedTokens.forEach(address => {
          newSocket.emit('subscribe:token', { address })
        })
      })

      newSocket.on('disconnect', () => {
        console.log('WebSocket disconnected')
        set((state) => {
          state.isConnected = false
        })
      })

      newSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error)
        set((state) => {
          state.error = error.message
          state.reconnectAttempts += 1
        })
      })

      // Token events
      newSocket.on('token:created', (data) => {
        console.log('New token created:', data)
        
        // Add to token store
        useTokenStore.getState().addNewToken(data.tokenInfo || data)
        
        // Show notification
        const notificationSettings = useNotificationStore.getState().settings
        if (notificationSettings.enableNewTokens) {
          useNotificationStore.getState().addAlert({
            type: 'launch',
            tokenAddress: data.address,
            tokenSymbol: data.symbol,
            message: `New token launched: ${data.name} (${data.symbol})`,
            data
          })
        }
      })

      newSocket.on('token:traded', (data) => {
        console.log('Token traded:', data)
        
        // Update token price if subscribed
        if (get().subscribedTokens.has(data.address)) {
          useTokenStore.getState().updateTokenPrice(data.address, {
            price: data.tokenInfo?.currentPrice || data.price,
            change1h: 0,
            change24h: data.tokenInfo?.priceChange24h || 0,
            volume24h: data.tokenInfo?.volume24h || 0,
            marketCap: data.tokenInfo?.marketCap || 0,
            timestamp: Date.now()
          })
        }
      })

      newSocket.on('token:launched', (data) => {
        console.log('Token graduated:', data)
        
        // Update token status
        useTokenStore.getState().updateToken(data.address, {
          status: 'LAUNCHED'
        })
        
        // Show notification
        useNotificationStore.getState().addAlert({
          type: 'launch',
          tokenAddress: data.address,
          tokenSymbol: data.tokenInfo?.symbol || 'TOKEN',
          message: `Token graduated to DEX: ${data.tokenInfo?.name || 'Token'}`,
          data
        })
      })

      newSocket.on('price:update', (data) => {
        // Update token price
        useTokenStore.getState().updateTokenPrice(data.address, {
          price: data.price,
          change1h: 0,
          change24h: 0,
          volume24h: 0,
          marketCap: data.marketCap || 0,
          timestamp: Date.now()
        })

        // Update portfolio if holding this token
        usePortfolioStore.getState().updateHoldingPrice(data.address, data.price)

        // Check price alerts
        const priceAlerts = useNotificationStore.getState().priceAlerts
        priceAlerts.forEach(alert => {
          if (alert.tokenAddress === data.address && alert.enabled && !alert.triggered) {
            const shouldTrigger = alert.direction === 'above' 
              ? data.price >= alert.targetPrice
              : data.price <= alert.targetPrice
            
            if (shouldTrigger) {
              useNotificationStore.getState().triggerPriceAlert(alert.id)
            }
          }
        })
      })

      // User events
      newSocket.on('user:trade', (data) => {
        console.log('User trade:', data)
        
        // Refresh wallet and portfolio
        useWalletStore.getState().refreshBalance()
        useWalletStore.getState().refreshTransactions()
        usePortfolioStore.getState().fetchPortfolio()
        
        // Show notification
        const notificationSettings = useNotificationStore.getState().settings
        if (notificationSettings.enableTradeConfirmations) {
          useNotificationStore.getState().addAlert({
            type: 'trade',
            tokenAddress: data.token,
            tokenSymbol: data.tokenSymbol || 'TOKEN',
            message: `Trade confirmed: ${data.type} ${data.amount} ${data.tokenSymbol || 'tokens'}`,
            data
          })
        }
      })

      // Alert events
      newSocket.on('alert', (data) => {
        console.log('Alert received:', data)
        
        // Add to notifications
        useNotificationStore.getState().addAlert({
          type: data.type,
          tokenAddress: data.tokenAddress,
          tokenSymbol: data.tokenSymbol,
          message: data.message,
          data
        })
      })

      set((state) => {
        state.socket = newSocket
      })
    },

    disconnect: () => {
      const { socket } = get()
      if (socket) {
        socket.disconnect()
        set((state) => {
          state.socket = null
          state.isConnected = false
          state.subscribedChannels.clear()
          state.subscribedTokens.clear()
        })
      }
    },

    subscribe: (channel) => {
      const { socket } = get()
      if (socket?.connected) {
        socket.emit(`subscribe:${channel}`, {})
        set((state) => {
          state.subscribedChannels.add(channel)
        })
      }
    },

    unsubscribe: (channel) => {
      const { socket } = get()
      if (socket?.connected) {
        socket.emit(`unsubscribe:${channel}`, {})
        set((state) => {
          state.subscribedChannels.delete(channel)
        })
      }
    },

    subscribeToToken: (address) => {
      const { socket } = get()
      if (socket?.connected) {
        socket.emit('subscribe:token', { address })
        set((state) => {
          state.subscribedTokens.add(address)
        })
      }
    },

    unsubscribeFromToken: (address) => {
      const { socket } = get()
      if (socket?.connected) {
        socket.emit('unsubscribe:token', { address })
        set((state) => {
          state.subscribedTokens.delete(address)
        })
      }
    },

    emit: (event, data) => {
      const { socket } = get()
      if (socket?.connected) {
        socket.emit(event, data)
      }
    }
  }))
)

export default WebSocketState