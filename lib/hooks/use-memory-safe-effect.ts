'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * Memory-safe effect hook that prevents memory leaks from async operations
 * and ensures cleanup of subscriptions, timeouts, and intervals
 */
export function useMemorySafeEffect() {
  const mountedRef = useRef(true)
  const cleanupFunctionsRef = useRef<(() => void)[]>([])
  const timeoutsRef = useRef<NodeJS.Timeout[]>([])
  const intervalsRef = useRef<NodeJS.Timeout[]>([])

  // Safe async wrapper that checks if component is still mounted
  const safeAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    onSuccess?: (result: T) => void,
    onError?: (error: Error) => void
  ) => {
    try {
      const result = await asyncFn()
      
      // Only execute callback if component is still mounted
      if (mountedRef.current && onSuccess) {
        onSuccess(result)
      }
      
      return result
    } catch (error) {
      if (mountedRef.current && onError) {
        onError(error as Error)
      }
      throw error
    }
  }, [])

  // Safe timeout that automatically cleans up
  const safeTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      if (mountedRef.current) {
        callback()
      }
      // Remove from tracking array
      timeoutsRef.current = timeoutsRef.current.filter(id => id !== timeoutId)
    }, delay)

    timeoutsRef.current.push(timeoutId)
    return timeoutId
  }, [])

  // Safe interval that automatically cleans up
  const safeInterval = useCallback((callback: () => void, delay: number) => {
    const intervalId = setInterval(() => {
      if (mountedRef.current) {
        callback()
      } else {
        // Auto-cleanup if component unmounted
        clearInterval(intervalId)
        intervalsRef.current = intervalsRef.current.filter(id => id !== intervalId)
      }
    }, delay)

    intervalsRef.current.push(intervalId)
    return intervalId
  }, [])

  // Register cleanup function
  const registerCleanup = useCallback((cleanupFn: () => void) => {
    cleanupFunctionsRef.current.push(cleanupFn)
  }, [])

  // Check if component is still mounted
  const isMounted = useCallback(() => mountedRef.current, [])

  // Cleanup all resources
  useEffect(() => {
    return () => {
      mountedRef.current = false

      // Clear all timeouts
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []

      // Clear all intervals
      intervalsRef.current.forEach(clearInterval)
      intervalsRef.current = []

      // Run all cleanup functions
      cleanupFunctionsRef.current.forEach(cleanup => {
        try {
          cleanup()
        } catch (error) {
          console.warn('Cleanup function failed:', error)
        }
      })
      cleanupFunctionsRef.current = []
    }
  }, [])

  return {
    safeAsync,
    safeTimeout,
    safeInterval,
    registerCleanup,
    isMounted
  }
}