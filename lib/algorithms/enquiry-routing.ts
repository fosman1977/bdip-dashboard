/**
 * Enquiry Routing Algorithm
 * 
 * Intelligently assigns enquiries to the most suitable barristers based on:
 * - Practice area expertise matching
 * - Seniority requirements for complexity and value
 * - Current workload balancing
 * - Historical engagement scores
 * - Real-time availability
 * 
 * Business Rules:
 * - Complex matters: exclude Pupils
 * - High value (>£100k): prefer Senior barristers and KCs
 * - Very high value (>£500k): require KC approval
 * - Urgent matters: prioritize available barristers
 * - Practice area match is mandatory
 */

import { Barrister, Enquiry, RoutingCriteria } from '../../types'
import { calculateEngagementScore, EngagementScoreResult } from './engagement-scoring'

// Routing configuration constants
export const ROUTING_CONFIG = {
  // Value thresholds for seniority requirements
  highValueThreshold: 100000, // £100k
  veryHighValueThreshold: 500000, // £500k
  
  // Workload capacity limits (percentage)
  maxWorkloadCapacity: 90,
  urgentWorkloadCapacity: 95,
  
  // Scoring weights for routing decisions
  engagementScoreWeight: 0.6,
  workloadBalanceWeight: 0.3,
  seniorityBonusWeight: 0.1,
  
  // Practice area matching requirements
  exactMatchRequired: true,
  partialMatchThreshold: 0.7,
  
  // Minimum engagement score for high-value matters
  minEngagementForHighValue: 70
} as const

export const SENIORITY_VALUES = {
  'Pupil': 1,
  'Junior': 2,
  'Middle': 3,
  'Senior': 4,
  'KC': 5
} as const

export interface RoutingCandidate {
  barrister: Barrister
  suitabilityScore: number
  breakdown: {
    practiceAreaMatch: number
    seniorityMatch: number
    workloadScore: number
    engagementScore: number
    urgencyBonus: number
  }
  eligibility: {
    meetsPracticeArea: boolean
    meetsSeniorityRequirement: boolean
    hasCapacity: boolean
    meetsValueRequirement: boolean
  }
  warnings: string[]
  recommendationReason: string
}

export interface RoutingResult {
  recommendedBarrister: RoutingCandidate | null
  alternativeCandidates: RoutingCandidate[]
  routingMetadata: {
    totalCandidates: number
    eligibleCandidates: number
    routingCriteria: RoutingCriteria
    timestamp: Date
    algorithmVersion: string
  }
  warnings: string[]
}

export interface BarristerWorkload {
  barristerId: string
  currentWorkload: number
  maxWorkload: number
  utilizationRate: number
  availableCapacity: number
}

/**
 * Main enquiry routing function
 * Routes an enquiry to the most suitable available barrister
 */
export function routeEnquiry(
  enquiry: Enquiry,
  availableBarristers: Barrister[],
  workloads: Map<string, BarristerWorkload>
): RoutingResult {
  const criteria = extractRoutingCriteria(enquiry)
  const timestamp = new Date()

  // Filter and score candidates
  const candidates = availableBarristers
    .map(barrister => evaluateCandidate(barrister, criteria, workloads.get(barrister.id)))
    .filter(candidate => candidate !== null) as RoutingCandidate[]

  // Sort by suitability score (descending)
  candidates.sort((a, b) => b.suitabilityScore - a.suitabilityScore)

  // Find the best eligible candidate
  const eligibleCandidates = candidates.filter(candidate => 
    candidate.eligibility.meetsPracticeArea &&
    candidate.eligibility.meetsSeniorityRequirement &&
    candidate.eligibility.hasCapacity &&
    candidate.eligibility.meetsValueRequirement
  )

  const recommendedBarrister = eligibleCandidates[0] || null
  const alternatives = eligibleCandidates.slice(1, 5) // Top 4 alternatives

  // Generate warnings
  const warnings = generateRoutingWarnings(enquiry, availableBarristers, eligibleCandidates)

  return {
    recommendedBarrister,
    alternativeCandidates: alternatives,
    routingMetadata: {
      totalCandidates: availableBarristers.length,
      eligibleCandidates: eligibleCandidates.length,
      routingCriteria: criteria,
      timestamp,
      algorithmVersion: '1.0.0'
    },
    warnings
  }
}

