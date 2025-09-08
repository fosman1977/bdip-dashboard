import { NextRequest, NextResponse } from 'next/server'
import { env } from '../env'

interface OriginValidationResult {
  isValid: boolean
  reason?: string
}

// Validate origin format and security
function validateOrigin(origin: string): OriginValidationResult {
  try {
    const url = new URL(origin)
    
    // Block suspicious protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { isValid: false, reason: 'Invalid protocol' }
    }
    
    // Block suspicious hosts in production
    if (env.NODE_ENV === 'production') {
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('192.168.')) {
        return { isValid: false, reason: 'Local hosts not allowed in production' }
      }
    }
    
    // Block suspicious ports
    const suspiciousPorts = ['8080', '8443', '9090', '3030', '4000']
    if (suspiciousPorts.includes(url.port)) {
      return { isValid: false, reason: 'Suspicious port' }
    }
    
    return { isValid: true }
  } catch (error) {
    return { isValid: false, reason: 'Invalid URL format' }
  }
}

// Allowed origins based on environment with validation
const getAllowedOrigins = (): string[] => {
  let origins: string[] = []
  
  if (env.NODE_ENV === 'production') {
    // Production origins - strict validation
    if (!process.env.ALLOWED_ORIGINS) {
      console.error('🚨 CRITICAL: ALLOWED_ORIGINS not set in production!')
      return []
    }
    
    const productionOrigins = process.env.ALLOWED_ORIGINS.split(',')
      .map(origin => origin.trim())
      .filter(origin => {
        const validation = validateOrigin(origin)
        if (!validation.isValid) {
          console.error(`❌ Rejected origin: ${origin} - ${validation.reason}`)
          return false
        }
        return true
      })
    
    origins = [
      env.NEXT_PUBLIC_APP_URL,
      ...productionOrigins
    ].filter(Boolean)
    
    if (origins.length === 0) {
      console.error('🚨 CRITICAL: No valid origins configured for production!')
    }
  } else {
    // Development origins - still validated but more permissive
    const devOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'https://localhost:3000'
    ]
    
    origins = devOrigins.filter(origin => validateOrigin(origin).isValid)
  }
  
  console.log(`✅ Configured CORS origins: ${origins.join(', ')}`)
  return origins
}

// Enhanced secure CORS headers configuration
export function createSecureCORSHeaders(request: NextRequest): Headers {
  const origin = request.headers.get('origin')
  const allowedOrigins = getAllowedOrigins()
  
  const headers = new Headers()
  
  // Strict origin validation
  if (origin) {
    const validation = validateOrigin(origin)
    if (!validation.isValid) {
      console.warn(`🚨 Blocked suspicious origin: ${origin} - ${validation.reason}`)
      // Return restrictive headers for suspicious origins
      headers.set('Access-Control-Allow-Origin', 'null')
      return headers
    }
    
    if (allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Access-Control-Allow-Credentials', 'true')
      headers.set('Vary', 'Origin') // Important for caching
    } else {
      console.warn(`🚨 Origin not in allowlist: ${origin}`)
      headers.set('Access-Control-Allow-Origin', 'null')
      return headers
    }
  }
  
  // Restrictive CORS configuration for legal practice security
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept',
    'Accept-Version',
    'Content-Length',
    'Content-MD5',
    'Date'
  ].join(', '))
  headers.set('Access-Control-Max-Age', '3600') // 1 hour (reduced for security)
  headers.set('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset')
  
  // Enhanced security headers
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-XSS-Protection', '1; mode=block')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  
  // Strict CSP for API endpoints
  headers.set('Content-Security-Policy', [
    "default-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; '))
  
  // HSTS for production
  if (env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  
  return headers
}

// Create secure OPTIONS response
export function createSecureOPTIONSResponse(request: NextRequest): NextResponse {
  const headers = createSecureCORSHeaders(request)
  return new NextResponse(null, { status: 200, headers })
}

// Add CORS headers to existing response
export function addSecureCORSHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const corsHeaders = createSecureCORSHeaders(request)
  
  // Add CORS headers to existing response
  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value)
  })
  
  return response
}