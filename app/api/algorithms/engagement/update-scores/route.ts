import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { calculateBatchEngagementScores } from '../../../../../lib/algorithms/engagement-scoring'
import { BarristerMetricsInput } from '../../../../../types'

// Input validation schema
const updateRequestSchema = z.object({
  async: z.boolean().default(true),
  periodDays: z.number().min(1).max(365).default(90),
  barristerIds: z.array(z.string().uuid()).optional() // If not provided, update all active barristers
})

// Background job status tracking
const jobStatuses = new Map<string, {
  status: 'running' | 'completed' | 'failed'
  startTime: number
  progress: number
  total: number
  error?: string
}>()

// POST /api/algorithms/engagement/update-scores
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin only
    const authResult = await authenticateRequest(request, ['admin'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Strict rate limiting for score updates
    const rateLimitResult = await checkRateLimit(request, {
      maxRequests: 3,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyGenerator: (req, userId) => `update-scores:${userId}`
    }, user.id)
    
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate request body
    const body = await request.json().catch(() => ({}))
    const validation = updateRequestSchema.safeParse(body)
    
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

    const { async, periodDays, barristerIds } = validation.data
    
    // Generate job ID for tracking
    const jobId = `score-update-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    if (async) {
      // Start background job
      updateEngagementScoresBackground(
        jobId,
        supabase,
        user.id,
        periodDays,
        barristerIds
      )
      
      // Return immediate response with job ID
      const response = NextResponse.json({
        success: true,
        data: {
          jobId,
          status: 'started',
          message: 'Engagement score update started in background'
        },
        meta: {
          async: true,
          executionTime: Date.now() - startTime,
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      }, { status: 202 })
      
      return addSecureCORSHeaders(response, request)
      
    } else {
      // Synchronous update (with timeout protection)
      const result = await updateEngagementScoresSync(
        supabase,
        user.id,
        periodDays,
        barristerIds
      )
      
      const response = NextResponse.json({
        success: true,
        data: result,
        meta: {
          async: false,
          executionTime: Date.now() - startTime,
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      })
      
      return addSecureCORSHeaders(response, request)
    }

  } catch (error) {
    console.error('Engagement score update error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        error: 'Update failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'UPDATE_ERROR',
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

// GET /api/algorithms/engagement/update-scores?jobId=xxx - Check background job status
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, ['admin'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    
    const url = new URL(request.url)
    const jobId = url.searchParams.get('jobId')
    
    if (!jobId) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'Missing jobId parameter',
            code: 'MISSING_JOB_ID'
          },
          { status: 400 }
        ),
        request
      )
    }
    
    const jobStatus = jobStatuses.get(jobId)
    
    if (!jobStatus) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'Job not found',
            message: 'The specified job ID was not found or has expired',
            code: 'JOB_NOT_FOUND'
          },
          { status: 404 }
        ),
        request
      )
    }
    
    const response = NextResponse.json({
      success: true,
      data: {
        jobId,
        status: jobStatus.status,
        progress: jobStatus.progress,
        total: jobStatus.total,
        progressPercentage: jobStatus.total > 0 ? Math.round((jobStatus.progress / jobStatus.total) * 100) : 0,
        startTime: jobStatus.startTime,
        elapsedTime: Date.now() - jobStatus.startTime,
        error: jobStatus.error
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    })
    
    return addSecureCORSHeaders(response, request)
    
  } catch (error) {
    console.error('Job status check error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        error: 'Status check failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'STATUS_CHECK_ERROR'
      },
      { status: 500 }
    )
    return addSecureCORSHeaders(response, request)
  }
}

// Synchronous score update (with timeout protection)
async function updateEngagementScoresSync(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  periodDays: number,
  barristerIds?: string[]
): Promise<{ updated: number; failed: number; duration: number }> {
  const startTime = Date.now()
  const SYNC_TIMEOUT = 30000 // 30 seconds timeout for sync operations
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Operation timeout - use async mode for large updates')), SYNC_TIMEOUT)
  })
  
  const updatePromise = performScoreUpdate(supabase, userId, periodDays, barristerIds)
  
  try {
    return await Promise.race([updatePromise, timeoutPromise]) as { updated: number; failed: number; duration: number }
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new Error('Operation timeout - please use async mode for large score updates')
    }
    throw error
  }
}

// Background score update
async function updateEngagementScoresBackground(
  jobId: string,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  periodDays: number,
  barristerIds?: string[]
): Promise<void> {
  const startTime = Date.now()
  
  // Initialize job status
  jobStatuses.set(jobId, {
    status: 'running',
    startTime,
    progress: 0,
    total: 0
  })
  
  try {
    const result = await performScoreUpdate(
      supabase,
      userId,
      periodDays,
      barristerIds,
      (progress, total) => {
        // Update job progress
        const jobStatus = jobStatuses.get(jobId)
        if (jobStatus) {
          jobStatus.progress = progress
          jobStatus.total = total
        }
      }
    )
    
    // Mark job as completed
    jobStatuses.set(jobId, {
      status: 'completed',
      startTime,
      progress: result.updated + result.failed,
      total: result.updated + result.failed
    })
    
    // Clean up job status after 1 hour
    setTimeout(() => {
      jobStatuses.delete(jobId)
    }, 60 * 60 * 1000)
    
  } catch (error) {
    console.error(`Background job ${jobId} failed:`, error)
    
    // Mark job as failed
    jobStatuses.set(jobId, {
      status: 'failed',
      startTime,
      progress: 0,
      total: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    // Clean up failed job after 1 hour
    setTimeout(() => {
      jobStatuses.delete(jobId)
    }, 60 * 60 * 1000)
  }
}

// Core score update logic
async function performScoreUpdate(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  periodDays: number,
  barristerIds?: string[],
  progressCallback?: (progress: number, total: number) => void
): Promise<{ updated: number; failed: number; duration: number }> {
  const startTime = Date.now()
  
  // Get list of barristers to update
  let query = supabase
    .from('barristers')
    .select('id')
    .eq('is_active', true)
    
  if (barristerIds && barristerIds.length > 0) {
    query = query.in('id', barristerIds)
  }
  
  const { data: barristers, error: barristersError } = await query
  
  if (barristersError) {
    throw new Error(`Failed to fetch barristers: ${barristersError.message}`)
  }
  
  if (!barristers || barristers.length === 0) {
    return { updated: 0, failed: 0, duration: Date.now() - startTime }
  }
  
  const barristerIdList = barristers.map(b => b.id)
  const total = barristerIdList.length
  
  // Calculate date range
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)
  
  let updated = 0
  let failed = 0
  
  // Process in batches to avoid overwhelming the database
  const BATCH_SIZE = 20
  
  for (let i = 0; i < barristerIdList.length; i += BATCH_SIZE) {
    const batchIds = barristerIdList.slice(i, i + BATCH_SIZE)
    
    try {
      // Fetch metrics for this batch
      const metricsDataList = await fetchBatchBarristerMetrics(supabase, batchIds, startDate, endDate)
      const validMetrics = metricsDataList.filter(Boolean) as BarristerMetricsInput[]
      
      if (validMetrics.length > 0) {
        // Calculate scores
        const results = calculateBatchEngagementScores(validMetrics)
        
        // Update database
        const updates = Array.from(results.entries()).map(([barristerId, result]) => ({
          id: barristerId,
          engagement_score: result.totalScore,
          score_last_updated: new Date().toISOString()
        }))
        
        const { error: updateError } = await supabase
          .from('barristers')
          .upsert(updates, { onConflict: 'id' })
        
        if (updateError) {
          console.error('Batch update error:', updateError)
          failed += batchIds.length
        } else {
          updated += validMetrics.length
          failed += batchIds.length - validMetrics.length
        }
      } else {
        failed += batchIds.length
      }
      
    } catch (error) {
      console.error(`Batch processing error for IDs ${batchIds.join(', ')}:`, error)
      failed += batchIds.length
    }
    
    // Update progress
    if (progressCallback) {
      progressCallback(updated + failed, total)
    }
    
    // Brief pause between batches to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Log the update operation
  await logAlgorithmUsage(supabase, {
    userId,
    algorithm: 'engagement_scoring',
    operation: 'mass_update',
    executionTime: Date.now() - startTime,
    success: true,
    batchSize: total,
    updated,
    failed
  })
  
  return { updated, failed, duration: Date.now() - startTime }
}

// Helper functions (reused from other files)
async function fetchBatchBarristerMetrics(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerIds: string[],
  startDate: Date,
  endDate: Date
): Promise<(BarristerMetricsInput | null)[]> {
  try {
    const { data: enquiries, error: enquiriesError } = await supabase
      .from('enquiries')
      .select('assigned_barrister_id, response_time_hours, status, estimated_value')
      .in('assigned_barrister_id', barristerIds)
      .gte('received_at', startDate.toISOString())
      .lte('received_at', endDate.toISOString())

    if (enquiriesError) {
      throw enquiriesError
    }

    const allEnquiries = enquiries || []
    const enquiriesByBarrister = allEnquiries.reduce((acc, enquiry) => {
      const barristerId = enquiry.assigned_barrister_id
      if (!acc[barristerId]) {
        acc[barristerId] = []
      }
      acc[barristerId].push(enquiry)
      return acc
    }, {} as Record<string, any[]>)

    return barristerIds.map(barristerId => {
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
    updated?: number
    failed?: number
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
      records_updated: data.updated,
      records_failed: data.failed,
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