import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { routeEnquiry, extractRoutingCriteria, BarristerWorkload } from '../../../../../lib/algorithms/enquiry-routing'
import { Barrister, Enquiry, RoutingCriteria } from '../../../../../types'

// Input validation schemas
const enquiryIdRequestSchema = z.object({
  enquiryId: z.string().uuid()
})

const enquiryDataRequestSchema = z.object({
  enquiryData: z.object({
    practice_area: z.string().optional(),
    matter_type: z.string().optional(),
    description: z.string().optional(),
    estimated_value: z.number().optional(),
    urgency: z.enum(['Immediate', 'This Week', 'This Month', 'Flexible'])
  })
})

const requestSchema = z.union([enquiryIdRequestSchema, enquiryDataRequestSchema])

// POST /api/algorithms/routing/assign-enquiry
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin and clerk only
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting for routing operations
    const rateLimitResult = await checkRateLimit(request, {
      ...rateLimitConfigs.api,
      maxRequests: 100,
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
    let enquiry: Enquiry

    // Handle different request types
    if ('enquiryId' in requestData) {
      // Fetch enquiry from database
      const fetchedEnquiry = await fetchEnquiry(supabase, requestData.enquiryId)
      if (!fetchedEnquiry) {
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
      enquiry = fetchedEnquiry
    } else {
      // Create temporary enquiry object from provided data
      enquiry = createTempEnquiry(requestData.enquiryData)
    }

    // Fetch available barristers
    const availableBarristers = await fetchAvailableBarristers(supabase)
    if (availableBarristers.length === 0) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'No available barristers',
            message: 'No active barristers found in the system',
            code: 'NO_BARRISTERS_AVAILABLE'
          },
          { status: 404 }
        ),
        request
      )
    }

    // Fetch current workloads
    const workloadMap = await fetchBarristerWorkloads(supabase, availableBarristers.map(b => b.id))

    // Execute routing algorithm
    const routingResult = routeEnquiry(enquiry, availableBarristers, workloadMap)

    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'enquiry_routing',
      operation: 'assign_enquiry',
      executionTime: Date.now() - startTime,
      success: true,
      enquiryId: 'enquiryId' in requestData ? requestData.enquiryId : 'temp'
    })

    const response = NextResponse.json({
      success: true,
      data: routingResult,
      meta: {
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        enquiryId: 'enquiryId' in requestData ? requestData.enquiryId : null
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Enquiry routing error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'enquiry_routing',
        operation: 'assign_enquiry',
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
        error: 'Routing failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'ROUTING_ERROR',
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

// Helper function to create temporary enquiry object
function createTempEnquiry(data: any): Enquiry {
  return {
    id: 'temp',
    lex_reference: null,
    client_id: null,
    source: 'Direct',
    practice_area: data.practice_area || null,
    matter_type: data.matter_type || null,
    description: data.description || null,
    estimated_value: data.estimated_value || null,
    urgency: data.urgency,
    status: 'New',
    assigned_clerk_id: null,
    assigned_barrister_id: null,
    received_at: new Date().toISOString(),
    responded_at: null,
    converted_at: null,
    response_time_hours: null,
    conversion_probability: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

// Helper function to fetch available barristers
async function fetchAvailableBarristers(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<Barrister[]> {
  try {
    const { data: barristers, error } = await supabase
      .from('barristers')
      .select('*')
      .eq('is_active', true)
      .order('engagement_score', { ascending: false })

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