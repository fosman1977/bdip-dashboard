/**
 * Conversion Probability Calculator
 * 
 * Predicts the likelihood of enquiry conversion to instruction based on:
 * - Historical client relationship patterns
 * - Response time correlation analysis
 * - Matter value indicators
 * - Source quality metrics
 * - Barrister performance history
 * - Seasonality and market factors
 * 
 * Base probability: 50% (industry benchmark for UK barristers)
 * Range: 0-100% with confidence intervals
 */

import { Enquiry, Client, Barrister } from '../../types'

// Conversion prediction configuration
export const CONVERSION_CONFIG = {
  // Base probability (industry benchmark)
  baseProbability: 0.5,
  
  // Historical relationship bonuses
  repeatClientBonus: 0.2,
  longTermClientBonus: 0.15,
  highValueClientBonus: 0.1,
  
  // Response time correlation factors
  fastResponseBonus: 0.15, // < 4 hours
  standardResponseNeutral: 0.0, // 4-24 hours
  slowResponsePenalty: -0.1, // > 24 hours
  verySlowResponsePenalty: -0.2, // > 48 hours
  
  // Value-based adjustments
  highValueBonus: 0.1, // > £50k
  veryHighValueBonus: 0.05, // > £100k additional
  lowValuePenalty: -0.05, // < £5k
  
  // Source quality factors
  sourceFactors: {
    'Referral': 0.15,
    'Direct': 0.1,
    'Phone': 0.05,
    'Email': 0.0,
    'Website': -0.05
  },
  
  // Urgency impact
  urgencyFactors: {
    'Immediate': 0.1,
    'This Week': 0.05,
    'This Month': 0.0,
    'Flexible': -0.05
  },
  
  // Time-based factors
  businessHoursBonus: 0.05,
  fridayAfternoonPenalty: -0.05,
  
  // Confidence intervals
  highConfidenceThreshold: 20, // 20+ similar historical cases
  mediumConfidenceThreshold: 5, // 5+ similar cases
  lowConfidenceThreshold: 1, // 1+ similar cases
  
  // Maximum adjustment limits
  maxPositiveAdjustment: 0.4,
  maxNegativeAdjustment: -0.3
} as const

export interface ConversionPredictionInput {
  enquiry: Enquiry
  client?: Client
  assignedBarrister?: Barrister
  historicalData: {
    clientHistory: ClientHistoryData
    barristerHistory: BarristerHistoryData
    practiceAreaStats: PracticeAreaStats
    seasonalityData: SeasonalityData
  }
}

export interface ClientHistoryData {
  totalEnquiries: number
  successfulConversions: number
  totalValue: number
  averageResponseTime: number
  lastInstructionDate: Date | null
  relationshipDuration: number // months
  paymentHistory: 'Excellent' | 'Good' | 'Fair' | 'Poor'
}

export interface BarristerHistoryData {
  totalEnquiries: number
  successfulConversions: number
  averageResponseTime: number
  practiceAreaConversions: Map<string, number>
  clientTypeConversions: Map<string, number>
  valueRangeConversions: Map<string, number>
}

export interface PracticeAreaStats {
  totalEnquiries: number
  conversionRate: number
  averageValue: number
  competitiveness: 'Low' | 'Medium' | 'High'
  seasonalityFactor: number
}

export interface SeasonalityData {
  currentMonthFactor: number
  dayOfWeekFactor: number
  timeOfDayFactor: number
  marketConditions: 'Excellent' | 'Good' | 'Fair' | 'Poor'
}

export interface ConversionPrediction {
  probability: number // 0-1
  confidenceLevel: 'High' | 'Medium' | 'Low' | 'Very Low'
  confidenceScore: number // 0-100
  breakdown: {
    baseProbability: number
    clientRelationshipAdjustment: number
    responseTimeAdjustment: number
    valueAdjustment: number
    sourceAdjustment: number
    urgencyAdjustment: number
    barristerPerformanceAdjustment: number
    practiceAreaAdjustment: number
    seasonalityAdjustment: number
    totalAdjustment: number
  }
  riskFactors: string[]
  successFactors: string[]
  recommendations: string[]
  historicalComparisons: {
    similarCases: number
    averageConversionRate: number
    performanceBenchmark: 'Above' | 'At' | 'Below'
  }
}

/**
 * Calculate conversion probability for an enquiry
 */
