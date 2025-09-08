import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { evaluateCandidate, extractRoutingCriteria, BarristerWorkload } from '../../../../../lib/algorithms/enquiry-routing'
import { Barrister, Enquiry } from '../../../../../types'

// Input validation schema
const evaluationRequestSchema = z.object({
  enquiryId: z.string().uuid(),
  barristerIds: z.array(z.string().uuid()).min(1).max(20), // Limit to prevent abuse
  includeUnavailable: z.boolean().default(false)
})

// POST /api/algorithms/routing/evaluate-candidates
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin and clerk only
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting for evaluation operations
    const rateLimitResult = await checkRateLimit(request, {
      ...rateLimitConfigs.api,
      maxRequests: 150,
      windowMs: 15 * 60 * 1000
    }, user.id)
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validation = evaluationRequestSchema.safeParse(body)
    
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

    const { enquiryId, barristerIds, includeUnavailable } = validation.data

    // Fetch enquiry data
    const enquiry = await fetchEnquiry(supabase, enquiryId)
    if (!enquiry) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'Enquiry not found',
            message: 'The specified enquiry does not exist or you do not have access',
            code: 'ENQUIRY_NOT_FOUND'
          },
          { status: 404 }
        ),
        request
      )
    }

    // Extract routing criteria from enquiry
    const criteria = extractRoutingCriteria(enquiry)

    // Fetch specified barristers
    const barristers = await fetchBarristers(supabase, barristerIds, includeUnavailable)
    if (barristers.length === 0) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'No barristers found',
            message: 'None of the specified barristers exist or are available',
            code: 'NO_BARRISTERS_FOUND'
          },
          { status: 404 }
        ),
        request
      )
    }

    // Fetch workloads for the barristers
    const workloadMap = await fetchBarristerWorkloads(supabase, barristers.map(b => b.id))

    // Evaluate each candidate
    const evaluations = barristers
      .map(barrister => evaluateCandidate(barrister, criteria, workloadMap.get(barrister.id)))
      .filter(candidate => candidate !== null)
      .sort((a, b) => (b?.suitabilityScore || 0) - (a?.suitabilityScore || 0))

    // Separate eligible and ineligible candidates
    const eligibleCandidates = evaluations.filter(candidate => 
      candidate.eligibility.meetsPracticeArea &&
      candidate.eligibility.meetsSeniorityRequirement &&
      candidate.eligibility.hasCapacity &&
      candidate.eligibility.meetsValueRequirement
    )

    const ineligibleCandidates = evaluations.filter(candidate => 
      !(candidate.eligibility.meetsPracticeArea &&
        candidate.eligibility.meetsSeniorityRequirement &&
        candidate.eligibility.hasCapacity &&
        candidate.eligibility.meetsValueRequirement)
    )

    // Generate summary insights
    const insights = generateEvaluationInsights(enquiry, evaluations, eligibleCandidates)

    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'enquiry_routing',
      operation: 'evaluate_candidates',
      executionTime: Date.now() - startTime,
      success: true,
      enquiryId,
      candidateCount: barristers.length
    })

    const response = NextResponse.json({
      success: true,
      data: {
        enquiry: {
          id: enquiry.id,
          practice_area: enquiry.practice_area,
          matter_type: enquiry.matter_type,
          estimated_value: enquiry.estimated_value,
          urgency: enquiry.urgency,
          complexity: criteria.complexity
        },
        candidates: {
          eligible: eligibleCandidates,
          ineligible: ineligibleCandidates,
          total: evaluations.length
        },
        insights,
        criteria
      },
      meta: {
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        enquiryId
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Candidate evaluation error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'enquiry_routing',
        operation: 'evaluate_candidates',
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
        error: 'Evaluation failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'EVALUATION_ERROR',
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

// Helper function to fetch enquiry from database
async function fetchEnquiry(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  enquiryId: string
): Promise<Enquiry | null> {
  try {
    const { data: enquiry, error } = await supabase
      .from('enquiries')
      .select(`
        *,
        client:clients(id, name, type),
        assigned_clerk:clerks(id, name),
        assigned_barrister:barristers(id, name)
      `)
      .eq('id', enquiryId)
      .single()

    if (error || !enquiry) {
      return null
    }

    return enquiry as Enquiry
  } catch (error) {
    console.error('Error fetching enquiry:', error)
    return null
  }
}

// Helper function to fetch specified barristers
async function fetchBarristers(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerIds: string[],
  includeUnavailable: boolean
): Promise<Barrister[]> {
  try {
    let query = supabase
      .from('barristers')
      .select('*')
      .in('id', barristerIds)

    if (!includeUnavailable) {
      query = query.eq('is_active', true)
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

// Helper function to fetch barrister workloads
async function fetchBarristerWorkloads(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerIds: string[]
): Promise<Map<string, BarristerWorkload>> {
  const workloadMap = new Map<string, BarristerWorkload>()
  
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

// Helper function to generate evaluation insights
function generateEvaluationInsights(
  enquiry: Enquiry,
  allCandidates: any[],
  eligibleCandidates: any[]
): {
  summary: string
  recommendations: string[]
  concerns: string[]
  statistics: {
    eligibilityRate: number
    averageScore: number
    topScore: number
    practiceAreaMatches: number
    seniorityMismatches: number
    capacityIssues: number
  }
} {
  const total = allCandidates.length
  const eligible = eligibleCandidates.length
  const eligibilityRate = total > 0 ? Math.round((eligible / total) * 100) : 0
  
  const allScores = allCandidates.map(c => c.suitabilityScore)
  const averageScore = allScores.length > 0 ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length) : 0
  const topScore = allScores.length > 0 ? Math.max(...allScores) : 0
  
  const practiceAreaMatches = allCandidates.filter(c => c.eligibility.meetsPracticeArea).length
  const seniorityMismatches = allCandidates.filter(c => !c.eligibility.meetsSeniorityRequirement).length
  const capacityIssues = allCandidates.filter(c => !c.eligibility.hasCapacity).length

  let summary: string
  if (eligible === 0) {
    summary = `None of the ${total} evaluated barristers are fully eligible for this enquiry`
  } else if (eligible === 1) {
    summary = `Only 1 of ${total} evaluated barristers is fully eligible for this enquiry`
  } else {
    summary = `${eligible} of ${total} evaluated barristers are fully eligible for this enquiry`
  }

  const recommendations: string[] = []
  const concerns: string[] = []

  if (eligible > 0 && topScore >= 80) {
    recommendations.push('Strong candidates available - proceed with assignment')
  } else if (eligible > 0 && topScore >= 60) {
    recommendations.push('Suitable candidates available with minor considerations')
  } else if (eligible > 0) {
    recommendations.push('Limited suitable candidates - consider manual review')
  }

  if (practiceAreaMatches < total * 0.5) {
    concerns.push('Limited practice area expertise among evaluated barristers')
  }

  if (seniorityMismatches > 0) {
    concerns.push(`${seniorityMismatches} barristers may lack required seniority level`)
  }

  if (capacityIssues > total * 0.7) {
    concerns.push('High capacity utilization across evaluated barristers')
  }

  if (enquiry.urgency === 'Immediate' && capacityIssues > 0) {
    concerns.push('Urgent enquiry with capacity constraints')
  }

  return {
    summary,
    recommendations,
    concerns,
    statistics: {
      eligibilityRate,
      averageScore,
      topScore,
      practiceAreaMatches,
      seniorityMismatches,
      capacityIssues
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
    enquiryId?: string
    candidateCount?: number
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
      enquiry_id: data.enquiryId,
      candidate_count: data.candidateCount,
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