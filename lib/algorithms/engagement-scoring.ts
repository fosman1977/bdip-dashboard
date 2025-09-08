/**
 * Barrister Engagement Scoring Algorithm
 * 
 * Calculates a comprehensive engagement score for barristers based on:
 * - Response time (30% weight): Speed of initial response to enquiries
 * - Conversion rate (40% weight): Success rate in winning instructions
 * - Client satisfaction (20% weight): Average client rating (1-5 scale)
 * - Revenue generated (10% weight): Total monetary contribution
 * 
 * Score range: 0-100 (higher is better)
 * Used for: Performance tracking, enquiry routing, ranking displays
 */

import { EngagementMetrics, Barrister } from '../../types'

// Algorithm configuration constants
export const ENGAGEMENT_WEIGHTS = {
  responseTime: 0.3,
  conversionRate: 0.4,
  clientSatisfaction: 0.2,
  revenueGenerated: 0.1
} as const

export const SCORING_CONFIG = {
  // Response time scoring: penalize 4 points per hour delay
  responseTimePenalty: 4,
  maxResponseScore: 100,
  
  // Revenue scoring: £1000 = 1 point, capped at 100 points
  revenuePerPoint: 1000,
  maxRevenueScore: 100,
  
  // Satisfaction scoring: 1-5 scale converted to 0-100 scale
  satisfactionMultiplier: 20,
  
  // Minimum data requirements for reliable scoring
  minEnquiriesForScore: 3,
  minRevenueForScore: 1000
} as const

export interface EngagementScoreResult {
  totalScore: number
  breakdown: {
    responseTime: {
      score: number
      weight: number
      contribution: number
    }
    conversionRate: {
      score: number
      weight: number
      contribution: number
    }
    clientSatisfaction: {
      score: number
      weight: number
      contribution: number
    }
    revenueGenerated: {
      score: number
      weight: number
      contribution: number
    }
  }
  isReliable: boolean
  dataQuality: {
    hasMinimumData: boolean
    enquiryCount: number
    missingMetrics: string[]
  }
}

export interface BarristerMetricsInput {
  barristerId: string
  totalEnquiries: number
  totalResponseTime: number // Total hours across all enquiries
  successfulConversions: number
  totalClientRatings: number
  clientRatingCount: number
  totalRevenue: number
  periodStart: Date
  periodEnd: Date
}

/**
 * Calculate engagement score for a single barrister
 * 
 * @param metrics - Raw performance metrics for the barrister
 * @returns Detailed engagement score with breakdown and quality indicators
 */
export function calculateEngagementScore(metrics: EngagementMetrics): EngagementScoreResult {
  // Validate input metrics
  if (!isValidMetrics(metrics)) {
    throw new Error('Invalid metrics provided: all values must be non-negative numbers')
  }

  // Calculate individual component scores
  const responseScore = calculateResponseScore(metrics.responseTime)
  const conversionScore = calculateConversionScore(metrics.conversionRate)
  const satisfactionScore = calculateSatisfactionScore(metrics.clientSatisfaction)
  const revenueScore = calculateRevenueScore(metrics.revenueGenerated)

  // Calculate weighted contributions
  const responseContribution = responseScore * ENGAGEMENT_WEIGHTS.responseTime
  const conversionContribution = conversionScore * ENGAGEMENT_WEIGHTS.conversionRate
  const satisfactionContribution = satisfactionScore * ENGAGEMENT_WEIGHTS.clientSatisfaction
  const revenueContribution = revenueScore * ENGAGEMENT_WEIGHTS.revenueGenerated

  // Calculate total score
  const totalScore = Math.round(
    responseContribution + 
    conversionContribution + 
    satisfactionContribution + 
    revenueContribution
  )

  // Assess data quality
  const dataQuality = assessDataQuality(metrics)

  return {
    totalScore,
    breakdown: {
      responseTime: {
        score: responseScore,
        weight: ENGAGEMENT_WEIGHTS.responseTime,
        contribution: responseContribution
      },
      conversionRate: {
        score: conversionScore,
        weight: ENGAGEMENT_WEIGHTS.conversionRate,
        contribution: conversionContribution
      },
      clientSatisfaction: {
        score: satisfactionScore,
        weight: ENGAGEMENT_WEIGHTS.clientSatisfaction,
        contribution: satisfactionContribution
      },
      revenueGenerated: {
        score: revenueScore,
        weight: ENGAGEMENT_WEIGHTS.revenueGenerated,
        contribution: revenueContribution
      }
    },
    isReliable: dataQuality.hasMinimumData && dataQuality.missingMetrics.length === 0,
    dataQuality
  }
}

