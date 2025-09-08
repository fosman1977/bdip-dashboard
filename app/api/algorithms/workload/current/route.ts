import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { WorkloadMetrics } from '../../../../../lib/algorithms/workload-balancing'
import { Barrister, Clerk } from '../../../../../types'

// Query parameter validation schema
const workloadQuerySchema = z.object({
  type: z.enum(['barristers', 'clerks', 'all']).default('all'),
  includeInactive: z.string().transform(val => val === 'true').default('false'),
  orderBy: z.enum(['utilization', 'name', 'workload']).default('utilization'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 50))).optional(),
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)).default('1')
})

// GET /api/algorithms/workload/current
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request with role-based access
    const authResult = await authenticateRequest(request, ['admin', 'clerk', 'barrister'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting for workload queries
    const rateLimitResult = await checkRateLimit(request, {
      ...rateLimitConfigs.api,
      maxRequests: 200,
      windowMs: 15 * 60 * 1000
    }, user.id)
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const validation = workloadQuerySchema.safeParse(queryParams)
    
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
    
    // Apply role-based filtering
    let userFilter: string | null = null
    if (user.role === 'barrister') {
      // Barristers can only see their own workload
      userFilter = user.id
      if (filters.type === 'clerks') {
        return addSecureCORSHeaders(
          NextResponse.json(
            { 
              success: false,
              error: 'Access denied',
              message: 'Barristers cannot view clerk workloads',
              code: 'ACCESS_DENIED'
            },
            { status: 403 }
          ),
          request
        )
      }
    }
    
    // Fetch workload data based on type
    const workloadData = await fetchCurrentWorkloads(supabase, filters, userFilter)
    
    // Generate summary statistics
    const summary = generateWorkloadSummary(workloadData)
    
    // Apply pagination
    const paginatedData = applyPagination(workloadData, filters.page, filters.limit)
    
    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'workload_balancing',
      operation: 'get_current_workload',
      executionTime: Date.now() - startTime,
      success: true,
      resultCount: workloadData.length
    })

    const response = NextResponse.json({
      success: true,
      data: {
        workloads: paginatedData.items,
        summary,
        pagination: paginatedData.pagination
      },
      meta: {
        filters,
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Current workload fetch error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'workload_balancing',
        operation: 'get_current_workload',
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
        error: 'Workload fetch failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'WORKLOAD_FETCH_ERROR',
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

// Helper function to fetch current workloads
async function fetchCurrentWorkloads(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  filters: z.infer<typeof workloadQuerySchema>,
  userFilter?: string | null
): Promise<Array<WorkloadMetrics & { name: string; type: 'barrister' | 'clerk'; details: any }>> {
  const results: Array<WorkloadMetrics & { name: string; type: 'barrister' | 'clerk'; details: any }> = []
  
  try {
    // Fetch barristers if requested
    if (filters.type === 'barristers' || filters.type === 'all') {
      const barristerWorkloads = await fetchBarristerWorkloads(supabase, filters.includeInactive, userFilter)
      results.push(...barristerWorkloads)
    }
    
    // Fetch clerks if requested (and user has permission)
    if ((filters.type === 'clerks' || filters.type === 'all') && !userFilter) {
      const clerkWorkloads = await fetchClerkWorkloads(supabase, filters.includeInactive)
      results.push(...clerkWorkloads)
    }
    
    // Apply sorting
    results.sort((a, b) => {
      let aVal: number | string, bVal: number | string
      
      switch (filters.orderBy) {
        case 'utilization':
          aVal = a.utilizationRate
          bVal = b.utilizationRate
          break
        case 'workload':
          aVal = a.currentHours
          bVal = b.currentHours
          break
        case 'name':
        default:
          aVal = a.name
          bVal = b.name
          break
      }
      
      if (filters.sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
      }
    })
    
    return results
  } catch (error) {
    console.error('Error fetching workloads:', error)
    return []
  }
}

// Helper function to fetch barrister workloads
async function fetchBarristerWorkloads(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  includeInactive: boolean,
  userFilter?: string | null
): Promise<Array<WorkloadMetrics & { name: string; type: 'barrister'; details: any }>> {
  try {
    let query = supabase
      .from('barristers')
      .select('*')
    
    if (!includeInactive) {
      query = query.eq('is_active', true)
    }
    
    if (userFilter) {
      query = query.eq('id', userFilter)
    }
    
    const { data: barristers, error } = await query
    
    if (error) {
      throw error
    }
    
    const workloads: Array<WorkloadMetrics & { name: string; type: 'barrister'; details: any }> = []
    
    for (const barrister of barristers || []) {
      // Fetch current enquiries and tasks
      const [enquiryStats, taskStats] = await Promise.all([
        fetchBarristerEnquiryStats(supabase, barrister.id),
        fetchBarristerTaskStats(supabase, barrister.id)
      ])
      
      const currentHours = enquiryStats.totalHours + taskStats.totalHours
      const maxHours = 40 // Standard weekly capacity
      const utilizationRate = currentHours / maxHours
      
      // Calculate quality score based on engagement score and recent performance
      const qualityScore = calculateQualityScore(barrister.engagement_score || 50, enquiryStats.conversionRate)
      
      // Check availability status
      const isAvailable = barrister.is_active && utilizationRate < 0.95
      
      workloads.push({
        barristerId: barrister.id,
        name: barrister.name,
        type: 'barrister',
        currentHours,
        maxHours,
        utilizationRate: Math.round(utilizationRate * 1000) / 1000, // Round to 3 decimal places
        dailyHours: currentHours / 5, // Assuming 5-day work week
        weeklyHours: currentHours,
        qualityScore,
        activeEnquiries: enquiryStats.activeCount,
        activeTasks: taskStats.activeCount,
        lastAssignment: enquiryStats.lastAssignment ? new Date(enquiryStats.lastAssignment) : null,
        isAvailable,
        specializations: barrister.practice_areas,
        details: {
          seniority: barrister.seniority,
          year_of_call: barrister.year_of_call,
          engagement_score: barrister.engagement_score,
          conversion_rate: enquiryStats.conversionRate,
          avg_response_time: enquiryStats.avgResponseTime
        }
      })
    }
    
    return workloads
  } catch (error) {
    console.error('Error fetching barrister workloads:', error)
    return []
  }
}

// Helper function to fetch clerk workloads
async function fetchClerkWorkloads(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  includeInactive: boolean
): Promise<Array<WorkloadMetrics & { name: string; type: 'clerk'; details: any }>> {
  try {
    const { data: clerks, error } = await supabase
      .from('clerks')
      .select('*')
    
    if (error) {
      throw error
    }
    
    const workloads: Array<WorkloadMetrics & { name: string; type: 'clerk'; details: any }> = []
    
    for (const clerk of clerks || []) {
      // Calculate clerk workload based on assigned enquiries and administrative tasks
      const enquiryCount = await fetchClerkEnquiryCount(supabase, clerk.id)
      const taskCount = await fetchClerkTaskCount(supabase, clerk.id)
      
      // Estimate hours based on assigned work
      const currentHours = (enquiryCount * 2) + (taskCount * 1) // Rough estimation
      const maxHours = clerk.max_workload || 40
      const utilizationRate = currentHours / maxHours
      
      const isAvailable = utilizationRate < 0.90
      
      workloads.push({
        barristerId: clerk.id,
        name: clerk.name,
        type: 'clerk',
        currentHours,
        maxHours,
        utilizationRate: Math.round(utilizationRate * 1000) / 1000,
        dailyHours: currentHours / 5,
        weeklyHours: currentHours,
        qualityScore: clerk.is_senior ? 85 : 75, // Simple quality score
        activeEnquiries: enquiryCount,
        activeTasks: taskCount,
        lastAssignment: null, // Would need to track clerk assignments
        isAvailable,
        specializations: clerk.team ? [clerk.team] : [],
        details: {
          is_senior: clerk.is_senior,
          team: clerk.team,
          current_workload: clerk.current_workload
        }
      })
    }
    
    return workloads
  } catch (error) {
    console.error('Error fetching clerk workloads:', error)
    return []
  }
}

// Helper function to fetch barrister enquiry statistics
async function fetchBarristerEnquiryStats(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerId: string
): Promise<{
  activeCount: number
  totalHours: number
  conversionRate: number
  avgResponseTime: number
  lastAssignment: string | null
}> {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('status, estimated_value, response_time_hours, received_at')
      .eq('assigned_barrister_id', barristerId)
      .gte('received_at', thirtyDaysAgo.toISOString())
      .order('received_at', { ascending: false })
    
    if (error) {
      throw error
    }
    
    const enquiriesData = enquiries || []
    const activeCount = enquiriesData.filter(e => ['New', 'Assigned', 'In Progress'].includes(e.status)).length
    const convertedCount = enquiriesData.filter(e => e.status === 'Converted').length
    const conversionRate = enquiriesData.length > 0 ? Math.round((convertedCount / enquiriesData.length) * 100) / 100 : 0
    
    // Estimate total hours based on enquiry values and complexity
    const totalHours = enquiriesData.reduce((sum, enquiry) => {
      let hours = 2 // Base hours per enquiry
      const value = enquiry.estimated_value || 0
      if (value > 100000) hours += 8
      else if (value > 50000) hours += 4
      else if (value > 10000) hours += 2
      return sum + hours
    }, 0)
    
    const responseTimes = enquiriesData
      .filter(e => e.response_time_hours !== null)
      .map(e => e.response_time_hours)
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length * 10) / 10 
      : 0
    
    const lastAssignment = enquiriesData.length > 0 ? enquiriesData[0].received_at : null
    
    return {
      activeCount,
      totalHours,
      conversionRate,
      avgResponseTime,
      lastAssignment
    }
  } catch (error) {
    console.error('Error fetching barrister enquiry stats:', error)
    return {
      activeCount: 0,
      totalHours: 0,
      conversionRate: 0,
      avgResponseTime: 0,
      lastAssignment: null
    }
  }
}

// Helper function to fetch barrister task statistics
async function fetchBarristerTaskStats(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerId: string
): Promise<{
  activeCount: number
  totalHours: number
}> {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('points, completed_at')
      .eq('barrister_id', barristerId)
      .is('completed_at', null)
    
    if (error) {
      throw error
    }
    
    const tasksData = tasks || []
    const activeCount = tasksData.length
    const totalHours = tasksData.reduce((sum, task) => sum + (task.points * 0.5), 0) // Convert points to hours
    
    return {
      activeCount,
      totalHours
    }
  } catch (error) {
    console.error('Error fetching barrister task stats:', error)
    return {
      activeCount: 0,
      totalHours: 0
    }
  }
}