export function calculateConversionProbability(input: ConversionPredictionInput): ConversionPrediction {
  const { enquiry, client, assignedBarrister, historicalData } = input

  // Calculate individual adjustment factors
  const clientAdjustment = calculateClientRelationshipAdjustment(client, historicalData.clientHistory)
  const responseTimeAdjustment = calculateResponseTimeAdjustment(enquiry.response_time_hours)
  const valueAdjustment = calculateValueAdjustment(enquiry.estimated_value)
  const sourceAdjustment = calculateSourceAdjustment(enquiry.source)
  const urgencyAdjustment = calculateUrgencyAdjustment(enquiry.urgency)
  const barristerAdjustment = calculateBarristerPerformanceAdjustment(assignedBarrister, enquiry, historicalData.barristerHistory)
  const practiceAreaAdjustment = calculatePracticeAreaAdjustment(enquiry.practice_area, historicalData.practiceAreaStats)
  const seasonalityAdjustment = calculateSeasonalityAdjustment(new Date(enquiry.received_at), historicalData.seasonalityData)

  // Sum all adjustments with limits
  const totalAdjustment = Math.max(
    CONVERSION_CONFIG.maxNegativeAdjustment,
    Math.min(
      CONVERSION_CONFIG.maxPositiveAdjustment,
      clientAdjustment + responseTimeAdjustment + valueAdjustment + 
      sourceAdjustment + urgencyAdjustment + barristerAdjustment + 
      practiceAreaAdjustment + seasonalityAdjustment
    )
  )

  // Calculate final probability
  const probability = Math.max(0, Math.min(1, CONVERSION_CONFIG.baseProbability + totalAdjustment))

  // Determine confidence level
  const { confidenceLevel, confidenceScore, similarCases } = calculateConfidence(input)

  // Generate risk and success factors
  const riskFactors = identifyRiskFactors(input, totalAdjustment)
  const successFactors = identifySuccessFactors(input, totalAdjustment)
  const recommendations = generateRecommendations(input, probability, riskFactors)

  // Historical benchmarking
  const averageConversionRate = calculateHistoricalBenchmark(input)
  const performanceBenchmark = probability > averageConversionRate ? 'Above' : 
                               probability < averageConversionRate - 0.05 ? 'Below' : 'At'

  return {
    probability: Math.round(probability * 1000) / 10, // Round to 1 decimal place as percentage
    confidenceLevel,
    confidenceScore,
    breakdown: {
      baseProbability: CONVERSION_CONFIG.baseProbability,
      clientRelationshipAdjustment: clientAdjustment,
      responseTimeAdjustment: responseTimeAdjustment,
      valueAdjustment: valueAdjustment,
      sourceAdjustment: sourceAdjustment,
      urgencyAdjustment: urgencyAdjustment,
      barristerPerformanceAdjustment: barristerAdjustment,
      practiceAreaAdjustment: practiceAreaAdjustment,
      seasonalityAdjustment: seasonalityAdjustment,
      totalAdjustment: totalAdjustment
    },
    riskFactors,
    successFactors,
    recommendations,
    historicalComparisons: {
      similarCases,
      averageConversionRate: Math.round(averageConversionRate * 1000) / 10,
      performanceBenchmark
    }
  }
}

/**
 * Calculate client relationship adjustment
 */
export function calculateClientRelationshipAdjustment(client?: Client, history?: ClientHistoryData): number {
  if (!client || !history) return 0

  let adjustment = 0

  // Repeat client bonus
  if (history.totalEnquiries > 1) {
    adjustment += CONVERSION_CONFIG.repeatClientBonus
  }

  // Long-term relationship bonus
  if (history.relationshipDuration > 12) {
    adjustment += CONVERSION_CONFIG.longTermClientBonus
  }

  // High-value client bonus
  if (client.total_value > 100000) {
    adjustment += CONVERSION_CONFIG.highValueClientBonus
  }

  // Payment history factor
  const paymentFactors = {
    'Excellent': 0.1,
    'Good': 0.05,
    'Fair': 0.0,
    'Poor': -0.15
  }
  adjustment += paymentFactors[history.paymentHistory]

  // Historical conversion rate factor
  if (history.totalEnquiries > 0) {
    const clientConversionRate = history.successfulConversions / history.totalEnquiries
    const rateAdjustment = (clientConversionRate - CONVERSION_CONFIG.baseProbability) * 0.3
    adjustment += Math.max(-0.2, Math.min(0.2, rateAdjustment))
  }

  return adjustment
}

/**
 * Calculate response time adjustment
 */
export function calculateResponseTimeAdjustment(responseTimeHours?: number): number {
  if (!responseTimeHours) return 0

  if (responseTimeHours <= 4) {
    return CONVERSION_CONFIG.fastResponseBonus
  } else if (responseTimeHours <= 24) {
    return CONVERSION_CONFIG.standardResponseNeutral
  } else if (responseTimeHours <= 48) {
    return CONVERSION_CONFIG.slowResponsePenalty
  } else {
    return CONVERSION_CONFIG.verySlowResponsePenalty
  }
}

/**
 * Calculate value-based adjustment
 */
