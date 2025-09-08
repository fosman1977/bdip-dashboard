/**
 * Clerk Dashboard API Route
 * Provides comprehensive dashboard data for clerk users including enquiry management,
 * barrister workloads, and operational metrics with role-based access control
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth/rbac'
import { rateLimiter } from '@/lib/security/redis-rate-limiter'
import { validateAndSanitizeInput } from '@/lib/security/input-sanitization'
import { 
  ClerkDashboardData, 
  ClerkDashboardParams, 
  ClerkDashboardParamsSchema,
  APIResponse 
} from '@/types/dashboard'

/**
 * GET /api/dashboard/clerk
 * Retrieves comprehensive dashboard data for clerk users
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIResponse<ClerkDashboardData>>> {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  try {
    // Initialize Supabase client
    const supabase = createServerSupabaseClient()
    
    // Get current user and session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
          details: authError
        }
      }, { status: 401 })
    }

    // Apply rate limiting
    const rateLimitResult = await rateLimiter.limit(
      `clerk-dashboard:${user.id}`,
      20, // 20 requests
      60 // per minute
    )

    if (!rateLimitResult.success) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          details: { 
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            reset_time: rateLimitResult.reset 
          }
        }
      }, { status: 429 })
    }

    // Get user profile and check role permissions
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, chambers_id, is_active')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile || !profile.is_active) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'User profile not found or inactive',
          code: 'PROFILE_ERROR',
          details: profileError
        }
      }, { status: 403 })
    }

    // Verify clerk permissions
    if (!hasPermission(profile.role, 'view_chamber_analytics') || 
        !hasPermission(profile.role, 'assign_enquiries')) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Insufficient permissions for clerk dashboard',
          code: 'FORBIDDEN',
          details: { required_role: 'clerk', user_role: profile.role }
        }
      }, { status: 403 })
    }

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams
    const rawParams = {
      date_range: searchParams.get('date_range'),
      include_completed: searchParams.get('include_completed') === 'true',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    }

    const validationResult = validateAndSanitizeInput(rawParams, ClerkDashboardParamsSchema)
    
    if (!validationResult.success) {
      return NextResponse.json({
        success: false,
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: validationResult.error
        }
      }, { status: 400 })
    }

    const params = validationResult.data as ClerkDashboardParams

    // Calculate date range for queries
    const now = new Date()
    const dateRanges = {
      today: new Date(now.setHours(0, 0, 0, 0)),
      week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      quarter: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    }
    const fromDate = dateRanges[params.date_range]

    // Fetch dashboard statistics
    const [
      enquiriesResult,
      barristersResult,
      tasksResult,
      metricsResult
    ] = await Promise.allSettled([
      fetchEnquiriesData(supabase, profile.chambers_id, fromDate, params),
      fetchBarristerWorkloads(supabase, profile.chambers_id),
      fetchTasksData(supabase, profile.chambers_id, fromDate),
      fetchPerformanceMetrics(supabase, profile.chambers_id, fromDate)
    ])

    // Handle any fetch errors
    if (enquiriesResult.status === 'rejected') {
      throw new Error(`Failed to fetch enquiries: ${enquiriesResult.reason}`)
    }
    if (barristersResult.status === 'rejected') {
      throw new Error(`Failed to fetch barristers: ${barristersResult.reason}`)
    }
    if (tasksResult.status === 'rejected') {
      throw new Error(`Failed to fetch tasks: ${tasksResult.reason}`)
    }
    if (metricsResult.status === 'rejected') {
      throw new Error(`Failed to fetch metrics: ${metricsResult.reason}`)
    }

    // Combine all data
    const dashboardData: ClerkDashboardData = {
      stats: {
        total_enquiries: enquiriesResult.value.total,
        pending_assignments: enquiriesResult.value.unassigned,
        active_cases: enquiriesResult.value.active,
        overdue_tasks: tasksResult.value.overdue,
        new_enquiries_today: enquiriesResult.value.todayCount,
        completed_this_week: enquiriesResult.value.weekCompleted
      },
      recent_enquiries: enquiriesResult.value.recent,
      pending_assignments: enquiriesResult.value.pendingAssignments,
      barrister_workloads: barristersResult.value,
      urgent_tasks: tasksResult.value.urgent,
      performance_metrics: metricsResult.value
    }

    const processingTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      data: dashboardData,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        processing_time_ms: processingTime,
        cached: false
      }
    })

  } catch (error) {
    console.error('Clerk dashboard error:', error)
    
    return NextResponse.json({
      success: false,
      error: {
        message: 'Internal server error while fetching dashboard data',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      meta: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        processing_time_ms: Date.now() - startTime,
        cached: false
      }
    }, { status: 500 })
  }
}

/**
 * Fetch enquiries data with statistics
 */
