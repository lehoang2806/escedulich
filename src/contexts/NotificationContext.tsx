// import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface NotificationItem {
  Id?: number | string
  id?: number | string
  Title?: string
  title?: string
  Message?: string
  message?: string
  CreatedAt?: string
  createdAt?: string
  IsRead?: boolean
  isRead?: boolean
  [key: string]: any
}

interface ToastItem {
  id: number
  title: string
  message: string
  type: 'success' | 'info' | 'warning' | 'error'
}

interface NotificationContextType {
  notifications: NotificationItem[]
  isConnected: boolean
  connection: any | null
  addNotification: (n: NotificationItem) => void
  removeNotification: (id: string | number) => void
  markAsRead: (id: string | number) => void
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>
  showToast: (title: string, message: string, type?: 'success' | 'info' | 'warning' | 'error') => void
  toasts: ToastItem[]
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState<any>([])
  const [isConnected, setIsConnected] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const connectionRef = useRef<any>(null)

  // Show toast notification
  const showToast = useCallback((title: string, message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, title, message, type }])
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }, [])

  // Remove toast
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    // Lazy load SignalR chỉ khi cần thiết và có token
    const token = localStorage.getItem('token')
    if (!token) {
      return
    }

    // Delay SignalR connection để không block initial render
    // Load SignalR module và connect sau khi app đã render xong
    let mounted = true
    let connectionTimeout: NodeJS.Timeout | null = null

    const initSignalR = async () => {
      try {
        // Lazy load SignalR module
        const signalR = await import('@microsoft/signalr')
        
        if (!mounted) return

        // Create SignalR connection (dùng cùng domain với API deploy)
        const apiBase = (import.meta as any).env.VITE_API_URL || '/api'
        const backendRoot = apiBase.replace('/api', '')
        const newConnection = new signalR.HubConnectionBuilder()
          .withUrl(`${backendRoot}/notificationhub`, {
            accessTokenFactory: () => token,
            skipNegotiation: false,
            transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
          })
          .withAutomaticReconnect()
          .build()

        // Set up event handlers
        newConnection.on('ReceiveNotification', (notification) => {
          if (!mounted) return
          setNotifications((prev) => {
            // Check if notification already exists to avoid duplicates
            const exists = prev.some((n) => (n.Id || n.id) === (notification.Id || notification.id))
            if (exists) return prev
            // Add new notification at the beginning and sort by date
            const updated = [notification, ...prev]
            return updated.sort((a, b) => {
              const dateA = new Date(a.CreatedAt || a.createdAt || 0).getTime()
              const dateB = new Date(b.CreatedAt || b.createdAt || 0).getTime()
              return dateB - dateA
            })
          })
          
          // Show toast for new notification
          const title = notification.Title || notification.title || 'Thông báo mới'
          const message = notification.Message || notification.message || ''
          showToast(title, message, 'info')
        })

        newConnection.on('LoadOldNotifications', (oldNotifications) => {
          if (!mounted) return
          // Sort by CreatedAt descending (newest first)
          const sorted = (oldNotifications || []).sort((a, b) => {
            const dateA = new Date(a.CreatedAt || a.createdAt || 0).getTime()
            const dateB = new Date(b.CreatedAt || b.createdAt || 0).getTime()
            return dateB - dateA
          })
          setNotifications(sorted)
        })

        // Handle connection events
        newConnection.onclose(() => {
          if (mounted) setIsConnected(false)
        })

        newConnection.onreconnecting(() => {
          if (mounted) setIsConnected(false)
        })

        newConnection.onreconnected(() => {
          if (mounted) setIsConnected(true)
        })

        // Start connection
        await newConnection.start()
        
        if (mounted) {
          setIsConnected(true)
          connectionRef.current = newConnection
        }
      } catch (err) {
        console.error('Error starting SignalR connection:', err)
        if (mounted) setIsConnected(false)
      }
    }

    // Delay connection để không block initial render (500ms)
    connectionTimeout = setTimeout(() => {
      initSignalR()
    }, 500)

    // Cleanup on unmount
    return () => {
      mounted = false
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }
      if (connectionRef.current) {
        connectionRef.current.stop().catch(() => {})
      }
    }
  }, [])

  const addNotification = (notification) => {
    setNotifications((prev) => {
      const exists = prev.some((n) => n.Id === notification.Id || n.id === notification.id)
      if (exists) return prev
      return [notification, ...prev]
    })
    
    // Show toast for new notification
    const title = notification.Title || notification.title || 'Thông báo mới'
    const message = notification.Message || notification.message || ''
    showToast(title, message, 'success')
  }

  const removeNotification = (notificationId) => {
    setNotifications((prev) => prev.filter((n) => (n.Id || n.id) !== notificationId))
  }

  const markAsRead = (notificationId) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if ((n.Id || n.id) === notificationId) {
          return { ...n, IsRead: true, isRead: true }
        }
        return n
      })
    )
  }

  const value = {
    notifications,
    isConnected,
    connection: connectionRef.current,
    addNotification,
    removeNotification,
    markAsRead,
    setNotifications,
    showToast,
    toasts
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Toast Container - rendered via Portal to ensure it's on top */}
      {toasts.length > 0 && createPortal(
        <div className="notification-toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`notification-toast notification-toast-${toast.type}`}>
              <div className="notification-toast-icon">
                {toast.type === 'success' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                )}
                {toast.type === 'info' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                )}
                {toast.type === 'warning' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                )}
                {toast.type === 'error' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                )}
              </div>
              <div className="notification-toast-content">
                <div className="notification-toast-title">{toast.title}</div>
                {toast.message && <div className="notification-toast-message">{toast.message}</div>}
              </div>
              <button 
                className="notification-toast-close" 
                onClick={() => removeToast(toast.id)}
                aria-label="Đóng"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </NotificationContext.Provider>
  )
}