export function calculateValueAdjustment(estimatedValue?: number): number {
  if (!estimatedValue) return 0

  let adjustment = 0

  if (estimatedValue < 5000) {
    adjustment += CONVERSION_CONFIG.lowValuePenalty
  } else if (estimatedValue > 50000) {
    adjustment += CONVERSION_CONFIG.highValueBonus
    
    if (estimatedValue > 100000) {
      adjustment += CONVERSION_CONFIG.veryHighValueBonus
    }
  }

  return adjustment
}

/**
 * Calculate source quality adjustment
 */
export function calculateSourceAdjustment(source: string): number {
  return CONVERSION_CONFIG.sourceFactors[source as keyof typeof CONVERSION_CONFIG.sourceFactors] || 0
}

/**
 * Calculate urgency adjustment
 */
export function calculateUrgencyAdjustment(urgency: string): number {
  return CONVERSION_CONFIG.urgencyFactors[urgency as keyof typeof CONVERSION_CONFIG.urgencyFactors] || 0
}

/**
 * Calculate barrister performance adjustment
 */
export function calculateBarristerPerformanceAdjustment(
  barrister?: Barrister, 
  enquiry?: Enquiry,
  history?: BarristerHistoryData
): number {
  if (!barrister || !history) return 0

  let adjustment = 0

  // Overall conversion rate vs industry average
  if (history.totalEnquiries > 0) {
    const barristerConversionRate = history.successfulConversions / history.totalEnquiries
    const rateAdjustment = (barristerConversionRate - CONVERSION_CONFIG.baseProbability) * 0.2
    adjustment += Math.max(-0.15, Math.min(0.15, rateAdjustment))
  }

  // Practice area specific performance
  if (enquiry?.practice_area && history.practiceAreaConversions.has(enquiry.practice_area)) {
    const practiceAreaConversions = history.practiceAreaConversions.get(enquiry.practice_area) || 0
    if (practiceAreaConversions > 2) { // Sufficient data
      adjustment += practiceAreaConversions > 0.7 ? 0.1 : practiceAreaConversions < 0.3 ? -0.1 : 0
    }
  }

  // Engagement score factor
  const engagementScore = barrister.engagement_score || 50
  if (engagementScore > 80) {
    adjustment += 0.1
  } else if (engagementScore < 40) {
    adjustment -= 0.1
  }

  return adjustment
}

/**
 * Calculate practice area adjustment
 */
export function calculatePracticeAreaAdjustment(practiceArea?: string, stats?: PracticeAreaStats): number {
  if (!practiceArea || !stats) return 0

  let adjustment = 0

  // Practice area conversion rate vs average
  const rateAdjustment = (stats.conversionRate - CONVERSION_CONFIG.baseProbability) * 0.1
  adjustment += Math.max(-0.1, Math.min(0.1, rateAdjustment))

  // Market competitiveness factor
  const competitivenessFactors = {
    'Low': 0.05,    // Less competitive = higher conversion
    'Medium': 0.0,  // Neutral
    'High': -0.05   // Highly competitive = lower conversion
  }
  adjustment += competitivenessFactors[stats.competitiveness]

  // Seasonality factor
  adjustment += Math.max(-0.05, Math.min(0.05, stats.seasonalityFactor))

  return adjustment
}

/**
 * Calculate seasonality adjustment
 */
export function calculateSeasonalityAdjustment(enquiryDate: Date, seasonality?: SeasonalityData): number {
  if (!seasonality) return 0

  let adjustment = 0

  // Month-based seasonality
  adjustment += Math.max(-0.05, Math.min(0.05, seasonality.currentMonthFactor))

  // Day of week factor
  adjustment += Math.max(-0.03, Math.min(0.03, seasonality.dayOfWeekFactor))

  // Time of day factor (business hours vs evening/weekend)
  adjustment += Math.max(-0.03, Math.min(0.03, seasonality.timeOfDayFactor))

  // Market conditions
  const marketFactors = {
    'Excellent': 0.05,
    'Good': 0.02,
    'Fair': 0.0,
    'Poor': -0.05
  }
  adjustment += marketFactors[seasonality.marketConditions]

  return adjustment
}

/**
 * Calculate confidence level and score
 */