/**
 * Calculate response time score (0-100)
 * Faster responses get higher scores with diminishing penalty for delays
 */
export function calculateResponseScore(responseTimeHours: number): number {
  if (responseTimeHours < 0) return 0
  
  // Score decreases by 4 points per hour, minimum 0
  const score = Math.max(0, SCORING_CONFIG.maxResponseScore - (responseTimeHours * SCORING_CONFIG.responseTimePenalty))
  return Math.round(score)
}

/**
 * Calculate conversion rate score (0-100)
 * Direct percentage conversion with validation
 */
export function calculateConversionScore(conversionRate: number): number {
  if (conversionRate < 0 || conversionRate > 1) {
    throw new Error('Conversion rate must be between 0 and 1')
  }
  
  return Math.round(conversionRate * 100)
}

/**
 * Calculate client satisfaction score (0-100)
 * Converts 1-5 rating scale to 0-100 scale
 */
export function calculateSatisfactionScore(clientSatisfaction: number): number {
  if (clientSatisfaction < 1 || clientSatisfaction > 5) {
    throw new Error('Client satisfaction must be between 1 and 5')
  }
  
  return Math.round(clientSatisfaction * SCORING_CONFIG.satisfactionMultiplier)
}

/**
 * Calculate revenue score (0-100)
 * £1000 = 1 point, capped at maximum score
 */
export function calculateRevenueScore(revenueGenerated: number): number {
  if (revenueGenerated < 0) return 0
  
  const score = Math.min(
    SCORING_CONFIG.maxRevenueScore, 
    revenueGenerated / SCORING_CONFIG.revenuePerPoint
  )
  return Math.round(score)
}

/**
 * Calculate engagement score from raw barrister data
 * Handles data aggregation and validation
 */
export function calculateEngagementScoreFromData(input: BarristerMetricsInput): EngagementScoreResult {
  // Validate raw input data first
  if (!isValidBarristerInput(input)) {
    throw new Error('Invalid input data: all values must be non-negative numbers and logically consistent')
  }

  const {
    totalEnquiries,
    totalResponseTime,
    successfulConversions,
    totalClientRatings,
    clientRatingCount,
    totalRevenue
  } = input

  // Calculate derived metrics with bounds checking
  const avgResponseTime = totalEnquiries > 0 ? Math.max(0, totalResponseTime / totalEnquiries) : 0
  const conversionRate = totalEnquiries > 0 ? Math.min(1, Math.max(0, successfulConversions / totalEnquiries)) : 0
  const avgSatisfaction = clientRatingCount > 0 ? 
    Math.min(5, Math.max(1, totalClientRatings / clientRatingCount)) : 3 // Default to neutral

  const metrics: EngagementMetrics = {
    responseTime: avgResponseTime,
    conversionRate,
    clientSatisfaction: avgSatisfaction,
    revenueGenerated: Math.max(0, totalRevenue)
  }

  const result = calculateEngagementScore(metrics)
  
  // Override data quality assessment with actual enquiry count
  result.dataQuality.enquiryCount = totalEnquiries
  result.dataQuality.hasMinimumData = totalEnquiries >= SCORING_CONFIG.minEnquiriesForScore

  return result
}

/**
 * Batch calculate engagement scores for multiple barristers
 * Optimized for performance with large datasets
 */
