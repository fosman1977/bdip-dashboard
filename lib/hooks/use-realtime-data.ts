'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '../supabase/client'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseRealtimeDataOptions<T> {
  table: string
  select?: string
  filter?: Record<string, any>
  initialData?: T[]
  enabled?: boolean
}

interface RealtimeDataState<T> {
  data: T[]
  loading: boolean
  error: Error | null
  lastUpdated: Date | null
}

export function useRealtimeData<T = any>({
  table,
  select = '*',
  filter,
  initialData = [],
  enabled = true
}: UseRealtimeDataOptions<T>) {
  const [state, setState] = useState<RealtimeDataState<T>>({
    data: initialData,
    loading: enabled,
    error: null,
    lastUpdated: null
  })

  // Use refs to track subscriptions and prevent memory leaks
  const channelRef = useRef<RealtimeChannel | null>(null)
  const mountedRef = useRef(true)
  const supabaseRef = useRef(createClient())

  // Memoized update functions to prevent unnecessary re-renders
  const handleInsert = useCallback((payload: RealtimePostgresChangesPayload<T>) => {
    if (!mountedRef.current) return
    
    setState(prev => ({
      ...prev,
      data: [...prev.data, payload.new as T],
      lastUpdated: new Date()
    }))
  }, [])

  const handleUpdate = useCallback((payload: RealtimePostgresChangesPayload<T>) => {
    if (!mountedRef.current) return
    
    setState(prev => ({
      ...prev,
      data: prev.data.map(item => 
        (item as any).id === (payload.new as any).id ? payload.new as T : item
      ),
      lastUpdated: new Date()
    }))
  }, [])

  const handleDelete = useCallback((payload: RealtimePostgresChangesPayload<T>) => {
    if (!mountedRef.current) return
    
    setState(prev => ({
      ...prev,
      data: prev.data.filter(item => (item as any).id !== (payload.old as any).id),
      lastUpdated: new Date()
    }))
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  // Initial data fetch and real-time setup
  useEffect(() => {
    if (!enabled) {
      setState(prev => ({ ...prev, loading: false }))
      return
    }

    let isMounted = true

    const setupRealtime = async () => {
      try {
        // Fetch initial data if not provided
        if (initialData.length === 0) {
          let query = supabaseRef.current.from(table).select(select)
          
          // Apply filters if provided
          if (filter) {
            Object.entries(filter).forEach(([key, value]) => {
              query = query.eq(key, value)
            })
          }

          const { data, error } = await query

          if (error) throw error

          if (isMounted) {
            setState(prev => ({
              ...prev,
              data: data || [],
              loading: false,
              lastUpdated: new Date()
            }))
          }
        } else {
          setState(prev => ({ ...prev, loading: false }))
        }

        // Set up real-time subscription
        const channelName = `${table}-${Date.now()}-${Math.random()}`
        const channel = supabaseRef.current.channel(channelName)

        // Configure the subscription with filters
        let subscription = channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: table,
            ...(filter && { filter: Object.entries(filter).map(([key, value]) => `${key}=eq.${value}`).join(',') })
          },
          (payload) => {
            if (!isMounted) return

            switch (payload.eventType) {
              case 'INSERT':
                handleInsert(payload)
                break
              case 'UPDATE':
                handleUpdate(payload)
                break
              case 'DELETE':
                handleDelete(payload)
                break
            }
          }
        )

        channelRef.current = channel

        // Subscribe and handle connection states
        channel.subscribe((status) => {
          if (!isMounted) return
          
          if (status === 'SUBSCRIBED') {
            console.log(`Real-time subscription active for ${table}`)
          } else if (status === 'CHANNEL_ERROR') {
            setState(prev => ({
              ...prev,
              error: new Error('Real-time connection failed')
            }))
          }
        })

      } catch (error) {
        if (isMounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: error as Error
          }))
        }
      }
    }

    setupRealtime()

    // Cleanup function
    return () => {
      isMounted = false
      cleanup()
    }
  }, [table, select, enabled, cleanup, handleInsert, handleUpdate, handleDelete, JSON.stringify(filter), JSON.stringify(initialData)])

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  // Manual refresh function
  const refresh = useCallback(async () => {
    if (!enabled) return

    setState(prev => ({ ...prev, loading: true }))

    try {
      let query = supabaseRef.current.from(table).select(select)
      
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value)
        })
      }

      const { data, error } = await query

      if (error) throw error

      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          data: data || [],
          loading: false,
          error: null,
          lastUpdated: new Date()
        }))
      }
    } catch (error) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error as Error
        }))
      }
    }
  }, [table, select, filter, enabled])

  return {
    ...state,
    refresh
  }
}