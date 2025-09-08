import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { BarristerWorkload } from '../../../../../lib/algorithms/enquiry-routing'
import { Barrister } from '../../../../../types'

// Query parameter validation schema
const availabilityQuerySchema = z.object({
  practiceArea: z.string().optional(),
  seniority: z.enum(['Pupil', 'Junior', 'Middle', 'Senior', 'KC']).optional(),
  minEngagementScore: z.string().transform(val => parseInt(val) || 0).optional(),
  maxWorkloadPercent: z.string().transform(val => parseInt(val) || 90).optional(),
  urgency: z.enum(['Immediate', 'This Week', 'This Month', 'Flexible']).optional(),
  includeInactive: z.string().transform(val => val === 'true').default('false'),
  limit: z.string().transform(val => Math.min(50, Math.max(1, parseInt(val) || 20))).optional()
})

// GET /api/algorithms/routing/availability
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin, clerk, and barrister roles
    const authResult = await authenticateRequest(request, ['admin', 'clerk', 'barrister'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting for availability checks
    const rateLimitResult = await checkRateLimit(request, {
      ...rateLimitConfigs.api,
      maxRequests: 300, // Higher limit for availability checks
      windowMs: 15 * 60 * 1000
    }, user.id)
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const validation = availabilityQuerySchema.safeParse(queryParams)
    
    if (!validation.success) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'Invalid query parameters',
            details: validation.error.issues,
            code: 'VALIDATION_ERROR'
          },
          { status: 400 }
        ),
        request
      )
    }

    const filters = validation.data
    
    // Build dynamic query based on filters
    const { barristers, totalCount } = await fetchAvailableBarristers(supabase, filters, user)
    
    // Fetch workloads for the filtered barristers
    const workloadMap = await fetchBarristerWorkloads(supabase, barristers.map(b => b.id))
    
    // Apply workload-based filtering
    const availableBarristers = barristers
      .map(barrister => ({
        ...barrister,
        workload: workloadMap.get(barrister.id)
      }))
      .filter(barrister => {
        const workload = barrister.workload
        if (!workload) return true // Include if no workload data
        
        const maxWorkloadPercent = filters.maxWorkloadPercent || 90
        return (workload.utilizationRate * 100) <= maxWorkloadPercent
      })
      .map(barrister => enrichBarristerWithAvailability(barrister, filters))
    
    // Generate availability summary
    const summary = generateAvailabilitySummary(availableBarristers, filters)
    
    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'enquiry_routing',
      operation: 'check_availability',
      executionTime: Date.now() - startTime,
      success: true,
      resultCount: availableBarristers.length
    })

    const response = NextResponse.json({
      success: true,
      data: {
        barristers: availableBarristers,
        summary,
        filters: filters,
        counts: {
          available: availableBarristers.length,
          total: totalCount
        }
      },
      meta: {
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Availability check error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'enquiry_routing',
        operation: 'check_availability',
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
        error: 'Availability check failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'AVAILABILITY_CHECK_ERROR',
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

// Helper function to fetch available barristers with filters
async function fetchAvailableBarristers(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  filters: z.infer<typeof availabilityQuerySchema>,
  user: { id: string; role: string }
): Promise<{ barristers: Barrister[]; totalCount: number }> {
  try {
    let query = supabase
      .from('barristers')
      .select('*', { count: 'exact' })

    // Apply role-based filtering
    if (user.role === 'barrister') {
      // Barristers can only see their own data
      query = query.eq('id', user.id)
    } else if (!filters.includeInactive) {
      // Admin/clerk can see all active barristers by default
      query = query.eq('is_active', true)
    }

    // Apply practice area filter
    if (filters.practiceArea) {
      query = query.contains('practice_areas', [filters.practiceArea])
    }

    // Apply seniority filter
    if (filters.seniority) {
      query = query.eq('seniority', filters.seniority)
    }

    // Apply engagement score filter
    if (filters.minEngagementScore) {
      query = query.gte('engagement_score', filters.minEngagementScore)
    }

    // Apply limit
    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    // Order by engagement score and availability
    query = query.order('engagement_score', { ascending: false })

    const { data: barristers, error, count } = await query

    if (error) {
      throw error
    }

    return {
      barristers: barristers || [],
      totalCount: count || 0
    }
  } catch (error) {
    console.error('Error fetching available barristers:', error)
    throw error
  }
}

// Helper function to fetch barrister workloads
async function fetchBarristerWorkloads(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerIds: string[]
): Promise<Map<string, BarristerWorkload>> {
  const workloadMap = new Map<string, BarristerWorkload>()
  
  if (barristerIds.length === 0) return workloadMap
  
  try {
    // Fetch current workload data
    const { data: workloads, error } = await supabase
      .from('barristers')
      .select('id, current_workload')
      .in('id', barristerIds)

    if (error) {
      throw error
    }

    // Calculate workload metrics for each barrister
    for (const barrister of workloads || []) {
      const currentWorkload = barrister.current_workload || 0
      const maxWorkload = 100 // Default max workload points
      const utilizationRate = currentWorkload / maxWorkload
      const availableCapacity = Math.max(0, maxWorkload - currentWorkload)

      workloadMap.set(barrister.id, {
        barristerId: barrister.id,
        currentWorkload,
        maxWorkload,
        utilizationRate,
        availableCapacity
      })
    }

    return workloadMap
  } catch (error) {
    console.error('Error fetching workloads:', error)
    return workloadMap
  }
}

// Helper function to enrich barrister data with availability information
function enrichBarristerWithAvailability(
  barrister: Barrister & { workload?: BarristerWorkload },
  filters: z.infer<typeof availabilityQuerySchema>
): any {
  const workload = barrister.workload
  const utilizationPercent = workload ? Math.round(workload.utilizationRate * 100) : 0
  
  let availabilityStatus: 'Available' | 'Limited' | 'Busy' | 'Unavailable'
  let nextAvailableEstimate: string | null = null
  
  if (!barrister.is_active) {
    availabilityStatus = 'Unavailable'
  } else if (utilizationPercent <= 50) {
    availabilityStatus = 'Available'
  } else if (utilizationPercent <= 75) {
    availabilityStatus = 'Limited'
    nextAvailableEstimate = 'Within 1-2 weeks'
  } else if (utilizationPercent <= 90) {
    availabilityStatus = 'Busy'
    nextAvailableEstimate = 'Within 2-4 weeks'
  } else {
    availabilityStatus = 'Unavailable'
    nextAvailableEstimate = 'More than 4 weeks'
  }

  // Adjust for urgency requirements
  if (filters.urgency === 'Immediate' && utilizationPercent > 80) {
    availabilityStatus = 'Unavailable'
  }

  return {
    id: barrister.id,
    name: barrister.name,
    email: barrister.email,
    seniority: barrister.seniority,
    practice_areas: barrister.practice_areas,
    engagement_score: barrister.engagement_score,
    is_active: barrister.is_active,
    availability: {
      status: availabilityStatus,
      utilizationPercent,
      currentWorkload: workload?.currentWorkload || 0,
      availableCapacity: workload?.availableCapacity || 100,
      nextAvailableEstimate,
      canTakeUrgent: utilizationPercent <= 80
    },
    suitabilityForFilters: {
      practiceAreaMatch: filters.practiceArea 
        ? barrister.practice_areas.some(area => 
            area.toLowerCase().includes(filters.practiceArea!.toLowerCase())
          )
        : true,
      meetsSeniorityRequirement: !filters.seniority || barrister.seniority === filters.seniority,
      meetsEngagementThreshold: !filters.minEngagementScore || 
        (barrister.engagement_score || 0) >= filters.minEngagementScore,
      hasCapacity: utilizationPercent <= (filters.maxWorkloadPercent || 90)
    }
  }
}

// Helper function to generate availability summary
function generateAvailabilitySummary(
  barristers: any[],
  filters: z.infer<typeof availabilityQuerySchema>
): {
  overview: string
  byStatus: Record<string, number>
  recommendations: string[]
  insights: string[]
} {
  const total = barristers.length
  const byStatus = barristers.reduce((acc, b) => {
    const status = b.availability.status
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const available = byStatus['Available'] || 0
  const limited = byStatus['Limited'] || 0
  const busy = byStatus['Busy'] || 0
  const unavailable = byStatus['Unavailable'] || 0

  let overview: string
  if (available >= 3) {
    overview = `Good availability: ${available} barristers immediately available`
  } else if (available + limited >= 3) {
    overview = `Moderate availability: ${available + limited} barristers available with some constraints`
  } else {
    overview = `Limited availability: Only ${available + limited} barristers currently available`
  }

  const recommendations: string[] = []
  const insights: string[] = []

  if (filters.urgency === 'Immediate' && available < 2) {
    recommendations.push('Consider expanding search criteria for urgent matters')
  }

  if (available === 0 && limited > 0) {
    recommendations.push('Consider barristers with limited availability')
  }

  if (busy + unavailable > total * 0.7) {
    recommendations.push('High utilization across chambers - consider workload redistribution')
  }

  // Practice area insights
  if (filters.practiceArea) {
    const practiceAreaMatches = barristers.filter(b => b.suitabilityForFilters.practiceAreaMatch).length
    if (practiceAreaMatches < total * 0.5) {
      insights.push(`Limited expertise in ${filters.practiceArea} among available barristers`)
    }
  }

  // Seniority insights
  if (filters.seniority) {
    const seniorityMatches = barristers.filter(b => b.suitabilityForFilters.meetsSeniorityRequirement).length
    insights.push(`${seniorityMatches} of ${total} barristers match ${filters.seniority} seniority requirement`)
  }

  // Engagement insights
  const highEngagement = barristers.filter(b => (b.engagement_score || 0) >= 70).length
  if (highEngagement > 0) {
    insights.push(`${highEngagement} barristers have high engagement scores (70+)`)
  }

  return {
    overview,
    byStatus,
    recommendations,
    insights
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
    resultCount?: number
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
      result_count: data.resultCount,
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