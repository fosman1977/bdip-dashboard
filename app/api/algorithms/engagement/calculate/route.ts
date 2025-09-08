import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { calculateEngagementScore, calculateEngagementScoreFromData } from '../../../../../lib/algorithms/engagement-scoring'
import { EngagementMetrics, BarristerMetricsInput } from '../../../../../types'

// Input validation schemas
const metricsInputSchema = z.object({
  responseTime: z.number().min(0),
  conversionRate: z.number().min(0).max(1),
  clientSatisfaction: z.number().min(1).max(5),
  revenueGenerated: z.number().min(0)
})

const barristerRequestSchema = z.object({
  barristerId: z.string().uuid(),
  periodDays: z.number().min(1).max(365).default(90)
})

const rawDataRequestSchema = z.object({
  metrics: metricsInputSchema
})

const requestSchema = z.union([barristerRequestSchema, rawDataRequestSchema])

// POST /api/algorithms/engagement/calculate
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, ['admin', 'clerk', 'barrister'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting for algorithm endpoints
    const rateLimitResult = await checkRateLimit(request, {
      ...rateLimitConfigs.api,
      maxRequests: 200, // Higher limit for algorithm calculations
      windowMs: 15 * 60 * 1000
    }, user.id)
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validation = requestSchema.safeParse(body)
    
    if (!validation.success) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'Invalid request parameters',
            details: validation.error.issues,
            code: 'VALIDATION_ERROR'
          },
          { status: 400 }
        ),
        request
      )
    }

    const requestData = validation.data
    let result

    // Handle different request types
    if ('metrics' in requestData) {
      // Direct metrics calculation
      result = calculateEngagementScore(requestData.metrics)
    } else {
      // Barrister-based calculation
      const { barristerId, periodDays } = requestData
      
      // Check if user can access this barrister's data
      if (user.role === 'barrister' && user.id !== barristerId) {
        return addSecureCORSHeaders(
          NextResponse.json(
            { 
              success: false,
              error: 'Insufficient permissions',
              message: 'Barristers can only view their own engagement scores',
              code: 'INSUFFICIENT_PERMISSIONS'
            },
            { status: 403 }
          ),
          request
        )
      }

      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - periodDays)

      // Fetch barrister metrics from database
      const metricsData = await fetchBarristerMetrics(supabase, barristerId, startDate, endDate)
      if (!metricsData) {
        return addSecureCORSHeaders(
          NextResponse.json(
            { 
              success: false,
              error: 'Barrister not found',
              message: 'The specified barrister does not exist or you do not have access',
              code: 'BARRISTER_NOT_FOUND'
            },
            { status: 404 }
          ),
          request
        )
      }

      result = calculateEngagementScoreFromData(metricsData)
    }

    // Log algorithm usage for monitoring
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'engagement_scoring',
      operation: 'calculate',
      executionTime: Date.now() - startTime,
      success: true
    })

    const response = NextResponse.json({
      success: true,
      data: result,
      meta: {
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Engagement scoring calculation error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'engagement_scoring',
        operation: 'calculate',
        executionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } catch (logError) {
      console.error('Failed to log algorithm usage:', logError)
    }

    const response = NextResponse.json(
      { 
        success: false,
        error: 'Calculation failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'CALCULATION_ERROR',
        meta: {
          executionTime: Date.now() - startTime,
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    )
    return addSecureCORSHeaders(response, request)
  }
}

// Helper function to fetch barrister metrics from database
async function fetchBarristerMetrics(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerId: string,
  startDate: Date,
  endDate: Date
): Promise<BarristerMetricsInput | null> {
  try {
    // Check if barrister exists
    const { data: barrister, error: barristerError } = await supabase
      .from('barristers')
      .select('id')
      .eq('id', barristerId)
      .eq('is_active', true)
      .single()

    if (barristerError || !barrister) {
      return null
    }

    // Fetch enquiry metrics
    const { data: enquiries, error: enquiriesError } = await supabase
      .from('enquiries')
      .select('response_time_hours, status, estimated_value')
      .eq('assigned_barrister_id', barristerId)
      .gte('received_at', startDate.toISOString())
      .lte('received_at', endDate.toISOString())

    if (enquiriesError) {
      throw enquiriesError
    }

    const enquiryData = enquiries || []
    const totalEnquiries = enquiryData.length
    const totalResponseTime = enquiryData.reduce((sum, e) => sum + (e.response_time_hours || 0), 0)
    const successfulConversions = enquiryData.filter(e => e.status === 'Converted').length
    const totalRevenue = enquiryData
      .filter(e => e.status === 'Converted')
      .reduce((sum, e) => sum + (e.estimated_value || 0), 0)

    // Fetch client ratings (mock data for now - would come from client feedback system)
    const totalClientRatings = totalEnquiries * 4.2 // Average rating
    const clientRatingCount = totalEnquiries

    return {
      barristerId,
      totalEnquiries,
      totalResponseTime,
      successfulConversions,
      totalClientRatings,
      clientRatingCount,
      totalRevenue,
      periodStart: startDate,
      periodEnd: endDate
    }

  } catch (error) {
    console.error('Error fetching barrister metrics:', error)
    return null
  }
}

// Helper function to log algorithm usage
async function logAlgorithmUsage(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  data: {
    userId: string
    algorithm: string
    operation: string
    executionTime: number
    success: boolean
    error?: string
  }
): Promise<void> {
  try {
    await supabase.from('algorithm_usage_logs').insert({
      user_id: data.userId,
      algorithm: data.algorithm,
      operation: data.operation,
      execution_time_ms: data.executionTime,
      success: data.success,
      error_message: data.error,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to log algorithm usage:', error)
    // Don't throw - this shouldn't break the main operation
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return createSecureOPTIONSResponse(request)
}