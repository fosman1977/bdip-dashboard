'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import type { UserRole } from '@/lib/auth/rbac'

interface User {
  id: string
  name: string
  email: string
  role: UserRole
  chambers_id: string
  avatar_url?: string | null
}

interface DashboardContextValue {
  user: User
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  notifications: Notification[]
  markNotificationAsRead: (id: string) => void
  unreadCount: number
}

interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: Date
  read: boolean
  action?: {
    label: string
    href: string
  }
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

interface DashboardProviderProps {
  children: React.ReactNode
  user: User
}

/**
 * Dashboard context provider for managing global dashboard state
 * Handles sidebar state, user context, notifications, and navigation
 */
export function DashboardProvider({ children, user }: DashboardProviderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'New Enquiry Assigned',
      message: 'Commercial litigation case from Acme Corp has been assigned to Sarah Johnson QC',
      type: 'info',
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      read: false,
      action: {
        label: 'View Enquiry',
        href: '/dashboard/enquiries/123'
      }
    },
    {
      id: '2',
      title: 'Court Date Reminder',
      message: 'High Court hearing scheduled for tomorrow at 10:00 AM',
      type: 'warning',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      read: false,
      action: {
        label: 'View Calendar',
        href: '/dashboard/calendar'
      }
    },
    {
      id: '3',
      title: 'Document Uploaded',
      message: 'Client has uploaded additional evidence for R v Smith case',
      type: 'success',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
      read: true
    }
  ])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const markNotificationAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, read: true }
          : notification
      )
    )
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  const value: DashboardContextValue = {
    user,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    notifications,
    markNotificationAsRead,
    unreadCount
  }

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}

/**
 * Hook to access dashboard context
 */
export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}

/**
 * Hook to get current user information
 */
export function useUser() {
  const { user } = useDashboard()
  return user
}

/**
 * Hook to manage sidebar state
 */
export function useSidebar() {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useDashboard()
  return { sidebarOpen, setSidebarOpen, toggleSidebar }
}

/**
 * Hook to manage notifications
 */
export function useNotifications() {
  const { notifications, markNotificationAsRead, unreadCount } = useDashboard()
  return { notifications, markNotificationAsRead, unreadCount }
}