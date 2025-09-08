import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { calculateConversionProbability, ConversionPredictionInput, ClientHistoryData, BarristerHistoryData, PracticeAreaStats, SeasonalityData } from '../../../../../lib/algorithms/conversion-prediction'
import { Enquiry, Client, Barrister } from '../../../../../types'

// Input validation schemas
const enquiryIdRequestSchema = z.object({
  enquiryId: z.string().uuid()
})

const enquiryDataRequestSchema = z.object({
  enquiryData: z.object({
    source: z.enum(['Email', 'Phone', 'Website', 'Referral', 'Direct']),
    practice_area: z.string().optional(),
    matter_type: z.string().optional(),
    description: z.string().optional(),
    estimated_value: z.number().optional(),
    urgency: z.enum(['Immediate', 'This Week', 'This Month', 'Flexible']),
    response_time_hours: z.number().optional(),
    received_at: z.string().optional()
  }),
  clientId: z.string().uuid().optional(),
  barristerId: z.string().uuid().optional()
})

const requestSchema = z.union([enquiryIdRequestSchema, enquiryDataRequestSchema])

// POST /api/algorithms/conversion/predict
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin and clerk only
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting for conversion prediction
    const rateLimitResult = await checkRateLimit(request, {
      ...rateLimitConfigs.api,
      maxRequests: 120,
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
    let client: Client | undefined
    let barrister: Barrister | undefined

    // Handle different request types
    if ('enquiryId' in requestData) {
      // Fetch enquiry and related data from database
      const enquiryData = await fetchEnquiryData(supabase, requestData.enquiryId)
      if (!enquiryData) {
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
      enquiry = enquiryData.enquiry
      client = enquiryData.client
      barrister = enquiryData.barrister
    } else {
      // Create temporary enquiry object and fetch optional client/barrister data
      enquiry = createTempEnquiry(requestData.enquiryData)
      
      if (requestData.clientId) {
        client = await fetchClient(supabase, requestData.clientId)
      }
      
      if (requestData.barristerId) {
        barrister = await fetchBarrister(supabase, requestData.barristerId)
      }
    }

    // Fetch historical data for prediction
    const historicalData = await fetchHistoricalData(supabase, enquiry, client, barrister)

    // Prepare input for conversion prediction algorithm
    const predictionInput: ConversionPredictionInput = {
      enquiry,
      client,
      assignedBarrister: barrister,
      historicalData
    }

    // Calculate conversion probability
    const prediction = calculateConversionProbability(predictionInput)

    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'conversion_prediction',
      operation: 'predict',
      executionTime: Date.now() - startTime,
      success: true,
      enquiryId: 'enquiryId' in requestData ? requestData.enquiryId : null,
      probabilityScore: prediction.probability
    })

    const response = NextResponse.json({
      success: true,
      data: prediction,
      meta: {
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        enquiryId: 'enquiryId' in requestData ? requestData.enquiryId : null
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Conversion prediction error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'conversion_prediction',
        operation: 'predict',
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
        error: 'Prediction failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'PREDICTION_ERROR',
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

// Helper function to fetch enquiry data from database
async function fetchEnquiryData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  enquiryId: string
): Promise<{ enquiry: Enquiry; client?: Client; barrister?: Barrister } | null> {
  try {
    const { data: enquiry, error } = await supabase
      .from('enquiries')
      .select(`
        *,
        client:clients(*),
        assigned_barrister:barristers(*)
      `)
      .eq('id', enquiryId)
      .single()

    if (error || !enquiry) {
      return null
    }

    return {
      enquiry: enquiry as Enquiry,
      client: enquiry.client || undefined,
      barrister: enquiry.assigned_barrister || undefined
    }
  } catch (error) {
    console.error('Error fetching enquiry data:', error)
    return null
  }
}

// Helper function to fetch client data
async function fetchClient(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string
): Promise<Client | undefined> {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (error || !client) {
      return undefined
    }

    return client as Client
  } catch (error) {
    console.error('Error fetching client:', error)
    return undefined
  }
}

// Helper function to fetch barrister data
async function fetchBarrister(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerId: string
): Promise<Barrister | undefined> {
  try {
    const { data: barrister, error } = await supabase
      .from('barristers')
      .select('*')
      .eq('id', barristerId)
      .single()

    if (error || !barrister) {
      return undefined
    }

    return barrister as Barrister
  } catch (error) {
    console.error('Error fetching barrister:', error)
    return undefined
  }
}

// Helper function to create temporary enquiry object
function createTempEnquiry(data: any): Enquiry {
  return {
    id: 'temp',
    lex_reference: null,
    client_id: null,
    source: data.source,
    practice_area: data.practice_area || null,
    matter_type: data.matter_type || null,
    description: data.description || null,
    estimated_value: data.estimated_value || null,
    urgency: data.urgency,
    status: 'New',
    assigned_clerk_id: null,
    assigned_barrister_id: null,
    received_at: data.received_at || new Date().toISOString(),
    responded_at: null,
    converted_at: null,
    response_time_hours: data.response_time_hours || null,
    conversion_probability: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

// Helper function to fetch historical data for prediction
async function fetchHistoricalData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  enquiry: Enquiry,
  client?: Client,
  barrister?: Barrister
): Promise<{
  clientHistory: ClientHistoryData
  barristerHistory: BarristerHistoryData
  practiceAreaStats: PracticeAreaStats
  seasonalityData: SeasonalityData
}> {
  
  // Fetch client history
  const clientHistory = await fetchClientHistory(supabase, client?.id)
  
  // Fetch barrister history
  const barristerHistory = await fetchBarristerHistory(supabase, barrister?.id)
  
  // Fetch practice area statistics
  const practiceAreaStats = await fetchPracticeAreaStats(supabase, enquiry.practice_area)
  
  // Generate seasonality data
  const seasonalityData = generateSeasonalityData(new Date(enquiry.received_at))
  
  return {
    clientHistory,
    barristerHistory,
    practiceAreaStats,
    seasonalityData
  }
}

// Helper function to fetch client history
async function fetchClientHistory(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId?: string
): Promise<ClientHistoryData> {
  if (!clientId) {
    return {
      totalEnquiries: 0,
      successfulConversions: 0,
      totalValue: 0,
      averageResponseTime: 0,
      lastInstructionDate: null,
      relationshipDuration: 0,
      paymentHistory: 'Fair'
    }
  }

  try {
    // Fetch client's historical enquiries
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('status, response_time_hours, estimated_value, converted_at')
      .eq('client_id', clientId)
      .order('received_at', { ascending: false })

    if (error) {
      throw error
    }

    const enquiriesData = enquiries || []
    const totalEnquiries = enquiriesData.length
    const successfulConversions = enquiriesData.filter(e => e.status === 'Converted').length
    const totalValue = enquiriesData
      .filter(e => e.status === 'Converted')
      .reduce((sum, e) => sum + (e.estimated_value || 0), 0)
    
    const responseTimes = enquiriesData
      .filter(e => e.response_time_hours !== null)
      .map(e => e.response_time_hours)
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0

    // Get last instruction date
    const lastInstruction = enquiriesData.find(e => e.converted_at)
    const lastInstructionDate = lastInstruction ? new Date(lastInstruction.converted_at) : null

    // Calculate relationship duration (mock - would be based on client creation date)
    const relationshipDuration = totalEnquiries > 0 ? Math.max(1, totalEnquiries * 2) : 0

    // Mock payment history assessment (would come from actual payment records)
    const paymentHistory: ClientHistoryData['paymentHistory'] = 
      totalValue > 100000 ? 'Excellent' :
      totalValue > 50000 ? 'Good' :
      totalValue > 10000 ? 'Fair' : 'Poor'

    return {
      totalEnquiries,
      successfulConversions,
      totalValue,
      averageResponseTime,
      lastInstructionDate,
      relationshipDuration,
      paymentHistory
    }
  } catch (error) {
    console.error('Error fetching client history:', error)
    return {
      totalEnquiries: 0,
      successfulConversions: 0,
      totalValue: 0,
      averageResponseTime: 0,
      lastInstructionDate: null,
      relationshipDuration: 0,
      paymentHistory: 'Fair'
    }
  }
}

// Helper function to fetch barrister history
async function fetchBarristerHistory(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  barristerId?: string
): Promise<BarristerHistoryData> {
  if (!barristerId) {
    return {
      totalEnquiries: 0,
      successfulConversions: 0,
      averageResponseTime: 0,
      practiceAreaConversions: new Map(),
      clientTypeConversions: new Map(),
      valueRangeConversions: new Map()
    }
  }

  try {
    // Fetch barrister's historical enquiries
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select(`
        status, 
        response_time_hours, 
        practice_area, 
        estimated_value,
        client:clients(type)
      `)
      .eq('assigned_barrister_id', barristerId)
      .order('received_at', { ascending: false })
      .limit(200) // Limit to recent enquiries for performance

    if (error) {
      throw error
    }

    const enquiriesData = enquiries || []
    const totalEnquiries = enquiriesData.length
    const successfulConversions = enquiriesData.filter(e => e.status === 'Converted').length
    
    const responseTimes = enquiriesData
      .filter(e => e.response_time_hours !== null)
      .map(e => e.response_time_hours)
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0

    // Calculate practice area conversion rates
    const practiceAreaStats = enquiriesData.reduce((acc, e) => {
      if (e.practice_area) {
        if (!acc[e.practice_area]) {
          acc[e.practice_area] = { total: 0, converted: 0 }
        }
        acc[e.practice_area].total++
        if (e.status === 'Converted') {
          acc[e.practice_area].converted++
        }
      }
      return acc
    }, {} as Record<string, { total: number; converted: number }>)

    const practiceAreaConversions = new Map<string, number>()
    Object.entries(practiceAreaStats).forEach(([area, stats]) => {
      if (stats.total >= 3) { // Only include areas with sufficient data
        practiceAreaConversions.set(area, stats.converted / stats.total)
      }
    })

    // Mock client type and value range conversions (would be calculated similarly)
    const clientTypeConversions = new Map<string, number>()
    const valueRangeConversions = new Map<string, number>()

    return {
      totalEnquiries,
      successfulConversions,
      averageResponseTime,
      practiceAreaConversions,
      clientTypeConversions,
      valueRangeConversions
    }
  } catch (error) {
    console.error('Error fetching barrister history:', error)
    return {
      totalEnquiries: 0,
      successfulConversions: 0,
      averageResponseTime: 0,
      practiceAreaConversions: new Map(),
      clientTypeConversions: new Map(),
      valueRangeConversions: new Map()
    }
  }
}

// Helper function to fetch practice area statistics
async function fetchPracticeAreaStats(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  practiceArea?: string
): Promise<PracticeAreaStats> {
  if (!practiceArea) {
    return {
      totalEnquiries: 0,
      conversionRate: 0.5, // Default industry average
      averageValue: 0,
      competitiveness: 'Medium',
      seasonalityFactor: 0
    }
  }

  try {
    // Fetch practice area statistics from last 12 months
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('status, estimated_value')
      .eq('practice_area', practiceArea)
      .gte('received_at', oneYearAgo.toISOString())

    if (error) {
      throw error
    }

    const enquiriesData = enquiries || []
    const totalEnquiries = enquiriesData.length
    const successfulConversions = enquiriesData.filter(e => e.status === 'Converted').length
    const conversionRate = totalEnquiries > 0 ? successfulConversions / totalEnquiries : 0.5

    const values = enquiriesData
      .filter(e => e.estimated_value !== null)
      .map(e => e.estimated_value)
    const averageValue = values.length > 0 
      ? values.reduce((sum, val) => sum + val, 0) / values.length 
      : 0

    // Mock competitiveness assessment (would be based on market data)
    const competitiveness: PracticeAreaStats['competitiveness'] = 
      conversionRate < 0.3 ? 'High' :
      conversionRate > 0.6 ? 'Low' : 'Medium'

    // Mock seasonality factor (would be calculated from historical patterns)
    const currentMonth = new Date().getMonth()
    const seasonalityFactor = Math.sin((currentMonth / 12) * 2 * Math.PI) * 0.05

    return {
      totalEnquiries,
      conversionRate,
      averageValue,
      competitiveness,
      seasonalityFactor
    }
  } catch (error) {
    console.error('Error fetching practice area stats:', error)
    return {
      totalEnquiries: 0,
      conversionRate: 0.5,
      averageValue: 0,
      competitiveness: 'Medium',
      seasonalityFactor: 0
    }
  }
}

// Helper function to generate seasonality data
function generateSeasonalityData(enquiryDate: Date): SeasonalityData {
  const month = enquiryDate.getMonth()
  const dayOfWeek = enquiryDate.getDay()
  const hour = enquiryDate.getHours()

  // Mock seasonality factors (would be based on historical analysis)
  const monthFactors = [
    -0.02, 0.01, 0.03, 0.02, 0.01, -0.01, // Jan-Jun
    -0.03, -0.04, 0.02, 0.04, 0.03, -0.01  // Jul-Dec
  ]

  const dayFactors = [
    -0.02, 0.02, 0.01, 0.01, 0.00, -0.01, -0.02 // Sun-Sat
  ]

  const timeFactors = hour >= 9 && hour <= 17 ? 0.02 : -0.01 // Business hours

  return {
    currentMonthFactor: monthFactors[month],
    dayOfWeekFactor: dayFactors[dayOfWeek],
    timeOfDayFactor: timeFactors,
    marketConditions: 'Good' // Would be dynamically assessed
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
    enquiryId?: string | null
    probabilityScore?: number
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
      probability_score: data.probabilityScore,
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