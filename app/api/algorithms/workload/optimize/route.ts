import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { calculateOptimalDistribution, WorkloadMetrics } from '../../../../../lib/algorithms/workload-balancing'
import { Barrister, Clerk } from '../../../../../types'

// Input validation schema
const optimizationRequestSchema = z.object({
  constraints: z.object({
    maxUtilization: z.number().min(0.5).max(1.0).default(0.85),
    minUtilization: z.number().min(0.1).max(0.7).default(0.3),
    preserveSpecialization: z.boolean().default(true),
    allowUrgentOverride: z.boolean().default(true)
  }).optional(),
  preferences: z.object({
    prioritizeEngagement: z.boolean().default(true),
    balanceWorkload: z.boolean().default(true),
    maintainQuality: z.boolean().default(true)
  }).optional(),
  scope: z.object({
    includeBarristers: z.array(z.string().uuid()).optional(),
    includeClerks: z.array(z.string().uuid()).optional(),
    excludeBarristers: z.array(z.string().uuid()).optional(),
    excludeClerks: z.array(z.string().uuid()).optional()
  }).optional()
})

// POST /api/algorithms/workload/optimize
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin and clerk only
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Enhanced rate limiting for optimization operations
    const rateLimitResult = await checkRateLimit(request, {
      maxRequests: 3,
      windowMs: 60 * 60 * 1000, // 1 hour window
      keyGenerator: (req, userId) => `workload-optimize:${userId}`
    }, user.id)
    
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate request body
    const body = await request.json().catch(() => ({}))
    const validation = optimizationRequestSchema.safeParse(body)
    
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

    const { constraints, preferences, scope } = validation.data || {}
    
    // Fetch all active barristers and clerks
    const [barristers, clerks] = await Promise.all([
      fetchBarristers(supabase, scope?.includeBarristers, scope?.excludeBarristers),
      fetchClerks(supabase, scope?.includeClerks, scope?.excludeClerks)
    ])
    
    if (barristers.length === 0 && clerks.length === 0) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'No resources found',
            message: 'No barristers or clerks found for optimization',
            code: 'NO_RESOURCES_FOUND'
          },
          { status: 404 }
        ),
        request
      )
    }
    
    // Fetch current workload metrics
    const allPersonnel = [...barristers.map(b => ({ id: b.id, type: 'barrister' as const })), 
                          ...clerks.map(c => ({ id: c.id, type: 'clerk' as const }))]
    const workloads = await fetchWorkloadMetrics(supabase, allPersonnel)
    
    // Calculate optimal distribution
    const distribution = calculateOptimalDistribution(barristers, clerks, workloads)
    
    // Generate optimization recommendations
    const optimizationPlan = generateOptimizationPlan(
      distribution, 
      workloads, 
      constraints, 
      preferences
    )
    
    // Calculate potential impact
    const impact = calculateOptimizationImpact(distribution, workloads)
    
    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'workload_balancing',
      operation: 'optimize',
      executionTime: Date.now() - startTime,
      success: true,
      resourceCount: barristers.length + clerks.length
    })

    const response = NextResponse.json({
      success: true,
      data: {
        currentDistribution: distribution,
        optimizationPlan,
        estimatedImpact: impact,
        constraints: {
          maxUtilization: constraints?.maxUtilization || 0.85,
          minUtilization: constraints?.minUtilization || 0.3,
          preserveSpecialization: constraints?.preserveSpecialization !== false,
          allowUrgentOverride: constraints?.allowUrgentOverride !== false
        }
      },
      meta: {
        resourcesAnalyzed: {
          barristers: barristers.length,
          clerks: clerks.length,
          total: barristers.length + clerks.length
        },
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Workload optimization error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'workload_balancing',
        operation: 'optimize',
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
        error: 'Optimization failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'OPTIMIZATION_ERROR',
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

// Helper function to fetch barristers with filtering
async function fetchBarristers(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  include?: string[],
  exclude?: string[]
): Promise<Barrister[]> {
  try {
    let query = supabase
      .from('barristers')
      .select('*')
      .eq('is_active', true)
    
    if (include && include.length > 0) {
      query = query.in('id', include)
    } else if (exclude && exclude.length > 0) {
      query = query.not('id', 'in', `(${exclude.join(',')})`)
    }
    
    const { data: barristers, error } = await query
    
    if (error) {
      throw error
    }
    
    return barristers || []
  } catch (error) {
    console.error('Error fetching barristers:', error)
    return []
  }
}

// Helper function to fetch clerks with filtering
async function fetchClerks(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  include?: string[],
  exclude?: string[]
): Promise<Clerk[]> {
  try {
    let query = supabase
      .from('clerks')
      .select('*')
    
    if (include && include.length > 0) {
      query = query.in('id', include)
    } else if (exclude && exclude.length > 0) {
      query = query.not('id', 'in', `(${exclude.join(',')})`)
    }
    
    const { data: clerks, error } = await query
    
    if (error) {
      throw error
    }
    
    return clerks || []
  } catch (error) {
    console.error('Error fetching clerks:', error)
    return []
  }
}

// Helper function to fetch workload metrics
async function fetchWorkloadMetrics(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  personnel: Array<{ id: string; type: 'barrister' | 'clerk' }>
): Promise<Map<string, WorkloadMetrics>> {
  const workloadMap = new Map<string, WorkloadMetrics>()
  
  try {
    for (const person of personnel) {
      let workload: WorkloadMetrics
      
      if (person.type === 'barrister') {
        workload = await fetchBarristerWorkload(supabase, person.id)
      } else {
        workload = await fetchClerkWorkload(supabase, person.id)
      }
      
      workloadMap.set(person.id, workload)
    }
    
    return workloadMap
  } catch (error) {
    console.error('Error fetching workload metrics:', error)
    return workloadMap
  }
}

// Helper function to fetch individual barrister workload
async function fetchBarristerWorkload(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerId: string
): Promise<WorkloadMetrics> {
  try {
    // Get barrister info
    const { data: barrister } = await supabase
      .from('barristers')
      .select('name, practice_areas, engagement_score, is_active')
      .eq('id', barristerId)
      .single()
    
    // Get active enquiries
    const { data: enquiries } = await supabase
      .from('enquiries')
      .select('status, estimated_value, received_at')
      .eq('assigned_barrister_id', barristerId)
      .in('status', ['New', 'Assigned', 'In Progress'])
    
    // Get active tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('points')
      .eq('barrister_id', barristerId)
      .is('completed_at', null)
    
    // Calculate metrics
    const activeEnquiries = enquiries?.length || 0
    const activeTasks = tasks?.length || 0
    
    // Estimate current hours based on active work
    const enquiryHours = (enquiries || []).reduce((sum, e) => {
      const value = e.estimated_value || 0
      let hours = 2 // Base hours
      if (value > 100000) hours += 8
      else if (value > 50000) hours += 4
      else if (value > 10000) hours += 2
      return sum + hours
    }, 0)
    
    const taskHours = (tasks || []).reduce((sum, t) => sum + (t.points * 0.5), 0)
    const currentHours = enquiryHours + taskHours
    const maxHours = 40 // Standard weekly capacity
    
    const lastAssignment = enquiries && enquiries.length > 0 
      ? new Date(Math.max(...enquiries.map(e => new Date(e.received_at).getTime())))
      : null
    
    return {
      barristerId,
      currentHours,
      maxHours,
      utilizationRate: currentHours / maxHours,
      dailyHours: currentHours / 5,
      weeklyHours: currentHours,
      qualityScore: barrister?.engagement_score || 50,
      activeEnquiries,
      activeTasks,
      lastAssignment,
      isAvailable: (barrister?.is_active || false) && (currentHours / maxHours) < 0.95,
      specializations: barrister?.practice_areas || []
    }
  } catch (error) {
    console.error(`Error fetching barrister workload for ${barristerId}:`, error)
    return {
      barristerId,
      currentHours: 0,
      maxHours: 40,
      utilizationRate: 0,
      dailyHours: 0,
      weeklyHours: 0,
      qualityScore: 50,
      activeEnquiries: 0,
      activeTasks: 0,
      lastAssignment: null,
      isAvailable: true,
      specializations: []
    }
  }
}

// Helper function to fetch individual clerk workload
async function fetchClerkWorkload(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clerkId: string
): Promise<WorkloadMetrics> {
  try {
    // Get clerk info
    const { data: clerk } = await supabase
      .from('clerks')
      .select('name, team, max_workload, current_workload, is_senior')
      .eq('id', clerkId)
      .single()
    
    // Get assigned enquiries
    const { data: enquiries } = await supabase
      .from('enquiries')
      .select('id')
      .eq('assigned_clerk_id', clerkId)
      .in('status', ['New', 'Assigned', 'In Progress'])
    
    // Get assigned tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('points')
      .eq('clerk_id', clerkId)
      .is('completed_at', null)
    
    const activeEnquiries = enquiries?.length || 0
    const activeTasks = tasks?.length || 0
    
    // Estimate current hours
    const currentHours = clerk?.current_workload || ((activeEnquiries * 2) + (activeTasks * 1))
    const maxHours = clerk?.max_workload || 40
    
    return {
      barristerId: clerkId,
      currentHours,
      maxHours,
      utilizationRate: currentHours / maxHours,
      dailyHours: currentHours / 5,
      weeklyHours: currentHours,
      qualityScore: clerk?.is_senior ? 85 : 75,
      activeEnquiries,
      activeTasks,
      lastAssignment: null,
      isAvailable: (currentHours / maxHours) < 0.90,
      specializations: clerk?.team ? [clerk.team] : []
    }
  } catch (error) {
    console.error(`Error fetching clerk workload for ${clerkId}:`, error)
    return {
      barristerId: clerkId,
      currentHours: 0,
      maxHours: 40,
      utilizationRate: 0,
      dailyHours: 0,
      weeklyHours: 0,
      qualityScore: 75,
      activeEnquiries: 0,
      activeTasks: 0,
      lastAssignment: null,
      isAvailable: true,
      specializations: []
    }
  }
}

// Helper function to generate optimization plan
function generateOptimizationPlan(
  distribution: any,
  workloads: Map<string, WorkloadMetrics>,
  constraints?: any,
  preferences?: any
): {
  actions: Array<{
    type: 'redistribute' | 'reduce_load' | 'increase_capacity' | 'defer_work'
    priority: 'high' | 'medium' | 'low'
    target: string
    description: string
    estimatedImpact: string
    timeframe: string
  }>
  summary: string
  feasibility: 'high' | 'medium' | 'low'
  riskAssessment: string[]
} {
  const actions: any[] = []
  const riskAssessment: string[] = []
  
  // Analyze overloaded resources
  const overloaded = [...distribution.barristers, ...distribution.clerks]
    .filter(person => person.variance > 15)
    .sort((a, b) => b.variance - a.variance)
  
  // Analyze underutilized resources
  const underutilized = [...distribution.barristers, ...distribution.clerks]
    .filter(person => person.variance < -10)
    .sort((a, b) => a.variance - b.variance)
  
  // Generate redistribution actions
  overloaded.slice(0, 3).forEach(person => {
    const workload = workloads.get(person.id)
    const severity = workload && workload.utilizationRate > 0.9 ? 'high' : 'medium'
    
    actions.push({
      type: 'redistribute',
      priority: severity,
      target: person.name,
      description: `Redistribute ${Math.ceil(person.variance)}% of workload to reduce utilization`,
      estimatedImpact: `Reduce utilization by ${Math.ceil(person.variance)}%`,
      timeframe: severity === 'high' ? 'Immediate' : 'This week'
    })
    
    if (workload && workload.utilizationRate > 0.95) {
      riskAssessment.push(`${person.name} is at critical capacity - burnout risk`)
    }
  })
  
  // Generate capacity increase actions for highly productive, underutilized resources
  underutilized
    .filter(person => {
      const workload = workloads.get(person.id)
      return workload && workload.qualityScore > 70
    })
    .slice(0, 2)
    .forEach(person => {
      actions.push({
        type: 'increase_capacity',
        priority: 'medium',
        target: person.name,
        description: `Increase assignments for high-performing, underutilized resource`,
        estimatedImpact: `Increase utilization by ${Math.ceil(Math.abs(person.variance))}%`,
        timeframe: 'This week'
      })
    })
  
  // Overall balance assessment
  const needsRebalancing = distribution.rebalanceRequired
  let feasibility: 'high' | 'medium' | 'low' = 'high'
  let summary = ''
  
  if (needsRebalancing) {
    if (distribution.overallBalance < 60) {
      feasibility = 'medium'
      summary = 'Significant rebalancing required - may need structural changes'
      riskAssessment.push('Low overall balance indicates systemic workload issues')
    } else {
      summary = 'Minor rebalancing needed - achievable through redistribution'
    }
  } else {
    summary = 'Workload distribution is well balanced - only minor optimizations needed'
  }
  
  // Add defer work actions if constraints are very tight
  if (constraints?.maxUtilization && constraints.maxUtilization < 0.8) {
    const highUtilizers = Array.from(workloads.entries())
      .filter(([_, workload]) => workload.utilizationRate > constraints.maxUtilization)
    
    if (highUtilizers.length > 0) {
      actions.push({
        type: 'defer_work',
        priority: 'low',
        target: 'Non-urgent matters',
        description: 'Consider deferring non-urgent work to maintain quality standards',
        estimatedImpact: 'Maintain quality while respecting capacity constraints',
        timeframe: 'Ongoing'
      })
    }
  }
  
  return {
    actions,
    summary,
    feasibility,
    riskAssessment
  }
}

// Helper function to calculate optimization impact
function calculateOptimizationImpact(
  distribution: any,
  workloads: Map<string, WorkloadMetrics>
): {
  currentBalance: number
  projectedBalance: number
  improvement: number
  affectedResources: number
  estimatedTimeToImplement: string
  qualityImpact: 'positive' | 'neutral' | 'negative'
} {
  const currentBalance = distribution.overallBalance
  
  // Estimate projected balance after optimization
  // This is a simplified calculation - in practice would be more sophisticated
  const projectedImprovement = Math.min(20, Math.max(5, 100 - currentBalance))
  const projectedBalance = Math.min(100, currentBalance + projectedImprovement)
  
  const affectedResources = [...distribution.barristers, ...distribution.clerks]
    .filter(person => Math.abs(person.variance) > 10).length
  
  // Estimate implementation time based on scope
  let estimatedTimeToImplement = '1-2 weeks'
  if (affectedResources > 10) {
    estimatedTimeToImplement = '3-4 weeks'
  } else if (affectedResources > 5) {
    estimatedTimeToImplement = '2-3 weeks'
  }
  
  // Assess quality impact
  const highQualityWorkers = Array.from(workloads.values())
    .filter(w => w.qualityScore > 80).length
  const overloadedHighQuality = Array.from(workloads.values())
    .filter(w => w.qualityScore > 80 && w.utilizationRate > 0.85).length
  
  let qualityImpact: 'positive' | 'neutral' | 'negative' = 'neutral'
  if (overloadedHighQuality > 0) {
    qualityImpact = 'positive' // Reducing load on high-quality workers
  } else if (projectedBalance > currentBalance + 10) {
    qualityImpact = 'positive' // Better balance generally improves quality
  }
  
  return {
    currentBalance,
    projectedBalance,
    improvement: projectedBalance - currentBalance,
    affectedResources,
    estimatedTimeToImplement,
    qualityImpact
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
    resourceCount?: number
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
      resource_count: data.resourceCount,
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