// Helper function to fetch clerk enquiry count
async function fetchClerkEnquiryCount(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('enquiries')
      .select('id', { count: 'exact' })
      .eq('assigned_clerk_id', clerkId)
      .in('status', ['New', 'Assigned', 'In Progress'])
    
    if (error) {
      throw error
    }
    
    return data?.length || 0
  } catch (error) {
    console.error('Error fetching clerk enquiry count:', error)
    return 0
  }
}

// Helper function to fetch clerk task count
async function fetchClerkTaskCount(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id', { count: 'exact' })
      .eq('clerk_id', clerkId)
      .is('completed_at', null)
    
    if (error) {
      throw error
    }
    
    return data?.length || 0
  } catch (error) {
    console.error('Error fetching clerk task count:', error)
    return 0
  }
}

// Helper function to calculate quality score
function calculateQualityScore(engagementScore: number, conversionRate: number): number {
  // Weighted combination of engagement score and recent conversion rate
  const weightedScore = (engagementScore * 0.7) + (conversionRate * 100 * 0.3)
  return Math.round(Math.min(100, Math.max(0, weightedScore)))
}

// Helper function to generate workload summary
function generateWorkloadSummary(
  workloads: Array<WorkloadMetrics & { name: string; type: 'barrister' | 'clerk'; details: any }>
): {
  totalResources: number
  averageUtilization: number
  highUtilization: number
  lowUtilization: number
  availableResources: number
  overCapacity: number
  byType: {
    barristers: { count: number; avgUtilization: number }
    clerks: { count: number; avgUtilization: number }
  }
  insights: string[]
} {
  const totalResources = workloads.length
  const barristers = workloads.filter(w => w.type === 'barrister')
  const clerks = workloads.filter(w => w.type === 'clerk')
  
  const totalUtilization = workloads.reduce((sum, w) => sum + w.utilizationRate, 0)
  const averageUtilization = totalResources > 0 ? Math.round((totalUtilization / totalResources) * 100) : 0
  
  const highUtilization = workloads.filter(w => w.utilizationRate > 0.85).length
  const lowUtilization = workloads.filter(w => w.utilizationRate < 0.5).length
  const availableResources = workloads.filter(w => w.isAvailable).length
  const overCapacity = workloads.filter(w => w.utilizationRate > 0.95).length
  
  const barristerAvgUtil = barristers.length > 0 
    ? Math.round((barristers.reduce((sum, b) => sum + b.utilizationRate, 0) / barristers.length) * 100) 
    : 0
  
  const clerkAvgUtil = clerks.length > 0 
    ? Math.round((clerks.reduce((sum, c) => sum + c.utilizationRate, 0) / clerks.length) * 100) 
    : 0
  
  const insights: string[] = []
  
  if (averageUtilization > 85) {
    insights.push('High overall utilization - consider capacity planning')
  } else if (averageUtilization < 60) {
    insights.push('Low utilization - resources available for additional work')
  }
  
  if (overCapacity > 0) {
    insights.push(`${overCapacity} resources over capacity - immediate attention required`)
  }
  
  if (highUtilization > totalResources * 0.5) {
    insights.push('More than half of resources at high utilization')
  }
  
  if (Math.abs(barristerAvgUtil - clerkAvgUtil) > 20) {
    insights.push('Significant utilization difference between barristers and clerks')
  }
  
  return {
    totalResources,
    averageUtilization,
    highUtilization,
    lowUtilization,
    availableResources,
    overCapacity,
    byType: {
      barristers: { count: barristers.length, avgUtilization: barristerAvgUtil },
      clerks: { count: clerks.length, avgUtilization: clerkAvgUtil }
    },
    insights
  }
}

// Helper function to apply pagination
function applyPagination<T>(
  items: T[],
  page: number,
  limit?: number
): {
  items: T[]
  pagination: {
    page: number
    limit: number | null
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
} {
  const actualLimit = limit || items.length
  const startIndex = (page - 1) * actualLimit
  const endIndex = startIndex + actualLimit
  const paginatedItems = items.slice(startIndex, endIndex)
  const totalPages = Math.ceil(items.length / actualLimit)
  
  return {
    items: paginatedItems,
    pagination: {
      page,
      limit: limit || null,
      total: items.length,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
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