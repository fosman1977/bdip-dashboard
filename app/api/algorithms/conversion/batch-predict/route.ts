import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '../../../../../lib/security/auth'
import { checkRateLimit } from '../../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../../lib/security/cors'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { calculateConversionProbability, ConversionPredictionInput, ClientHistoryData, BarristerHistoryData, PracticeAreaStats, SeasonalityData } from '../../../../../lib/algorithms/conversion-prediction'
import { Enquiry, Client, Barrister } from '../../../../../types'

// Input validation schema
const batchRequestSchema = z.object({
  enquiryIds: z.array(z.string().uuid()).min(1).max(50), // Limit to prevent abuse
  includeDetails: z.boolean().default(true)
})

// POST /api/algorithms/conversion/batch-predict
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Authenticate request - admin and clerk only
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Enhanced rate limiting for batch operations
    const rateLimitResult = await checkRateLimit(request, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000, // 1 hour window
      keyGenerator: (req, userId) => `batch-conversion:${userId}`
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

    const { enquiryIds, includeDetails } = validation.data

    // Fetch all enquiries and their related data in batch
    const enquiriesData = await fetchBatchEnquiryData(supabase, enquiryIds)
    
    if (enquiriesData.length === 0) {
      return addSecureCORSHeaders(
        NextResponse.json(
          { 
            success: false,
            error: 'No valid enquiries found',
            message: 'None of the specified enquiries exist or you do not have access',
            code: 'NO_VALID_ENQUIRIES'
          },
          { status: 404 }
        ),
        request
      )
    }

    // Process predictions for all enquiries
    const predictions = new Map<string, any>()
    const errors = new Map<string, string>()
    
    for (const enquiryData of enquiriesData) {
      try {
        // Fetch historical data for this enquiry
        const historicalData = await fetchHistoricalData(
          supabase, 
          enquiryData.enquiry, 
          enquiryData.client, 
          enquiryData.barrister
        )

        // Prepare input for conversion prediction algorithm
        const predictionInput: ConversionPredictionInput = {
          enquiry: enquiryData.enquiry,
          client: enquiryData.client,
          assignedBarrister: enquiryData.barrister,
          historicalData
        }

        // Calculate conversion probability
        const prediction = calculateConversionProbability(predictionInput)
        
        // Store result (optionally exclude detailed breakdown for performance)
        predictions.set(enquiryData.enquiry.id, includeDetails ? prediction : {
          probability: prediction.probability,
          confidenceLevel: prediction.confidenceLevel,
          confidenceScore: prediction.confidenceScore
        })
        
      } catch (error) {
        console.error(`Error predicting conversion for enquiry ${enquiryData.enquiry.id}:`, error)
        errors.set(enquiryData.enquiry.id, error instanceof Error ? error.message : 'Unknown error')
      }
    }

    // Generate batch summary
    const summary = generateBatchSummary(predictions, errors, enquiryIds.length)

    // Log algorithm usage
    await logAlgorithmUsage(supabase, {
      userId: user.id,
      algorithm: 'conversion_prediction',
      operation: 'batch_predict',
      executionTime: Date.now() - startTime,
      success: true,
      batchSize: enquiryIds.length,
      successCount: predictions.size,
      errorCount: errors.size
    })

    // Convert Map to object for JSON serialization
    const predictionsObject = Object.fromEntries(predictions.entries())
    const errorsObject = Object.fromEntries(errors.entries())

    const response = NextResponse.json({
      success: true,
      data: {
        predictions: predictionsObject,
        errors: errorsObject,
        summary
      },
      meta: {
        processed: predictions.size,
        errors: errors.size,
        requested: enquiryIds.length,
        executionTime: Date.now() - startTime,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        includeDetails
      }
    })

    return addSecureCORSHeaders(response, request)

  } catch (error) {
    console.error('Batch conversion prediction error:', error)

    // Log failed algorithm usage
    try {
      const supabase = createServerSupabaseClient()
      await logAlgorithmUsage(supabase, {
        userId: 'anonymous',
        algorithm: 'conversion_prediction',
        operation: 'batch_predict',
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
        error: 'Batch prediction failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'BATCH_PREDICTION_ERROR',
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

// Helper function to fetch batch enquiry data
async function fetchBatchEnquiryData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  enquiryIds: string[]
): Promise<Array<{ enquiry: Enquiry; client?: Client; barrister?: Barrister }>> {
  try {
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select(`
        *,
        client:clients(*),
        assigned_barrister:barristers(*)
      `)
      .in('id', enquiryIds)

    if (error) {
      throw error
    }

    return (enquiries || []).map(enquiry => ({
      enquiry: enquiry as Enquiry,
      client: enquiry.client || undefined,
      barrister: enquiry.assigned_barrister || undefined
    }))
  } catch (error) {
    console.error('Error fetching batch enquiry data:', error)
    return []
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
  
  // Use Promise.all for parallel fetching to improve performance
  const [clientHistory, barristerHistory, practiceAreaStats] = await Promise.all([
    fetchClientHistory(supabase, client?.id),
    fetchBarristerHistory(supabase, barrister?.id),
    fetchPracticeAreaStats(supabase, enquiry.practice_area)
  ])
  
  // Generate seasonality data (synchronous)
  const seasonalityData = generateSeasonalityData(new Date(enquiry.received_at))
  
  return {
    clientHistory,
    barristerHistory,
    practiceAreaStats,
    seasonalityData
  }
}

// Helper function to fetch client history (optimized for batch processing)
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
    // Use aggregate queries for better performance
    const { data: stats, error } = await supabase
      .rpc('get_client_history_stats', { client_uuid: clientId })

    if (error) {
      throw error
    }

    if (!stats || stats.length === 0) {
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

    const stat = stats[0]
    return {
      totalEnquiries: stat.total_enquiries || 0,
      successfulConversions: stat.successful_conversions || 0,
      totalValue: stat.total_value || 0,
      averageResponseTime: stat.average_response_time || 0,
      lastInstructionDate: stat.last_instruction_date ? new Date(stat.last_instruction_date) : null,
      relationshipDuration: stat.relationship_duration_months || 0,
      paymentHistory: stat.payment_history || 'Fair'
    }
  } catch (error) {
    console.error('Error fetching client history:', error)
    // Fallback to simple query if RPC fails
    return await fetchClientHistoryFallback(supabase, clientId)
  }
}

// Fallback method for client history
async function fetchClientHistoryFallback(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string
): Promise<ClientHistoryData> {
  try {
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('status, response_time_hours, estimated_value, converted_at')
      .eq('client_id', clientId)
      .limit(100) // Limit for performance

    if (error) throw error

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

    const lastInstruction = enquiriesData.find(e => e.converted_at)
    const lastInstructionDate = lastInstruction ? new Date(lastInstruction.converted_at) : null
    const relationshipDuration = totalEnquiries > 0 ? Math.max(1, totalEnquiries * 2) : 0

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
    console.error('Error in client history fallback:', error)
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

// Helper function to fetch barrister history (optimized)
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
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('status, response_time_hours, practice_area')
      .eq('assigned_barrister_id', barristerId)
      .limit(100) // Limit for performance

    if (error) throw error

    const enquiriesData = enquiries || []
    const totalEnquiries = enquiriesData.length
    const successfulConversions = enquiriesData.filter(e => e.status === 'Converted').length
    
    const responseTimes = enquiriesData
      .filter(e => e.response_time_hours !== null)
      .map(e => e.response_time_hours)
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0

    // Calculate practice area conversions
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
      if (stats.total >= 2) { // Lower threshold for batch processing
        practiceAreaConversions.set(area, stats.converted / stats.total)
      }
    })

    return {
      totalEnquiries,
      successfulConversions,
      averageResponseTime,
      practiceAreaConversions,
      clientTypeConversions: new Map(),
      valueRangeConversions: new Map()
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

// Helper function to fetch practice area statistics (cached for batch processing)
const practiceAreaCache = new Map<string, { data: PracticeAreaStats; timestamp: number }>()
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

async function fetchPracticeAreaStats(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  practiceArea?: string
): Promise<PracticeAreaStats> {
  if (!practiceArea) {
    return {
      totalEnquiries: 0,
      conversionRate: 0.5,
      averageValue: 0,
      competitiveness: 'Medium',
      seasonalityFactor: 0
    }
  }

  // Check cache first
  const cached = practiceAreaCache.get(practiceArea)
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data
  }

  try {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('status, estimated_value')
      .eq('practice_area', practiceArea)
      .gte('received_at', oneYearAgo.toISOString())
      .limit(500) // Limit for performance

    if (error) throw error

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

    const competitiveness: PracticeAreaStats['competitiveness'] = 
      conversionRate < 0.3 ? 'High' :
      conversionRate > 0.6 ? 'Low' : 'Medium'

    const currentMonth = new Date().getMonth()
    const seasonalityFactor = Math.sin((currentMonth / 12) * 2 * Math.PI) * 0.05

    const result = {
      totalEnquiries,
      conversionRate,
      averageValue,
      competitiveness,
      seasonalityFactor
    }

    // Cache the result
    practiceAreaCache.set(practiceArea, { data: result, timestamp: Date.now() })
    
    return result
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

  const monthFactors = [
    -0.02, 0.01, 0.03, 0.02, 0.01, -0.01,
    -0.03, -0.04, 0.02, 0.04, 0.03, -0.01
  ]

  const dayFactors = [
    -0.02, 0.02, 0.01, 0.01, 0.00, -0.01, -0.02
  ]

  const timeFactors = hour >= 9 && hour <= 17 ? 0.02 : -0.01

  return {
    currentMonthFactor: monthFactors[month],
    dayOfWeekFactor: dayFactors[dayOfWeek],
    timeOfDayFactor: timeFactors,
    marketConditions: 'Good'
  }
}

// Helper function to generate batch summary
function generateBatchSummary(
  predictions: Map<string, any>,
  errors: Map<string, string>,
  totalRequested: number
): {
  overview: string
  statistics: {
    processed: number
    errors: number
    successRate: number
    avgProbability: number
    highConfidencePredictions: number
    lowConfidencePredictions: number
  }
  insights: string[]
} {
  const processed = predictions.size
  const errorCount = errors.size
  const successRate = Math.round((processed / totalRequested) * 100)

  const probabilities = Array.from(predictions.values()).map(p => p.probability)
  const avgProbability = probabilities.length > 0 
    ? Math.round(probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length * 10) / 10
    : 0

  const highConfidencePredictions = Array.from(predictions.values())
    .filter(p => p.confidenceLevel === 'High').length
  const lowConfidencePredictions = Array.from(predictions.values())
    .filter(p => p.confidenceLevel === 'Low' || p.confidenceLevel === 'Very Low').length

  const overview = `Successfully processed ${processed} of ${totalRequested} enquiries (${successRate}%)`

  const insights: string[] = []
  
  if (avgProbability > 70) {
    insights.push('High average conversion probability across batch')
  } else if (avgProbability < 40) {
    insights.push('Low average conversion probability - review enquiry quality')
  }

  if (lowConfidencePredictions > processed * 0.5) {
    insights.push('Many predictions have low confidence - consider gathering more historical data')
  }

  if (errorCount > 0) {
    insights.push(`${errorCount} enquiries could not be processed - check data completeness`)
  }

  return {
    overview,
    statistics: {
      processed,
      errors: errorCount,
      successRate,
      avgProbability,
      highConfidencePredictions,
      lowConfidencePredictions
    },
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
    batchSize?: number
    successCount?: number
    errorCount?: number
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
      success_count: data.successCount,
      error_count: data.errorCount,
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