/**
 * Extract routing criteria from enquiry
 */
export function extractRoutingCriteria(enquiry: Enquiry): RoutingCriteria {
  const complexity = determineComplexity(enquiry)
  const value = enquiry.estimated_value || 0

  return {
    practiceArea: enquiry.practice_area || '',
    complexity,
    value,
    urgency: enquiry.urgency
  }
}

/**
 * Determine matter complexity based on description and value
 */
export function determineComplexity(enquiry: Enquiry): 'Simple' | 'Medium' | 'Complex' {
  const value = enquiry.estimated_value || 0
  const description = enquiry.description?.toLowerCase() || ''

  // High value typically means complex
  if (value > 100000) return 'Complex'

  // Keywords indicating complexity
  const complexKeywords = [
    'judicial review', 'human rights', 'appeal', 'tribunal',
    'international', 'regulatory', 'constitutional', 'fraud',
    'multi-party', 'class action', 'urgent injunction'
  ]

  const simpleKeywords = [
    'advice', 'opinion', 'consultation', 'review',
    'straightforward', 'standard', 'routine'
  ]

  if (complexKeywords.some(keyword => description.includes(keyword))) {
    return 'Complex'
  }

  if (simpleKeywords.some(keyword => description.includes(keyword)) && value < 10000) {
    return 'Simple'
  }

  return 'Medium'
}

/**
 * Evaluate a barrister's suitability for an enquiry
 */
export function evaluateCandidate(
  barrister: Barrister,
  criteria: RoutingCriteria,
  workload?: BarristerWorkload
): RoutingCandidate | null {
  if (!barrister.is_active) {
    return null // Skip inactive barristers
  }

  const practiceAreaMatch = calculatePracticeAreaMatch(barrister, criteria.practiceArea)
  const seniorityMatch = calculateSeniorityMatch(barrister, criteria)
  const workloadScore = calculateWorkloadScore(workload)
  const engagementScore = barrister.engagement_score || 0
  const urgencyBonus = calculateUrgencyBonus(barrister, criteria.urgency, workload)

  // Check eligibility
  const eligibility = {
    meetsPracticeArea: practiceAreaMatch >= (ROUTING_CONFIG.exactMatchRequired ? 1.0 : ROUTING_CONFIG.partialMatchThreshold),
    meetsSeniorityRequirement: checkSeniorityRequirement(barrister, criteria),
    hasCapacity: checkCapacity(workload, criteria.urgency),
    meetsValueRequirement: checkValueRequirement(barrister, criteria.value)
  }

  // Calculate weighted suitability score
  const suitabilityScore = calculateSuitabilityScore({
    practiceAreaMatch,
    seniorityMatch,
    workloadScore,
    engagementScore,
    urgencyBonus
  })

  const warnings = generateCandidateWarnings(barrister, criteria, workload, eligibility)
  const recommendationReason = generateRecommendationReason(barrister, criteria, eligibility, suitabilityScore)

  return {
    barrister,
    suitabilityScore,
    breakdown: {
      practiceAreaMatch,
      seniorityMatch,
      workloadScore,
      engagementScore,
      urgencyBonus
    },
    eligibility,
    warnings,
    recommendationReason
  }
}

/**
 * Calculate practice area matching score (0-1)
 */
export function calculatePracticeAreaMatch(barrister: Barrister, requiredArea: string): number {
  if (!requiredArea) return 1.0 // No requirement

  const normalizedRequired = requiredArea.toLowerCase().trim()
  const barristerAreas = barrister.practice_areas.map(area => area.toLowerCase().trim())

  // Exact match
  if (barristerAreas.includes(normalizedRequired)) {
    return 1.0
  }

  // Partial match based on keywords
  const requiredKeywords = normalizedRequired.split(/\s+/)
  let matchScore = 0

  for (const area of barristerAreas) {
    const areaKeywords = area.split(/\s+/)
    const commonKeywords = requiredKeywords.filter(keyword => 
      areaKeywords.some(areaKeyword => 
        areaKeyword.includes(keyword) || keyword.includes(areaKeyword)
      )
    )
    
    const partialScore = commonKeywords.length / requiredKeywords.length
    matchScore = Math.max(matchScore, partialScore)
  }

  return Math.min(1.0, matchScore)
}

