import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { calculateBatchEngagementScores } from '../../../../../lib/algorithms/engagement-scoring'
import { BarristerMetricsInput } from '../../../../../types'

// Input validation schema
const batchRequestSchema = z.object({
  barristerIds: z.array(z.string().uuid()).min(1).max(100),
  periodDays: z.number().min(1).max(365).default(90)
})

// POST /api/algorithms/engagement/batch-calculate
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - restricted to admin and clerk roles
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Enhanced rate limiting for batch operations
    const rateLimitResult = await checkRateLimit(request, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000, // 1 hour window
      keyGenerator: (req, userId) => `batch-engagement:${userId}`
    }, user.id)
    
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validation = batchRequestSchema.safeParse(body)
    
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

    const { barristerIds, periodDays } = validation.data

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // Fetch metrics for all barristers in batch
    const metricsDataList = await fetchBatchBarristerMetrics(
      supabase, 
      barristerIds, 
      startDate, 
      endDate
    )

    // Filter out null results (barristers not found or no access)
    const validMetrics = metricsDataList.filter(Boolean) as BarristerMetricsInput[]
    
    if (validMetrics.length === 0) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'No valid barristers found',
            message: 'None of the specified barristers exist or you do not have access',
            code: 'NO_VALID_BARRISTERS'
          },
          { status: 404 }
        ),
        request
      )
    }

    // Calculate engagement scores for all barristers
    const results = calculateBatchEngagementScores(validMetrics)
    
    // Convert Map to object for JSON serialization
    const resultsObject = Object.fromEntries(results.entries())

    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'engagement_scoring',
      operation: 'batch_calculate',
      executionTime: Date.now() - startTime,
      success: true,
      batchSize: validMetrics.length
    })

    const response = NextResponse.json({
      success: true,
      data: resultsObject,
      meta: {
        processed: validMetrics.length,
        requested: barristerIds.length,
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        periodDays
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Batch engagement scoring error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'engagement_scoring',
        operation: 'batch_calculate',
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
        error: 'Batch calculation failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'BATCH_CALCULATION_ERROR',
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

// Helper function to fetch metrics for multiple barristers
async function fetchBatchBarristerMetrics(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerIds: string[],
  startDate: Date,
  endDate: Date
): Promise<(BarristerMetricsInput | null)[]> {
  try {
    // Verify all barristers exist and are active
    const { data: barristers, error: barristersError } = await supabase
      .from('barristers')
      .select('id')
      .in('id', barristerIds)
      .eq('is_active', true)

    if (barristersError) {
      throw barristersError
    }

    const validBarristerIds = (barristers || []).map(b => b.id)

    // Fetch all enquiries for these barristers in one query
    const { data: enquiries, error: enquiriesError } = await supabase
      .from('enquiries')
      .select('assigned_barrister_id, response_time_hours, status, estimated_value')
      .in('assigned_barrister_id', validBarristerIds)
      .gte('received_at', startDate.toISOString())
      .lte('received_at', endDate.toISOString())

    if (enquiriesError) {
      throw enquiriesError
    }

    const allEnquiries = enquiries || []

    // Group enquiries by barrister
    const enquiriesByBarrister = allEnquiries.reduce((acc, enquiry) => {
      const barristerId = enquiry.assigned_barrister_id
      if (!acc[barristerId]) {
        acc[barristerId] = []
      }
      acc[barristerId].push(enquiry)
      return acc
    }, {} as Record<string, any[]>)

    // Create metrics for each requested barrister
    return barristerIds.map(barristerId => {
      if (!validBarristerIds.includes(barristerId)) {
        return null // Barrister not found or inactive
      }

      const barristerEnquiries = enquiriesByBarrister[barristerId] || []
      const totalEnquiries = barristerEnquiries.length
      const totalResponseTime = barristerEnquiries.reduce(
        (sum, e) => sum + (e.response_time_hours || 0), 0
      )
      const successfulConversions = barristerEnquiries.filter(
        e => e.status === 'Converted'
      ).length
      const totalRevenue = barristerEnquiries
        .filter(e => e.status === 'Converted')
        .reduce((sum, e) => sum + (e.estimated_value || 0), 0)

      // Mock client ratings - would come from actual feedback system
      const totalClientRatings = totalEnquiries * 4.2
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
    })

  } catch (error) {
    console.error('Error fetching batch barrister metrics:', error)
    throw error
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
    batchSize?: number
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
      batch_size: data.batchSize,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to log algorithm usage:', error)
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return createSecureOPTIONSResponse(request)
}