import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface Alert {
  id: string
  type: 'price' | 'launch' | 'liquidity' | 'trade' | 'rug'
  tokenAddress: string
  tokenSymbol: string
  message: string
  timestamp: number
  read: boolean
  data?: any
}

interface NotificationSettings {
  enableNewTokens: boolean
  enablePriceAlerts: boolean
  enableTradeConfirmations: boolean
  enableLargeTransactions: boolean
  enableWhaleAlerts: boolean
  enableRugWarnings: boolean
  soundEnabled: boolean
  desktopNotifications: boolean
}

interface PriceAlert {
  id: string
  tokenAddress: string
  tokenSymbol: string
  targetPrice: number
  direction: 'above' | 'below'
  enabled: boolean
  triggered: boolean
  triggeredAt?: number
}

interface NotificationState {
  // Alerts
  alerts: Alert[]
  unreadCount: number
  
  // Settings (Persistent)
  settings: NotificationSettings
  
  // Price Alerts (Persistent)
  priceAlerts: PriceAlert[]
  
  // Actions
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAlert: (id: string) => void
  clearAllAlerts: () => void
  updateSettings: (settings: Partial<NotificationSettings>) => void
  addPriceAlert: (alert: Omit<PriceAlert, 'id' | 'triggered' | 'triggeredAt'>) => void
  removePriceAlert: (id: string) => void
  togglePriceAlert: (id: string) => void
  triggerPriceAlert: (id: string) => void
  playNotificationSound: () => void
  showDesktopNotification: (title: string, body: string) => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      alerts: [],
      unreadCount: 0,
      settings: {
        enableNewTokens: true,
        enablePriceAlerts: true,
        enableTradeConfirmations: true,
        enableLargeTransactions: false,
        enableWhaleAlerts: false,
        enableRugWarnings: true,
        soundEnabled: true,
        desktopNotifications: false
      },
      priceAlerts: [],

      // Add alert
      addAlert: (alertData) => {
        const alert: Alert = {
          ...alertData,
          id: `alert-${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          read: false
        }

        set((state) => {
          state.alerts.unshift(alert)
          state.unreadCount += 1
          
          // Keep only last 100 alerts
          if (state.alerts.length > 100) {
            state.alerts = state.alerts.slice(0, 100)
          }
        })

        // Play sound if enabled
        const { settings } = get()
        if (settings.soundEnabled) {
          get().playNotificationSound()
        }

        // Show desktop notification if enabled
        if (settings.desktopNotifications) {
          get().showDesktopNotification(
            `${alertData.type.toUpperCase()} Alert`,
            alertData.message
          )
        }
      },

      // Mark as read
      markAsRead: (id) => {
        set((state) => {
          const alert = state.alerts.find(a => a.id === id)
          if (alert && !alert.read) {
            alert.read = true
            state.unreadCount = Math.max(0, state.unreadCount - 1)
          }
        })
      },

      // Mark all as read
      markAllAsRead: () => {
        set((state) => {
          state.alerts.forEach(alert => {
            alert.read = true
          })
          state.unreadCount = 0
        })
      },

      // Clear alert
      clearAlert: (id) => {
        set((state) => {
          const index = state.alerts.findIndex(a => a.id === id)
          if (index > -1) {
            if (!state.alerts[index].read) {
              state.unreadCount = Math.max(0, state.unreadCount - 1)
            }
            state.alerts.splice(index, 1)
          }
        })
      },

      // Clear all alerts
      clearAllAlerts: () => {
        set((state) => {
          state.alerts = []
          state.unreadCount = 0
        })
      },

      // Update settings
      updateSettings: (newSettings) => {
        set((state) => {
          state.settings = { ...state.settings, ...newSettings }
        })

        // Request notification permission if enabling desktop notifications
        if (newSettings.desktopNotifications && 'Notification' in window) {
          Notification.requestPermission()
        }
      },

      // Add price alert
      addPriceAlert: (alertData) => {
        const alert: PriceAlert = {
          ...alertData,
          id: `price-alert-${Date.now()}`,
          triggered: false
        }

        set((state) => {
          state.priceAlerts.push(alert)
        })
      },

      // Remove price alert
      removePriceAlert: (id) => {
        set((state) => {
          const index = state.priceAlerts.findIndex(a => a.id === id)
          if (index > -1) {
            state.priceAlerts.splice(index, 1)
          }
        })
      },

      // Toggle price alert
      togglePriceAlert: (id) => {
        set((state) => {
          const alert = state.priceAlerts.find(a => a.id === id)
          if (alert) {
            alert.enabled = !alert.enabled
            if (alert.enabled) {
              alert.triggered = false
              alert.triggeredAt = undefined
            }
          }
        })
      },

      // Trigger price alert
      triggerPriceAlert: (id) => {
        set((state) => {
          const alert = state.priceAlerts.find(a => a.id === id)
          if (alert && alert.enabled && !alert.triggered) {
            alert.triggered = true
            alert.triggeredAt = Date.now()
            
            // Add to alerts
            get().addAlert({
              type: 'price',
              tokenAddress: alert.tokenAddress,
              tokenSymbol: alert.tokenSymbol,
              message: `${alert.tokenSymbol} price ${alert.direction === 'above' ? 'exceeded' : 'fell below'} ${alert.targetPrice}`,
              data: { priceAlertId: alert.id }
            })
          }
        })
      },

      // Play notification sound
      playNotificationSound: () => {
        try {
          const audio = new Audio('/sounds/notification.mp3')
          audio.volume = 0.5
          audio.play().catch(console.error)
        } catch (error) {
          console.error('Failed to play notification sound:', error)
        }
      },

      // Show desktop notification
      showDesktopNotification: (title, body) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, {
              body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: 'core-fun-notification',
              renotify: true
            })
          } catch (error) {
            console.error('Failed to show desktop notification:', error)
          }
        }
      }
    })),
    {
      name: 'notification-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist settings and price alerts
        settings: state.settings,
        priceAlerts: state.priceAlerts
      })
    }
  )
)

export default NotificationState