/**
 * Calculate seniority matching score (0-1)
 */
export function calculateSeniorityMatch(barrister: Barrister, criteria: RoutingCriteria): number {
  const barristerLevel = SENIORITY_VALUES[barrister.seniority]
  const requiredLevel = getRequiredSeniorityLevel(criteria)
  
  if (barristerLevel >= requiredLevel) {
    // Bonus for higher seniority on complex/valuable matters
    const bonus = Math.min(0.2, (barristerLevel - requiredLevel) * 0.05)
    return Math.min(1.0, 0.8 + bonus)
  }

  // Penalty for insufficient seniority
  return Math.max(0, 0.5 - ((requiredLevel - barristerLevel) * 0.15))
}

/**
 * Calculate workload-based score (0-1)
 * Lower workload gets higher score
 */
export function calculateWorkloadScore(workload?: BarristerWorkload): number {
  if (!workload) return 0.5 // Default neutral score

  const utilizationRate = workload.utilizationRate
  
  if (utilizationRate <= 0.5) return 1.0 // Low utilization
  if (utilizationRate <= 0.7) return 0.8 // Moderate utilization
  if (utilizationRate <= 0.85) return 0.6 // High utilization
  if (utilizationRate <= 0.95) return 0.3 // Very high utilization
  return 0.1 // At capacity
}

/**
 * Calculate urgency bonus (0-0.2)
 */
export function calculateUrgencyBonus(
  barrister: Barrister,
  urgency: string,
  workload?: BarristerWorkload
): number {
  if (urgency !== 'Immediate') return 0

  if (!workload) return 0.05

  // Higher bonus for barristers with lower workload on urgent matters
  const utilizationRate = workload.utilizationRate
  if (utilizationRate <= 0.5) return 0.2
  if (utilizationRate <= 0.7) return 0.15
  if (utilizationRate <= 0.85) return 0.1
  return 0.05
}

/**
 * Calculate overall suitability score
 */
function calculateSuitabilityScore(scores: {
  practiceAreaMatch: number
  seniorityMatch: number
  workloadScore: number
  engagementScore: number
  urgencyBonus: number
}): number {
  const baseScore = (
    scores.practiceAreaMatch * 0.4 +
    scores.seniorityMatch * 0.2 +
    scores.workloadScore * ROUTING_CONFIG.workloadBalanceWeight +
    (scores.engagementScore / 100) * ROUTING_CONFIG.engagementScoreWeight
  )

  return Math.round((baseScore + scores.urgencyBonus) * 100)
}

/**
 * Determine required seniority level for criteria
 */
function getRequiredSeniorityLevel(criteria: RoutingCriteria): number {
  // Pupils cannot handle complex matters
  if (criteria.complexity === 'Complex') {
    return SENIORITY_VALUES.Junior
  }

  // High-value matters prefer senior barristers
  if (criteria.value > ROUTING_CONFIG.highValueThreshold) {
    return SENIORITY_VALUES.Senior
  }

  // Very high-value matters prefer KCs
  if (criteria.value > ROUTING_CONFIG.veryHighValueThreshold) {
    return SENIORITY_VALUES.KC
  }

  return SENIORITY_VALUES.Pupil // No minimum requirement
}

/**
 * Check seniority requirement
 */
function checkSeniorityRequirement(barrister: Barrister, criteria: RoutingCriteria): boolean {
  const barristerLevel = SENIORITY_VALUES[barrister.seniority]
  const requiredLevel = getRequiredSeniorityLevel(criteria)
  return barristerLevel >= requiredLevel
}

/**
 * Check capacity availability
 */
function checkCapacity(workload?: BarristerWorkload, urgency?: string): boolean {
  if (!workload) return true

  const capacity = urgency === 'Immediate' 
    ? ROUTING_CONFIG.urgentWorkloadCapacity 
    : ROUTING_CONFIG.maxWorkloadCapacity

  return workload.utilizationRate <= (capacity / 100)
}

/**
 * Check value-based requirements
 */
