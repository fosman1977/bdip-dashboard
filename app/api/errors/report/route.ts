import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '../../../../lib/security/redis-rate-limiter'
import { legalTextSanitizer, validationSchemas } from '../../../../lib/security/input-sanitization'
import { z } from 'zod'

const errorReportSchema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  timestamp: z.string().datetime(),
  userAgent: z.string().max(500),
  url: z.string().url().max(500)
})

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit(
      request,
      { maxRequests: 10, windowMs: 60 * 60 * 1000 }
    )

    if (!rateLimitResult.allowed) {
      return rateLimitResult.response!
    }

    const body = await request.json()
    const sanitizedBody = legalTextSanitizer.sanitizeObject(body)
    
    const validation = legalTextSanitizer.validateAndSanitize(sanitizedBody, errorReportSchema)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid error report data', details: validation.error },
        { status: 400 }
      )
    }

    const errorReport = validation.data

    console.error('Frontend Error Report:', {
      message: errorReport.message,
      timestamp: errorReport.timestamp,
      url: errorReport.url,
      userAgent: errorReport.userAgent.substring(0, 100),
      stackPreview: errorReport.stack?.substring(0, 500)
    })

    if (process.env.NODE_ENV === 'production') {
      console.log('Error reported to monitoring system')
    }

    return NextResponse.json(
      { message: 'Error reported successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error in error reporting endpoint:', error)
    
    return NextResponse.json(
      { error: 'Failed to report error' },
      { status: 500 }
    )
  }
}