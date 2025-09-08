'use client'

import { ReactNode } from 'react'
import { ErrorBoundary } from '../ui/error-boundary'

interface ErrorBoundaryProviderProps {
  children: ReactNode
}

export function ErrorBoundaryProvider({ children }: ErrorBoundaryProviderProps) {
  const handleError = (error: Error, errorInfo: any) => {
    console.error('Application Error:', error)
    console.error('Error Info:', errorInfo)
    
    if (process.env.NODE_ENV === 'production') {
      try {
        fetch('/api/errors/report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            timestamp: new Date().toISOString(),
            userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown',
            url: typeof window !== 'undefined' ? window.location.href : 'unknown'
          }),
        }).catch(() => {
          // Silently fail error reporting to avoid loops
        })
      } catch (reportingError) {
        console.error('Failed to report error:', reportingError)
      }
    }
  }

  return (
    <ErrorBoundary onError={handleError}>
      {children}
    </ErrorBoundary>
  )
}