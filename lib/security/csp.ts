import { NextResponse } from 'next/server'

export interface CSPConfig {
  reportOnly?: boolean
  reportUri?: string
  directives?: Record<string, string[]>
}

const defaultDirectives = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for Next.js in development
    "'unsafe-eval'", // Required for Next.js in development
    'https://vercel.live',
    'https://va.vercel-scripts.com'
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for styled-components and Tailwind
    'https://fonts.googleapis.com'
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',
    'https://images.unsplash.com'
  ],
  'font-src': [
    "'self'",
    'https://fonts.gstatic.com'
  ],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.stripe.com'
  ],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'media-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'"],
  'manifest-src': ["'self'"],
  'upgrade-insecure-requests': []
}

const productionDirectives = {
  ...defaultDirectives,
  'script-src': [
    "'self'",
    'https://vercel.live',
    'https://va.vercel-scripts.com'
  ],
  'style-src': [
    "'self'",
    'https://fonts.googleapis.com'
  ]
}

export function generateCSP(config: CSPConfig = {}): string {
  const directives = config.directives || 
    (process.env.NODE_ENV === 'production' ? productionDirectives : defaultDirectives)
  
  const policy = Object.entries(directives)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive
      }
      return `${directive} ${sources.join(' ')}`
    })
    .join('; ')

  if (config.reportUri) {
    return `${policy}; report-uri ${config.reportUri}`
  }

  return policy
}

export function addSecurityHeaders(response: NextResponse, config: CSPConfig = {}): NextResponse {
  const csp = generateCSP(config)
  
  if (config.reportOnly) {
    response.headers.set('Content-Security-Policy-Report-Only', csp)
  } else {
    response.headers.set('Content-Security-Policy', csp)
  }

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
  )

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }

  return response
}

export const legalPracticeCSP: CSPConfig = {
  reportOnly: process.env.NODE_ENV !== 'production',
  directives: {
    ...defaultDirectives,
    'connect-src': [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://lex-system.com', // LEX integration
      'https://api.stripe.com' // Payment processing
    ]
  }
}