'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface DashboardRealtimeOptions {
  tables: string[]
  userId?: string
  onUpdate?: (table: string, payload: any) => void
  onError?: (error: Error) => void
}

interface DashboardRealtimeState {
  isConnected: boolean
  lastUpdate: Date | null
  error: Error | null
  updates: Record<string, any[]>
}

export function useDashboardRealtime(options: DashboardRealtimeOptions) {
  const [state, setState] = useState<DashboardRealtimeState>({
    isConnected: false,
    lastUpdate: null,
    error: null,
    updates: {}
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const mountedRef = useRef(true)
  const supabase = createClient()

  const handleUpdate = useCallback((table: string, payload: any) => {
    if (!mountedRef.current) return
    
    setState(prev => ({
      ...prev,
      lastUpdate: new Date(),
      updates: {
        ...prev.updates,
        [table]: [...(prev.updates[table] || []), payload]
      }
    }))

    options.onUpdate?.(table, payload)
  }, [options.onUpdate])

  const handleError = useCallback((error: Error) => {
    if (!mountedRef.current) return
    
    setState(prev => ({ ...prev, error }))
    options.onError?.(error)
  }, [options.onError])

  useEffect(() => {
    if (!options.tables.length) return

    // Create a single channel for all subscriptions
    const channelName = `dashboard-updates-${options.userId || 'all'}`
    const channel = supabase.channel(channelName)

    // Subscribe to each table
    options.tables.forEach(table => {
      let subscription = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table
        },
        (payload) => handleUpdate(table, payload)
      )

      // Add user filtering for barristers (personal data only)
      if (options.userId && (table === 'enquiries' || table === 'tasks')) {
        subscription = channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            filter: table === 'enquiries' 
              ? `assigned_barrister=eq.${options.userId}`
              : `assigned_to=eq.${options.userId}`
          },
          (payload) => handleUpdate(table, payload)
        )
      }
    })

    // Set up connection handlers
    channel
      .on('system', { event: 'connect' }, () => {
        if (mountedRef.current) {
          setState(prev => ({ ...prev, isConnected: true, error: null }))
        }
      })
      .on('system', { event: 'disconnect' }, () => {
        if (mountedRef.current) {
          setState(prev => ({ ...prev, isConnected: false }))
        }
      })
      .on('system', { event: 'error' }, (error) => {
        handleError(new Error(`Realtime connection error: ${error.message}`))
      })

    // Subscribe and store channel reference
    channel.subscribe((status) => {
      if (mountedRef.current) {
        if (status === 'SUBSCRIBED') {
          setState(prev => ({ ...prev, isConnected: true, error: null }))
        } else if (status === 'CLOSED') {
          setState(prev => ({ ...prev, isConnected: false }))
        } else if (status === 'CHANNEL_ERROR') {
          handleError(new Error('Failed to subscribe to realtime updates'))
        }
      }
    })

    channelRef.current = channel

    // Cleanup function
    return () => {
      mountedRef.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [options.tables, options.userId, supabase, handleUpdate, handleError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearUpdates = useCallback((table?: string) => {
    setState(prev => ({
      ...prev,
      updates: table 
        ? { ...prev.updates, [table]: [] }
        : {}
    }))
  }, [])

  const getUpdatesForTable = useCallback((table: string) => {
    return state.updates[table] || []
  }, [state.updates])

  return {
    isConnected: state.isConnected,
    lastUpdate: state.lastUpdate,
    error: state.error,
    updates: state.updates,
    clearUpdates,
    getUpdatesForTable
  }
}