export function calculateBatchEngagementScores(
  inputs: BarristerMetricsInput[]
): Map<string, EngagementScoreResult> {
  const results = new Map<string, EngagementScoreResult>()
  
  for (const input of inputs) {
    try {
      const score = calculateEngagementScoreFromData(input)
      results.set(input.barristerId, score)
    } catch (error) {
      // Log error but continue processing other barristers
      console.error(`Error calculating engagement score for barrister ${input.barristerId}:`, error)
    }
  }
  
  return results
}

/**
 * Update barrister engagement score in database format
 * Returns score suitable for database storage
 */
export function getEngagementScoreForStorage(result: EngagementScoreResult): number {
  return result.totalScore
}

/**
 * Validate metrics input
 */
function isValidMetrics(metrics: EngagementMetrics): boolean {
  return (
    typeof metrics.responseTime === 'number' && metrics.responseTime >= 0 &&
    typeof metrics.conversionRate === 'number' && metrics.conversionRate >= 0 && metrics.conversionRate <= 1 &&
    typeof metrics.clientSatisfaction === 'number' && metrics.clientSatisfaction >= 1 && metrics.clientSatisfaction <= 5 &&
    typeof metrics.revenueGenerated === 'number' && metrics.revenueGenerated >= 0
  )
}

/**
 * Validate raw barrister input data
 */
function isValidBarristerInput(input: BarristerMetricsInput): boolean {
  // Basic type and range checks
  if (typeof input.totalEnquiries !== 'number' || input.totalEnquiries < 0) return false
  if (typeof input.totalResponseTime !== 'number' || input.totalResponseTime < 0) return false
  if (typeof input.successfulConversions !== 'number' || input.successfulConversions < 0) return false
  if (typeof input.totalClientRatings !== 'number' || input.totalClientRatings < 0) return false
  if (typeof input.clientRatingCount !== 'number' || input.clientRatingCount < 0) return false
  if (typeof input.totalRevenue !== 'number' || input.totalRevenue < 0) return false
  
  // Logical consistency checks
  if (input.successfulConversions > input.totalEnquiries) return false
  if (input.clientRatingCount > 0 && input.totalClientRatings > (input.clientRatingCount * 5)) return false
  
  return true
}

/**
 * Assess data quality and reliability
 */
function assessDataQuality(metrics: EngagementMetrics): EngagementScoreResult['dataQuality'] {
  const missingMetrics: string[] = []
  
  if (metrics.responseTime === 0) missingMetrics.push('responseTime')
  if (metrics.conversionRate === 0) missingMetrics.push('conversionRate')
  if (metrics.clientSatisfaction === 3) missingMetrics.push('clientSatisfaction') // Default neutral rating
  if (metrics.revenueGenerated < SCORING_CONFIG.minRevenueForScore) missingMetrics.push('revenueGenerated')
  
  return {
    hasMinimumData: true, // Will be overridden by actual data in calculateEngagementScoreFromData
    enquiryCount: 0, // Will be overridden
    missingMetrics
  }
}

/**
 * Get human-readable explanation of engagement score
 */
export function explainEngagementScore(result: EngagementScoreResult): string {
  const explanations = [
    `Response Time: ${result.breakdown.responseTime.score}/100 (${result.breakdown.responseTime.contribution.toFixed(1)} points)`,
    `Conversion Rate: ${result.breakdown.conversionRate.score}/100 (${result.breakdown.conversionRate.contribution.toFixed(1)} points)`,
    `Client Satisfaction: ${result.breakdown.clientSatisfaction.score}/100 (${result.breakdown.clientSatisfaction.contribution.toFixed(1)} points)`,
    `Revenue Generated: ${result.breakdown.revenueGenerated.score}/100 (${result.breakdown.revenueGenerated.contribution.toFixed(1)} points)`
  ]

  let explanation = `Total Engagement Score: ${result.totalScore}/100\n\nBreakdown:\n${explanations.join('\n')}`
  
  if (!result.isReliable) {
    explanation += `\n\nNote: Score reliability may be limited due to insufficient data (${result.dataQuality.enquiryCount} enquiries).`
  }

  if (result.dataQuality.missingMetrics.length > 0) {
    explanation += `\nMissing or default metrics: ${result.dataQuality.missingMetrics.join(', ')}`
  }

  return explanation
}