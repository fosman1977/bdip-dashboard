import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { generateCapacityPlan, WorkloadMetrics } from '../../../../../lib/algorithms/workload-balancing'
import { Barrister, Clerk, Enquiry } from '../../../../../types'

// Input validation schema
const capacityPlanRequestSchema = z.object({
  timePeriod: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }),
  growthAssumptions: z.object({
    enquiryGrowthRate: z.number().min(-0.5).max(2.0).default(0.1), // 10% growth default
    valueGrowthRate: z.number().min(-0.5).max(2.0).default(0.05),   // 5% value growth default
    complexityIncrease: z.number().min(0).max(0.5).default(0.02),   // 2% complexity increase
    seasonalityFactor: z.number().min(-0.3).max(0.5).default(0)     // Seasonal adjustment
  }).optional(),
  scenarioAnalysis: z.object({
    includeOptimistic: z.boolean().default(true),
    includePessimistic: z.boolean().default(true),
    includeStressTest: z.boolean().default(false)
  }).optional(),
  constraints: z.object({
    maxOvertimeHours: z.number().min(0).max(20).default(5),
    maxUtilizationRate: z.number().min(0.7).max(1.0).default(0.9),
    budgetConstraints: z.number().optional()
  }).optional()
})

// POST /api/algorithms/workload/capacity-plan
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin only
    const authResult = await authenticateRequest(request, ['admin'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Strict rate limiting for capacity planning
    const rateLimitResult = await checkRateLimit(request, {
      maxRequests: 2,
      windowMs: 60 * 60 * 1000, // 1 hour window
      keyGenerator: (req, userId) => `capacity-plan:${userId}`
    }, user.id)
    
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validation = capacityPlanRequestSchema.safeParse(body)
    
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

    const { timePeriod, growthAssumptions, scenarioAnalysis, constraints } = validation.data
    
    // Validate time period
    const startDate = new Date(timePeriod.startDate)
    const endDate = new Date(timePeriod.endDate)
    const planningHorizon = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (planningHorizon < 1 || planningHorizon > 365) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'Invalid time period',
            message: 'Planning horizon must be between 1 and 365 days',
            code: 'INVALID_TIME_PERIOD'
          },
          { status: 400 }
        ),
        request
      )
    }
    
    // Fetch current resources and workloads
    const [barristers, clerks] = await Promise.all([
      fetchActiveBarristers(supabase),
      fetchActiveClerks(supabase)
    ])
    
    if (barristers.length === 0) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'No resources found',
            message: 'No active barristers found for capacity planning',
            code: 'NO_RESOURCES_FOUND'
          },
          { status: 404 }
        ),
        request
      )
    }
    
    // Fetch historical enquiry data for projections
    const historicalEnquiries = await fetchHistoricalEnquiries(supabase, startDate)
    
    // Project future enquiries based on growth assumptions
    const projectedEnquiries = projectFutureEnquiries(
      historicalEnquiries, 
      timePeriod, 
      growthAssumptions
    )
    
    // Fetch current workload metrics
    const allPersonnel = [...barristers.map(b => ({ id: b.id, type: 'barrister' as const })), 
                          ...clerks.map(c => ({ id: c.id, type: 'clerk' as const }))]
    const currentWorkloads = await fetchWorkloadMetrics(supabase, allPersonnel)
    
    // Generate base capacity plan
    const baseCapacityPlan = generateCapacityPlan(barristers, clerks, currentWorkloads, projectedEnquiries)
    
    // Generate scenario analysis if requested
    const scenarios = await generateScenarioAnalysis(
      barristers,
      clerks,
      currentWorkloads,
      historicalEnquiries,
      timePeriod,
      growthAssumptions,
      scenarioAnalysis
    )
    
    // Generate detailed recommendations
    const detailedRecommendations = generateDetailedRecommendations(
      baseCapacityPlan,
      scenarios,
      constraints,
      planningHorizon
    )
    
    // Calculate financial impact
    const financialImpact = calculateFinancialImpact(
      baseCapacityPlan,
      scenarios,
      barristers.length,
      clerks.length
    )
    
    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'workload_balancing',
      operation: 'capacity_plan',
      executionTime: Date.now() - startTime,
      success: true,
      planningHorizonDays: planningHorizon
    })

    const response = NextResponse.json({
      success: true,
      data: {
        baseCapacityPlan,
        scenarios,
        detailedRecommendations,
        financialImpact,
        planningParameters: {
          timePeriod,
          planningHorizonDays: planningHorizon,
          growthAssumptions,
          constraints
        },
        resourceSummary: {
          currentBarristers: barristers.length,
          currentClerks: clerks.length,
          totalCapacityHours: Array.from(currentWorkloads.values()).reduce((sum, w) => sum + w.maxHours, 0),
          currentUtilization: baseCapacityPlan.currentUtilization
        }
      },
      meta: {
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        planningHorizonDays: planningHorizon
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Capacity planning error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'workload_balancing',
        operation: 'capacity_plan',
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
        error: 'Capacity planning failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'CAPACITY_PLANNING_ERROR',
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

// Helper function to fetch active barristers
async function fetchActiveBarristers(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<Barrister[]> {
  try {
    const { data: barristers, error } = await supabase
      .from('barristers')
      .select('*')
      .eq('is_active', true)
      .order('seniority')
    
    if (error) {
      throw error
    }
    
    return barristers || []
  } catch (error) {
    console.error('Error fetching barristers:', error)
    return []
  }
}

// Helper function to fetch active clerks
async function fetchActiveClerks(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<Clerk[]> {
  try {
    const { data: clerks, error } = await supabase
      .from('clerks')
      .select('*')
      .order('name')
    
    if (error) {
      throw error
    }
    
    return clerks || []
  } catch (error) {
    console.error('Error fetching clerks:', error)
    return []
  }
}

// Helper function to fetch historical enquiries for projections
async function fetchHistoricalEnquiries(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  fromDate: Date
): Promise<Enquiry[]> {
  try {
    // Fetch last 12 months of data for better projections
    const twelveMonthsAgo = new Date(fromDate)
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('*')
      .gte('received_at', twelveMonthsAgo.toISOString())
      .order('received_at')
    
    if (error) {
      throw error
    }
    
    return enquiries || []
  } catch (error) {
    console.error('Error fetching historical enquiries:', error)
    return []
  }
}

// Helper function to project future enquiries
function projectFutureEnquiries(
  historicalEnquiries: Enquiry[],
  timePeriod: { startDate: string; endDate: string },
  growthAssumptions?: any
): Enquiry[] {
  if (historicalEnquiries.length === 0) {
    return []
  }
  
  const startDate = new Date(timePeriod.startDate)
  const endDate = new Date(timePeriod.endDate)
  const projectionDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  
  // Calculate historical daily average
  const historicalDays = 365 // Use last year's data
  const dailyAverage = historicalEnquiries.length / historicalDays
  
  // Apply growth assumptions
  const growthRate = growthAssumptions?.enquiryGrowthRate || 0.1
  const adjustedDailyAverage = dailyAverage * (1 + growthRate)
  
  // Generate projected enquiries
  const projectedEnquiries: Enquiry[] = []
  const projectedCount = Math.ceil(adjustedDailyAverage * projectionDays)
  
  // Use historical patterns to create realistic projections
  const historicalPattern = analyzeHistoricalPattern(historicalEnquiries)
  
  for (let i = 0; i < projectedCount; i++) {
    const sampleEnquiry = historicalEnquiries[i % historicalEnquiries.length]
    const projectedDate = new Date(startDate.getTime() + (i / projectedCount) * (endDate.getTime() - startDate.getTime()))
    
    // Apply value growth
    const valueGrowthRate = growthAssumptions?.valueGrowthRate || 0.05
    const projectedValue = (sampleEnquiry.estimated_value || 0) * (1 + valueGrowthRate)
    
    projectedEnquiries.push({
      ...sampleEnquiry,
      id: `projected_${i}`,
      received_at: projectedDate.toISOString(),
      estimated_value: Math.round(projectedValue),
      status: 'New',
      assigned_barrister_id: null,
      assigned_clerk_id: null
    })
  }
  
  return projectedEnquiries
}

// Helper function to analyze historical patterns
function analyzeHistoricalPattern(enquiries: Enquiry[]): {
  averageValue: number
  complexityDistribution: Record<string, number>
  urgencyDistribution: Record<string, number>
  practiceAreaDistribution: Record<string, number>
} {
  const values = enquiries.filter(e => e.estimated_value).map(e => e.estimated_value!)
  const averageValue = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
  
  // Simple distributions - could be enhanced with more sophisticated analysis
  const practiceAreas = enquiries.reduce((acc, e) => {
    if (e.practice_area) {
      acc[e.practice_area] = (acc[e.practice_area] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)
  
  const urgency = enquiries.reduce((acc, e) => {
    acc[e.urgency] = (acc[e.urgency] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  return {
    averageValue,
    complexityDistribution: { Simple: 0.4, Medium: 0.4, Complex: 0.2 }, // Simplified
    urgencyDistribution: urgency,
    practiceAreaDistribution: practiceAreas
  }
}

// Helper function to fetch workload metrics (simplified version)
async function fetchWorkloadMetrics(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  personnel: Array<{ id: string; type: 'barrister' | 'clerk' }>
): Promise<Map<string, WorkloadMetrics>> {
  const workloadMap = new Map<string, WorkloadMetrics>()
  
  // Simplified workload calculation for capacity planning
  for (const person of personnel) {
    const mockWorkload: WorkloadMetrics = {
      barristerId: person.id,
      currentHours: Math.random() * 35 + 5, // 5-40 hours
      maxHours: person.type === 'clerk' ? 40 : 40,
      utilizationRate: 0,
      dailyHours: 0,
      weeklyHours: 0,
      qualityScore: Math.random() * 30 + 60, // 60-90 quality score
      activeEnquiries: Math.floor(Math.random() * 10) + 1,
      activeTasks: Math.floor(Math.random() * 5),
      lastAssignment: new Date(),
      isAvailable: true,
      specializations: []
    }
    
    mockWorkload.utilizationRate = mockWorkload.currentHours / mockWorkload.maxHours
    mockWorkload.dailyHours = mockWorkload.currentHours / 5
    mockWorkload.weeklyHours = mockWorkload.currentHours
    
    workloadMap.set(person.id, mockWorkload)
  }
  
  return workloadMap
}

// Helper function to generate scenario analysis
async function generateScenarioAnalysis(
  barristers: Barrister[],
  clerks: Clerk[],
  currentWorkloads: Map<string, WorkloadMetrics>,
  historicalEnquiries: Enquiry[],
  timePeriod: any,
  growthAssumptions: any,
  scenarioConfig?: any
): Promise<{
  optimistic?: any
  pessimistic?: any
  stressTest?: any
}> {
  const scenarios: any = {}
  
  if (scenarioConfig?.includeOptimistic) {
    const optimisticAssumptions = {
      ...growthAssumptions,
      enquiryGrowthRate: (growthAssumptions?.enquiryGrowthRate || 0.1) * 1.5,
      valueGrowthRate: (growthAssumptions?.valueGrowthRate || 0.05) * 1.3
    }
    
    const optimisticEnquiries = projectFutureEnquiries(historicalEnquiries, timePeriod, optimisticAssumptions)
    scenarios.optimistic = generateCapacityPlan(barristers, clerks, currentWorkloads, optimisticEnquiries)
    scenarios.optimistic.scenario = 'Optimistic'
    scenarios.optimistic.description = 'Higher than expected growth with increased enquiry values'
  }
  
  if (scenarioConfig?.includePessimistic) {
    const pessimisticAssumptions = {
      ...growthAssumptions,
      enquiryGrowthRate: Math.max(-0.2, (growthAssumptions?.enquiryGrowthRate || 0.1) * 0.5),
      valueGrowthRate: Math.max(-0.1, (growthAssumptions?.valueGrowthRate || 0.05) * 0.3)
    }
    
    const pessimisticEnquiries = projectFutureEnquiries(historicalEnquiries, timePeriod, pessimisticAssumptions)
    scenarios.pessimistic = generateCapacityPlan(barristers, clerks, currentWorkloads, pessimisticEnquiries)
    scenarios.pessimistic.scenario = 'Pessimistic'
    scenarios.pessimistic.description = 'Lower growth with reduced enquiry values'
  }
  
  if (scenarioConfig?.includeStressTest) {
    const stressTestAssumptions = {
      ...growthAssumptions,
      enquiryGrowthRate: (growthAssumptions?.enquiryGrowthRate || 0.1) * 2,
      complexityIncrease: 0.3 // 30% increase in complexity
    }
    
    const stressTestEnquiries = projectFutureEnquiries(historicalEnquiries, timePeriod, stressTestAssumptions)
    scenarios.stressTest = generateCapacityPlan(barristers, clerks, currentWorkloads, stressTestEnquiries)
    scenarios.stressTest.scenario = 'Stress Test'
    scenarios.stressTest.description = 'High growth with increased complexity - worst case scenario'
  }
  
  return scenarios
}

// Helper function to generate detailed recommendations
function generateDetailedRecommendations(
  baseCapacityPlan: any,
  scenarios: any,
  constraints?: any,
  planningHorizonDays?: number
): {
  immediate: Array<{ action: string; priority: string; impact: string; timeframe: string }>
  shortTerm: Array<{ action: string; priority: string; impact: string; timeframe: string }>
  longTerm: Array<{ action: string; priority: string; impact: string; timeframe: string }>
  contingency: Array<{ trigger: string; action: string; preparation: string }>
} {
  const immediate: any[] = []
  const shortTerm: any[] = []
  const longTerm: any[] = []
  const contingency: any[] = []
  
  // Analyze base capacity plan
  if (baseCapacityPlan.projectedUtilization > 90) {
    immediate.push({
      action: 'Implement immediate workload redistribution',
      priority: 'Critical',
      impact: 'Prevent capacity overflow',
      timeframe: 'This week'
    })
  }
  
  if (baseCapacityPlan.bottlenecks.length > 0) {
    baseCapacityPlan.bottlenecks
      .filter((b: any) => b.severity === 'Critical' || b.severity === 'High')
      .forEach((bottleneck: any) => {
        immediate.push({
          action: `Address ${bottleneck.resource} capacity bottleneck`,
          priority: bottleneck.severity === 'Critical' ? 'Critical' : 'High',
          impact: bottleneck.recommendation,
          timeframe: bottleneck.severity === 'Critical' ? 'Immediate' : 'This week'
        })
      })
  }
  
  // Short-term recommendations (1-3 months)
  if (baseCapacityPlan.projectedUtilization > 85) {
    shortTerm.push({
      action: 'Begin recruitment process for additional barristers',
      priority: 'High',
      impact: 'Increase capacity by 20-25%',
      timeframe: '2-3 months'
    })
  }
  
  // Long-term recommendations (3-12 months)
  longTerm.push({
    action: 'Implement comprehensive capacity management system',
    priority: 'Medium',
    impact: 'Improve resource allocation efficiency by 15%',
    timeframe: '6-12 months'
  })
  
  // Analyze scenarios for contingency planning
  if (scenarios.optimistic && scenarios.optimistic.projectedUtilization > 95) {
    contingency.push({
      trigger: 'Enquiry growth exceeds 50% of projections',
      action: 'Activate emergency hiring protocol',
      preparation: 'Maintain candidate pipeline and fast-track processes'
    })
  }
  
  if (scenarios.stressTest && scenarios.stressTest.projectedUtilization > 100) {
    contingency.push({
      trigger: 'Capacity reaches 95% utilization',
      action: 'Implement overflow management procedures',
      preparation: 'Establish partnerships with other chambers or freelance barristers'
    })
  }
  
  return {
    immediate,
    shortTerm,
    longTerm,
    contingency
  }
}

// Helper function to calculate financial impact
function calculateFinancialImpact(
  baseCapacityPlan: any,
  scenarios: any,
  currentBarristers: number,
  currentClerks: number
): {
  currentCosts: { barristers: number; clerks: number; total: number }
  projectedCosts: { barristers: number; clerks: number; total: number }
  recommendations: Array<{
    action: string
    cost: number
    benefit: number
    roi: number
    paybackPeriod: string
  }>
} {
  // Rough estimates - would be more precise with actual salary data
  const avgBarristerCost = 80000 // Annual cost including benefits
  const avgClerkCost = 45000    // Annual cost including benefits
  
  const currentCosts = {
    barristers: currentBarristers * avgBarristerCost,
    clerks: currentClerks * avgClerkCost,
    total: (currentBarristers * avgBarristerCost) + (currentClerks * avgClerkCost)
  }
  
  // Estimate additional staff needs based on projectedUtilization
  const additionalBarristersNeeded = baseCapacityPlan.projectedUtilization > 90 
    ? Math.ceil((baseCapacityPlan.projectedUtilization - 85) / 20) 
    : 0
  
  const additionalClerksNeeded = additionalBarristersNeeded > 0 
    ? Math.ceil(additionalBarristersNeeded * 0.5) 
    : 0
  
  const projectedCosts = {
    barristers: (currentBarristers + additionalBarristersNeeded) * avgBarristerCost,
    clerks: (currentClerks + additionalClerksNeeded) * avgClerkCost,
    total: ((currentBarristers + additionalBarristersNeeded) * avgBarristerCost) + 
           ((currentClerks + additionalClerksNeeded) * avgClerkCost)
  }
  
  const recommendations = []
  
  if (additionalBarristersNeeded > 0) {
    const cost = additionalBarristersNeeded * avgBarristerCost
    const benefit = cost * 1.5 // Assuming 50% margin on additional capacity
    recommendations.push({
      action: `Hire ${additionalBarristersNeeded} additional barrister${additionalBarristersNeeded > 1 ? 's' : ''}`,
      cost,
      benefit,
      roi: ((benefit - cost) / cost) * 100,
      paybackPeriod: '6-12 months'
    })
  }
  
  return {
    currentCosts,
    projectedCosts,
    recommendations
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
    planningHorizonDays?: number
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
      planning_horizon_days: data.planningHorizonDays,
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