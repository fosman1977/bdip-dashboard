import { useEffect, useRef, useCallback } from 'react'

export function useSafeAsync() {
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const createAbortController = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    return abortControllerRef.current
  }, [])

  const safeSetState = useCallback((setState: () => void) => {
    if (isMountedRef.current) {
      setState()
    }
  }, [])

  const safeAsync = useCallback(async <T>(
    asyncFn: (abortSignal: AbortSignal) => Promise<T>
  ): Promise<T | null> => {
    try {
      const controller = createAbortController()
      const result = await asyncFn(controller.signal)
      
      if (!isMountedRef.current || controller.signal.aborted) {
        return null
      }
      
      return result
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null
      }
      throw error
    }
  }, [createAbortController])

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    isMountedRef.current = false
  }, [])

  return {
    safeAsync,
    safeSetState,
    cleanup,
    isMounted: () => isMountedRef.current,
    createAbortController
  }
}

export function useTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const setTimeoutSafe = useCallback((callback: () => void, delay: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(callback, delay)
    return timeoutRef.current
  }, [])

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearTimeoutSafe()
    }
  }, [clearTimeoutSafe])

  return {
    setTimeoutSafe,
    clearTimeoutSafe
  }
}

export function useInterval() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const setIntervalSafe = useCallback((callback: () => void, delay: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    
    intervalRef.current = setInterval(callback, delay)
    return intervalRef.current
  }, [])

  const clearIntervalSafe = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearIntervalSafe()
    }
  }, [clearIntervalSafe])

  return {
    setIntervalSafe,
    clearIntervalSafe
  }
}

export function useEventListener<T extends keyof WindowEventMap>(
  eventType: T,
  callback: (event: WindowEventMap[T]) => void,
  element?: EventTarget | null
) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    const targetElement = element ?? window
    if (!targetElement?.addEventListener) return

    const eventListener = (event: Event) => {
      callbackRef.current(event as WindowEventMap[T])
    }

    targetElement.addEventListener(eventType, eventListener)

    return () => {
      targetElement.removeEventListener(eventType, eventListener)
    }
  }, [eventType, element])
}