import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface UIPreferences {
  theme: 'dark' | 'light' | 'system'
  viewMode: 'grid' | 'list' | 'table'
  compactMode: boolean
  showPrices: boolean
  showCharts: boolean
  showVolume: boolean
  animationsEnabled: boolean
  sidebarCollapsed: boolean
  bottomBarExpanded: boolean
}

interface UIState {
  // Preferences (Persistent)
  preferences: UIPreferences
  
  // Modals
  activeModal: string | null
  modalData: any
  
  // Sidebar & Navigation
  sidebarOpen: boolean
  mobileNavOpen: boolean
  activeTab: string
  
  // Loading & Error states
  globalLoading: boolean
  globalError: string | null
  
  // Toast notifications
  toasts: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    title: string
    description?: string
    duration?: number
  }>
  
  // Actions
  updatePreferences: (prefs: Partial<UIPreferences>) => void
  toggleSidebar: () => void
  toggleMobileNav: () => void
  setActiveTab: (tab: string) => void
  openModal: (modalId: string, data?: any) => void
  closeModal: () => void
  setGlobalLoading: (loading: boolean) => void
  setGlobalError: (error: string | null) => void
  showToast: (toast: Omit<UIState['toasts'][0], 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    immer((set, get) => ({
      // Default preferences
      preferences: {
        theme: 'dark',
        viewMode: 'list',
        compactMode: false,
        showPrices: true,
        showCharts: true,
        showVolume: true,
        animationsEnabled: true,
        sidebarCollapsed: false,
        bottomBarExpanded: false
      },
      
      // Initial state
      activeModal: null,
      modalData: null,
      sidebarOpen: true,
      mobileNavOpen: false,
      activeTab: 'explore',
      globalLoading: false,
      globalError: null,
      toasts: [],

      // Update preferences
      updatePreferences: (newPrefs) => {
        set((state) => {
          state.preferences = { ...state.preferences, ...newPrefs }
        })
      },

      // Toggle sidebar
      toggleSidebar: () => {
        set((state) => {
          state.sidebarOpen = !state.sidebarOpen
          state.preferences.sidebarCollapsed = !state.sidebarOpen
        })
      },

      // Toggle mobile nav
      toggleMobileNav: () => {
        set((state) => {
          state.mobileNavOpen = !state.mobileNavOpen
        })
      },

      // Set active tab
      setActiveTab: (tab) => {
        set((state) => {
          state.activeTab = tab
        })
      },

      // Modal management
      openModal: (modalId, data) => {
        set((state) => {
          state.activeModal = modalId
          state.modalData = data
        })
      },

      closeModal: () => {
        set((state) => {
          state.activeModal = null
          state.modalData = null
        })
      },

      // Loading & Error
      setGlobalLoading: (loading) => {
        set((state) => {
          state.globalLoading = loading
        })
      },

      setGlobalError: (error) => {
        set((state) => {
          state.globalError = error
        })
      },

      // Toast notifications
      showToast: (toastData) => {
        const toast = {
          ...toastData,
          id: `toast-${Date.now()}-${Math.random()}`,
          duration: toastData.duration || 5000
        }

        set((state) => {
          state.toasts.push(toast)
        })

        // Auto-remove toast after duration
        if (toast.duration && toast.duration > 0) {
          setTimeout(() => {
            get().removeToast(toast.id)
          }, toast.duration)
        }
      },

      removeToast: (id) => {
        set((state) => {
          const index = state.toasts.findIndex(t => t.id === id)
          if (index > -1) {
            state.toasts.splice(index, 1)
          }
        })
      },

      clearToasts: () => {
        set((state) => {
          state.toasts = []
        })
      }
    })),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist preferences
        preferences: state.preferences
      })
    }
  )
)