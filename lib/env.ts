/**
 * Environment variables configuration and validation
 * Ensures all required environment variables are available and properly typed
 */

import { z } from 'zod'

const envSchema = z.object({
  // Supabase configuration
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required').optional(),
  
  // Application configuration
  NEXT_PUBLIC_SITE_URL: z.string().url('Invalid site URL').default('http://localhost:3000'),
  
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Security configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters').optional(),
  
  // Email configuration (optional for now)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  
  // File upload configuration
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'), // 10MB default
  ALLOWED_FILE_TYPES: z.string().default('text/csv,application/vnd.ms-excel'),
  
  // Rate limiting
  RATE_LIMIT_REQUESTS: z.string().transform(Number).default('100'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default('900'), // 15 minutes
  
  // Session configuration
  SESSION_TIMEOUT: z.string().transform(Number).default('3600'), // 1 hour
  REMEMBER_ME_DURATION: z.string().transform(Number).default('2592000'), // 30 days
})

// Parse environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join('\n')
      
      throw new Error(
        `Environment validation failed:\n${missingVars}\n\n` +
        'Please check your .env.local file and ensure all required variables are set.'
      )
    }
    throw error
  }
}

export const env = parseEnv()

// Type-safe environment variables
export type Env = typeof env

// Helper functions for environment-specific behavior
export const isDevelopment = env.NODE_ENV === 'development'
export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

// Database configuration helpers
export const getSupabaseConfig = () => ({
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
})

// Security configuration helpers
export const getSecurityConfig = () => ({
  jwtSecret: env.JWT_SECRET,
  sessionTimeout: env.SESSION_TIMEOUT,
  rememberMeDuration: env.REMEMBER_ME_DURATION,
  rateLimitRequests: env.RATE_LIMIT_REQUESTS,
  rateLimitWindow: env.RATE_LIMIT_WINDOW,
})

// File upload configuration helpers
export const getFileUploadConfig = () => ({
  maxFileSize: env.MAX_FILE_SIZE,
  allowedTypes: env.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
})

// Email configuration helpers
export const getEmailConfig = () => ({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  user: env.SMTP_USER,
  password: env.SMTP_PASSWORD,
  enabled: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD),
})

// Application URLs
export const getAppUrls = () => ({
  siteUrl: env.NEXT_PUBLIC_SITE_URL,
  authUrls: {
    signIn: `${env.NEXT_PUBLIC_SITE_URL}/auth/signin`,
    signUp: `${env.NEXT_PUBLIC_SITE_URL}/auth/signup`,
    resetPassword: `${env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
    acceptInvitation: `${env.NEXT_PUBLIC_SITE_URL}/auth/accept-invitation`,
  },
  apiUrls: {
    auth: `${env.NEXT_PUBLIC_SITE_URL}/api/auth`,
    enquiries: `${env.NEXT_PUBLIC_SITE_URL}/api/enquiries`,
    clients: `${env.NEXT_PUBLIC_SITE_URL}/api/clients`,
    csv: `${env.NEXT_PUBLIC_SITE_URL}/api/csv`,
  }
})

// Validation helpers
export const validateEnv = () => {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  }
  
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }
  
  return true
}

// Runtime environment checks
export const checkRequiredServices = async () => {
  const issues: string[] = []
  
  // Check Supabase connection
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      }
    })
    
    if (!response.ok) {
      issues.push('Unable to connect to Supabase')
    }
  } catch (error) {
    issues.push('Supabase connection failed')
  }
  
  // Check email service if configured
  const emailConfig = getEmailConfig()
  if (emailConfig.enabled) {
    // TODO: Add email service health check
  }
  
  return {
    healthy: issues.length === 0,
    issues
  }
}