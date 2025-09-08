import { NextRequest, NextResponse } from 'next/server'

// Rate limit configuration
export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  keyGenerator?: (request: NextRequest, userId?: string) => string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

// Rate limit result
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  totalRequests: number
}

// In-memory fallback store (not recommended for production with multiple instances)
const inMemoryStore = new Map<string, { count: number; resetTime: number }>()

// Redis-based distributed rate limiting (when Redis is available)
class DistributedRateLimiter {
  private fallbackToMemory = true
  
  constructor() {
    // In a real implementation, you'd initialize Redis here
    // For now, we'll use in-memory with a warning
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  Using in-memory rate limiting in production. Consider implementing Redis-based rate limiting for distributed deployments.')
    }
  }
  
  async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - config.windowMs
    
    if (this.fallbackToMemory) {
      return this.checkInMemoryRateLimit(key, config, now)
    }
    
    // Redis implementation would go here
    // For now, fallback to in-memory
    return this.checkInMemoryRateLimit(key, config, now)
  }
  
  private checkInMemoryRateLimit(
    key: string,
    config: RateLimitConfig,
    now: number
  ): RateLimitResult {
    const record = inMemoryStore.get(key)
    
    if (!record) {
      // First request
      inMemoryStore.set(key, { count: 1, resetTime: now + config.windowMs })
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
        totalRequests: 1
      }
    }
    
    // Check if window has expired
    if (now > record.resetTime) {
      // Reset window
      inMemoryStore.set(key, { count: 1, resetTime: now + config.windowMs })
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
        totalRequests: 1
      }
    }
    
    // Check if limit exceeded
    if (record.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime,
        totalRequests: record.count
      }
    }
    
    // Increment and allow
    record.count++
    return {
      allowed: true,
      remaining: config.maxRequests - record.count,
      resetTime: record.resetTime,
      totalRequests: record.count
    }
  }
}

// Global rate limiter instance
const rateLimiter = new DistributedRateLimiter()

// Default key generator
const defaultKeyGenerator = (request: NextRequest, userId?: string) => {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
  return userId ? `user:${userId}` : `ip:${ip}`
}

// Rate limiting middleware
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  userId?: string
): Promise<{ allowed: boolean; response?: NextResponse }> {
  
  const keyGen = config.keyGenerator || defaultKeyGenerator
  const key = keyGen(request, userId)
  
  try {
    const result = await rateLimiter.checkRateLimit(key, config)
    
    if (!result.allowed) {
      const resetTimeSeconds = Math.ceil((result.resetTime - Date.now()) / 1000)
      
      return {
        allowed: false,
        response: NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: `Too many requests. Limit: ${config.maxRequests} requests per ${Math.round(config.windowMs / 1000)} seconds.`,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: resetTimeSeconds,
            limit: config.maxRequests,
            remaining: result.remaining,
            resetTime: result.resetTime
          },
          {
            status: 429,
            headers: {
              'Retry-After': resetTimeSeconds.toString(),
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
            }
          }
        )
      }
    }
    
    return { allowed: true }
    
  } catch (error) {
    console.error('Rate limiting error:', error)
    // Fail open - allow request if rate limiting fails
    return { allowed: true }
  }
}

// Predefined rate limit configurations
export const rateLimitConfigs = {
  csvImport: {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  csvExport: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  api: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  auth: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
  }
} as const