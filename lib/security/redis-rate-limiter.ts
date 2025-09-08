import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  keyGenerator?: (request: NextRequest, userId?: string) => string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  totalRequests: number
}

class SecureRateLimiter {
  private redis: Redis | null = null
  private fallbackToMemory = false
  private memoryStore = new Map<string, { count: number; resetTime: number }>()

  constructor() {
    this.initializeRedis()
  }

  private async initializeRedis() {
    try {
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        this.redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
        
        await this.redis.ping()
        console.log('✅ Redis rate limiter initialized successfully')
      } else if (process.env.REDIS_URL) {
        this.redis = Redis.fromEnv()
        await this.redis.ping()
        console.log('✅ Redis rate limiter initialized from REDIS_URL')
      } else {
        throw new Error('No Redis configuration found')
      }
    } catch (error) {
      console.warn('⚠️  Redis unavailable, falling back to in-memory rate limiting:', error)
      this.fallbackToMemory = true
      
      if (process.env.NODE_ENV === 'production') {
        console.error('🚨 CRITICAL: In-memory rate limiting in production! This creates security vulnerabilities in multi-instance deployments.')
      }
    }
  }

  async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    if (this.redis && !this.fallbackToMemory) {
      return this.checkRedisRateLimit(key, config)
    }
    return this.checkMemoryRateLimit(key, config)
  }

  private async checkRedisRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    if (!this.redis) {
      throw new Error('Redis not initialized')
    }

    const now = Date.now()
    const window = config.windowMs
    const limit = config.maxRequests
    const redisKey = `ratelimit:${key}`

    try {
      const pipeline = this.redis.pipeline()
      
      pipeline.zremrangebyscore(redisKey, 0, now - window)
      pipeline.zcard(redisKey)
      pipeline.zadd(redisKey, { score: now, member: `${now}-${Math.random()}` })
      pipeline.expire(redisKey, Math.ceil(window / 1000))
      
      const results = await pipeline.exec()
      const currentCount = results[1] as number
      const resetTime = now + window

      if (currentCount >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetTime,
          totalRequests: currentCount
        }
      }

      return {
        allowed: true,
        remaining: limit - (currentCount + 1),
        resetTime,
        totalRequests: currentCount + 1
      }
    } catch (error) {
      console.error('Redis rate limiting error:', error)
      this.fallbackToMemory = true
      return this.checkMemoryRateLimit(key, config)
    }
  }

  private checkMemoryRateLimit(
    key: string,
    config: RateLimitConfig
  ): RateLimitResult {
    const now = Date.now()
    const record = this.memoryStore.get(key)

    if (!record) {
      this.memoryStore.set(key, { count: 1, resetTime: now + config.windowMs })
      this.scheduleCleanup(key, config.windowMs)
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
        totalRequests: 1
      }
    }

    if (now > record.resetTime) {
      this.memoryStore.set(key, { count: 1, resetTime: now + config.windowMs })
      this.scheduleCleanup(key, config.windowMs)
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
        totalRequests: 1
      }
    }

    if (record.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime,
        totalRequests: record.count
      }
    }

    record.count++
    return {
      allowed: true,
      remaining: config.maxRequests - record.count,
      resetTime: record.resetTime,
      totalRequests: record.count
    }
  }

  private scheduleCleanup(key: string, windowMs: number) {
    setTimeout(() => {
      this.memoryStore.delete(key)
    }, windowMs + 1000)
  }

  async getRemainingQuota(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    if (this.redis && !this.fallbackToMemory) {
      const redisKey = `ratelimit:${key}`
      const now = Date.now()
      const window = config.windowMs
      
      try {
        await this.redis.zremrangebyscore(redisKey, 0, now - window)
        const currentCount = await this.redis.zcard(redisKey)
        
        return {
          allowed: currentCount < config.maxRequests,
          remaining: Math.max(0, config.maxRequests - currentCount),
          resetTime: now + window,
          totalRequests: currentCount
        }
      } catch (error) {
        console.error('Error checking Redis quota:', error)
      }
    }

    const record = this.memoryStore.get(key)
    if (!record) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: Date.now() + config.windowMs,
        totalRequests: 0
      }
    }

    return {
      allowed: record.count < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - record.count),
      resetTime: record.resetTime,
      totalRequests: record.count
    }
  }
}

const rateLimiter = new SecureRateLimiter()

const defaultKeyGenerator = (request: NextRequest, userId?: string) => {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = request.ip || forwarded?.split(',')[0] || realIp || 'unknown'
  
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const fingerprint = Buffer.from(`${ip}:${userAgent}`).toString('base64').slice(0, 16)
  
  return userId ? `user:${userId}:${fingerprint}` : `ip:${fingerprint}`
}

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
            message: 'Too many requests. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: resetTimeSeconds
          },
          {
            status: 429,
            headers: {
              'Retry-After': resetTimeSeconds.toString(),
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY'
            }
          }
        )
      }
    }

    return { allowed: true }

  } catch (error) {
    console.error('Rate limiting critical error:', error)
    
    if (process.env.NODE_ENV === 'production') {
      return {
        allowed: false,
        response: NextResponse.json(
          { error: 'Service temporarily unavailable', code: 'SERVICE_ERROR' },
          { status: 503 }
        )
      }
    }

    return { allowed: true }
  }
}

export async function getRateLimitQuota(
  request: NextRequest,
  config: RateLimitConfig,
  userId?: string
): Promise<RateLimitResult> {
  const keyGen = config.keyGenerator || defaultKeyGenerator
  const key = keyGen(request, userId)
  return rateLimiter.getRemainingQuota(key, config)
}

export const rateLimitConfigs = {
  csvImport: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
  },
  csvExport: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  },
  api: {
    maxRequests: 60,
    windowMs: 15 * 60 * 1000,
  },
  auth: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  },
  sensitive: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  }
} as const