function calculateConfidence(input: ConversionPredictionInput): {
  confidenceLevel: 'High' | 'Medium' | 'Low' | 'Very Low'
  confidenceScore: number
  similarCases: number
} {
  const { historicalData } = input
  
  // Count similar historical cases
  const similarCases = historicalData.clientHistory.totalEnquiries + 
                      historicalData.barristerHistory.totalEnquiries +
                      historicalData.practiceAreaStats.totalEnquiries

  let confidenceScore = 50 // Base confidence

  // Historical data availability
  if (similarCases >= CONVERSION_CONFIG.highConfidenceThreshold) {
    confidenceScore += 30
  } else if (similarCases >= CONVERSION_CONFIG.mediumConfidenceThreshold) {
    confidenceScore += 20
  } else if (similarCases >= CONVERSION_CONFIG.lowConfidenceThreshold) {
    confidenceScore += 10
  } else {
    confidenceScore -= 20
  }

  // Data quality factors
  if (input.client && historicalData.clientHistory.totalEnquiries > 0) {
    confidenceScore += 15
  }

  if (input.assignedBarrister && historicalData.barristerHistory.totalEnquiries > 5) {
    confidenceScore += 10
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore))

  let confidenceLevel: 'High' | 'Medium' | 'Low' | 'Very Low'
  if (confidenceScore >= 80) {
    confidenceLevel = 'High'
  } else if (confidenceScore >= 60) {
    confidenceLevel = 'Medium'
  } else if (confidenceScore >= 40) {
    confidenceLevel = 'Low'
  } else {
    confidenceLevel = 'Very Low'
  }

  return { confidenceLevel, confidenceScore, similarCases }
}

/**
 * Identify risk factors
 */
function identifyRiskFactors(input: ConversionPredictionInput, totalAdjustment: number): string[] {
  const risks: string[] = []
  const { enquiry, client, historicalData } = input

  if (totalAdjustment < -0.1) {
    risks.push('Multiple negative factors present')
  }

  if (enquiry.response_time_hours && enquiry.response_time_hours > 24) {
    risks.push('Delayed response may reduce conversion likelihood')
  }

  if (enquiry.source === 'Website') {
    risks.push('Website enquiries typically have lower conversion rates')
  }

  if (client && historicalData.clientHistory.paymentHistory === 'Poor') {
    risks.push('Client has poor payment history')
  }

  if ((enquiry.estimated_value || 0) < 5000) {
    risks.push('Low-value matters have reduced conversion probability')
  }

  if (historicalData.practiceAreaStats.competitiveness === 'High') {
    risks.push('Highly competitive practice area')
  }

  return risks
}

/**
 * Identify success factors
 */
function identifySuccessFactors(input: ConversionPredictionInput, totalAdjustment: number): string[] {
  const factors: string[] = []
  const { enquiry, client, assignedBarrister, historicalData } = input

  if (totalAdjustment > 0.1) {
    factors.push('Multiple positive factors present')
  }

  if (client && historicalData.clientHistory.totalEnquiries > 1) {
    factors.push('Existing client relationship')
  }

  if (enquiry.response_time_hours && enquiry.response_time_hours <= 4) {
    factors.push('Fast response time')
  }

  if (enquiry.source === 'Referral') {
    factors.push('Referral source indicates higher quality leads')
  }

  if ((enquiry.estimated_value || 0) > 50000) {
    factors.push('High-value matter increases conversion likelihood')
  }

  if (assignedBarrister && (assignedBarrister.engagement_score || 0) > 80) {
    factors.push('High-performing barrister assigned')
  }

  if (enquiry.urgency === 'Immediate') {
    factors.push('Urgent matters have higher conversion rates')
  }

  return factors
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  input: ConversionPredictionInput, 
  probability: number, 
  riskFactors: string[]
): string[] {
  const recommendations: string[] = []

  if (probability < 0.3) {
    recommendations.push('Consider additional follow-up or value proposition clarification')
  }

  if (riskFactors.some(risk => risk.includes('response'))) {
    recommendations.push('Prioritize rapid response for future enquiries')
  }

  if (input.enquiry.estimated_value && input.enquiry.estimated_value > 100000 && probability < 0.6) {
    recommendations.push('High-value matter with moderate conversion probability - consider senior barrister involvement')
  }

  if (riskFactors.some(risk => risk.includes('payment'))) {
    recommendations.push('Consider payment terms discussion early in the process')
  }

  if (probability > 0.7) {
    recommendations.push('High conversion probability - ensure resource allocation for likely instruction')
  }

  return recommendations
}

/**
 * Calculate historical benchmark
 */
function calculateHistoricalBenchmark(input: ConversionPredictionInput): number {
  const { historicalData } = input
  
  // Weight different historical sources
  const practiceAreaRate = historicalData.practiceAreaStats.conversionRate * 0.4
  const barristerRate = historicalData.barristerHistory.totalEnquiries > 0 
    ? (historicalData.barristerHistory.successfulConversions / historicalData.barristerHistory.totalEnquiries) * 0.3
    : CONVERSION_CONFIG.baseProbability * 0.3
  
  const clientRate = historicalData.clientHistory.totalEnquiries > 0
    ? (historicalData.clientHistory.successfulConversions / historicalData.clientHistory.totalEnquiries) * 0.2
    : CONVERSION_CONFIG.baseProbability * 0.2

  const baseRate = CONVERSION_CONFIG.baseProbability * 0.1

  return practiceAreaRate + barristerRate + clientRate + baseRate
}