async function fetchEnquiriesData(supabase: any, chambersId: string, fromDate: Date, params: ClerkDashboardParams) {
  const baseQuery = supabase
    .from('enquiries')
    .select(`
      id,
      title,
      description,
      priority,
      status,
      client_id,
      clients!inner(name),
      assigned_barrister_id,
      user_profiles!assigned_barrister_id(full_name),
      created_at,
      updated_at,
      due_date,
      urgency_score
    `)
    .eq('chambers_id', chambersId)

  // Get recent enquiries
  const { data: recent, error: recentError } = await baseQuery
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(params.limit)

  if (recentError) throw recentError

  // Get pending assignments (unassigned enquiries)
  const { data: pendingAssignments, error: pendingError } = await baseQuery
    .is('assigned_barrister_id', null)
    .in('status', ['new', 'in_progress'])
    .order('urgency_score', { ascending: false })
    .limit(20)

  if (pendingError) throw pendingError

  // Get statistics
  const { data: stats, error: statsError } = await supabase.rpc('get_enquiry_stats', {
    p_chambers_id: chambersId,
    p_from_date: fromDate.toISOString()
  })

  if (statsError) throw statsError

  return {
    recent: recent?.map(formatEnquiry) || [],
    pendingAssignments: pendingAssignments?.map(formatEnquiry) || [],
    total: stats?.total_enquiries || 0,
    unassigned: stats?.unassigned_count || 0,
    active: stats?.active_count || 0,
    todayCount: stats?.today_count || 0,
    weekCompleted: stats?.week_completed || 0
  }
}

/**
 * Fetch barrister workload data
 */
async function fetchBarristerWorkloads(supabase: any, chambersId: string) {
  const { data, error } = await supabase.rpc('get_barrister_workloads', {
    p_chambers_id: chambersId
  })

  if (error) throw error

  return data?.map((barrister: any) => ({
    barrister_id: barrister.user_id,
    barrister_name: barrister.full_name,
    active_cases: barrister.active_cases || 0,
    pending_tasks: barrister.pending_tasks || 0,
    capacity_percentage: barrister.capacity_percentage || 0,
    specializations: barrister.specializations || [],
    engagement_score: barrister.engagement_score || 0,
    availability_status: barrister.availability_status || 'available',
    next_available_date: barrister.next_available_date
  })) || []
}

/**
 * Fetch tasks data with urgency information
 */
async function fetchTasksData(supabase: any, chambersId: string, fromDate: Date) {
  // Get urgent tasks
  const { data: urgent, error: urgentError } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      status,
      priority,
      due_date,
      created_at,
      updated_at,
      assigned_to,
      user_profiles!assigned_to(full_name)
    `)
    .eq('chambers_id', chambersId)
    .in('priority', ['high', 'urgent'])
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true })
    .limit(10)

  if (urgentError) throw urgentError

  // Get overdue tasks count
  const { count: overdueCount, error: overdueError } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('chambers_id', chambersId)
    .lt('due_date', new Date().toISOString())
    .in('status', ['pending', 'in_progress'])

  if (overdueError) throw overdueError

  return {
    urgent: urgent?.map((task: any) => ({
      ...task,
      assigned_to: task.user_profiles?.full_name || 'Unassigned'
    })) || [],
    overdue: overdueCount || 0
  }
}

/**
 * Fetch performance metrics
 */
async function fetchPerformanceMetrics(supabase: any, chambersId: string, fromDate: Date) {
  const { data, error } = await supabase.rpc('get_chamber_performance_metrics', {
    p_chambers_id: chambersId,
    p_from_date: fromDate.toISOString()
  })

  if (error) throw error

  return {
    assignment_efficiency: data?.assignment_efficiency || 0,
    average_response_time_hours: data?.avg_response_time_hours || 0,
    client_satisfaction_score: data?.client_satisfaction_score || 0
  }
}

/**
 * Format enquiry data for response
 */
function formatEnquiry(enquiry: any) {
  return {
    id: enquiry.id,
    title: enquiry.title,
    description: enquiry.description,
    priority: enquiry.priority,
    status: enquiry.status,
    client_id: enquiry.client_id,
    client_name: enquiry.clients?.name || 'Unknown Client',
    assigned_barrister_id: enquiry.assigned_barrister_id,
    assigned_barrister_name: enquiry.user_profiles?.full_name,
    assignment_date: enquiry.assignment_date,
    created_at: enquiry.created_at,
    updated_at: enquiry.updated_at,
    due_date: enquiry.due_date,
    urgency_score: enquiry.urgency_score || 0
  }
}