function checkValueRequirement(barrister: Barrister, value: number): boolean {
  // High-value matters require good engagement scores
  if (value > ROUTING_CONFIG.highValueThreshold) {
    return (barrister.engagement_score || 0) >= ROUTING_CONFIG.minEngagementForHighValue
  }

  return true
}

/**
 * Generate candidate-specific warnings
 */
function generateCandidateWarnings(
  barrister: Barrister,
  criteria: RoutingCriteria,
  workload?: BarristerWorkload,
  eligibility?: RoutingCandidate['eligibility']
): string[] {
  const warnings: string[] = []

  if (!eligibility?.meetsPracticeArea) {
    warnings.push('Limited expertise in required practice area')
  }

  if (!eligibility?.meetsSeniorityRequirement) {
    warnings.push('May lack sufficient seniority for matter complexity/value')
  }

  if (workload && workload.utilizationRate > 0.8) {
    warnings.push('Currently operating at high capacity')
  }

  if ((barrister.engagement_score || 0) < 50) {
    warnings.push('Below-average engagement score')
  }

  return warnings
}

/**
 * Generate routing warnings
 */
function generateRoutingWarnings(
  enquiry: Enquiry,
  availableBarristers: Barrister[],
  eligibleCandidates: RoutingCandidate[]
): string[] {
  const warnings: string[] = []

  if (eligibleCandidates.length === 0) {
    warnings.push('No fully eligible barristers found - manual assignment may be required')
  } else if (eligibleCandidates.length === 1) {
    warnings.push('Only one eligible barrister found - limited options for assignment')
  }

  if (enquiry.urgency === 'Immediate' && availableBarristers.every(b => (b.current_workload || 0) > 80)) {
    warnings.push('All barristers are at high capacity for urgent matter')
  }

  if ((enquiry.estimated_value || 0) > ROUTING_CONFIG.veryHighValueThreshold) {
    warnings.push('Very high-value matter may require additional approval')
  }

  return warnings
}

/**
 * Generate recommendation reason
 */
function generateRecommendationReason(
  barrister: Barrister,
  criteria: RoutingCriteria,
  eligibility: RoutingCandidate['eligibility'],
  score: number
): string {
  const reasons: string[] = []

  if (eligibility.meetsPracticeArea) {
    reasons.push('strong practice area match')
  }

  if (eligibility.meetsSeniorityRequirement && SENIORITY_VALUES[barrister.seniority] >= SENIORITY_VALUES.Senior) {
    reasons.push('appropriate seniority level')
  }

  if (eligibility.hasCapacity) {
    reasons.push('good availability')
  }

  if ((barrister.engagement_score || 0) >= 70) {
    reasons.push('high engagement score')
  }

  const baseReason = reasons.length > 0 
    ? `Recommended due to ${reasons.join(', ')}`
    : 'Best available option'

  return `${baseReason} (suitability score: ${score}/100)`
}

/**
 * Get routing recommendations for dashboard display
 */
export function getRoutingRecommendations(
  enquiry: Enquiry,
  routingResult: RoutingResult
): {
  primaryRecommendation: string
  alternativeOptions: string[]
  actionRequired: boolean
  priority: 'High' | 'Medium' | 'Low'
} {
  const { recommendedBarrister, alternativeCandidates, warnings } = routingResult

  let primaryRecommendation: string
  let actionRequired = false
  let priority: 'High' | 'Medium' | 'Low' = 'Medium'

  if (recommendedBarrister) {
    primaryRecommendation = `Assign to ${recommendedBarrister.barrister.name} - ${recommendedBarrister.recommendationReason}`
  } else {
    primaryRecommendation = 'No suitable barrister found - manual review required'
    actionRequired = true
    priority = 'High'
  }

  if (enquiry.urgency === 'Immediate') {
    priority = 'High'
  }

  if (warnings.length > 0) {
    actionRequired = true
    priority = priority === 'Low' ? 'Medium' : priority
  }

  const alternativeOptions = alternativeCandidates
    .slice(0, 3)
    .map(candidate => `${candidate.barrister.name} (score: ${candidate.suitabilityScore})`)

  return {
    primaryRecommendation,
    alternativeOptions,
    actionRequired,
    priority
  }
}