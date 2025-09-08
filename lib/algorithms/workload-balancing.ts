/**
 * Workload Balancing System
 * 
 * Manages fair distribution of enquiries and tasks across barristers and clerks:
 * - Real-time capacity tracking and optimization
 * - Skill-based assignment with expertise matching
 * - Fair distribution algorithms to prevent overload
 * - Priority queuing for urgent matters
 * - Dynamic load balancing with overflow handling
 * - Performance-based workload adjustments
 * 
 * Key Features:
 * - Prevents burnout through intelligent capacity management
 * - Ensures quality maintenance during peak periods
 * - Adapts to individual performance patterns
 * - Handles emergency overflow situations
 */

import { Barrister, Clerk, Enquiry, Task } from '../../types'

// Workload balancing configuration
export const WORKLOAD_CONFIG = {
  // Capacity thresholds (percentage of maximum workload)
  optimalCapacity: 75,
  warningCapacity: 85,
  maxCapacity: 95,
  emergencyCapacity: 100,
  
  // Workload distribution weights
  fairnessWeight: 0.4,        // Equal distribution preference
  expertiseWeight: 0.3,       // Skill matching importance  
  performanceWeight: 0.2,     // Quality-based assignment
  urgencyWeight: 0.1,         // Time-sensitive priority
  
  // Time-based factors
  dailyWorkloadCap: 8,        // Hours per day
  weeklyWorkloadCap: 40,      // Hours per week
  overtimeThreshold: 6,       // Hours before overtime
  
  // Quality thresholds
  minEngagementScore: 60,     // Minimum score for complex matters
  seniorityRequirements: {
    'Complex': ['Middle', 'Senior', 'KC'],
    'High-Value': ['Senior', 'KC'],
    'Urgent': ['Junior', 'Middle', 'Senior', 'KC']
  },
  
  // Load balancing parameters
  rebalanceThreshold: 20,     // Percentage difference triggering rebalance
  maxAssignmentsPerHour: 5,   // Rate limiting for quality
  coolingOffPeriod: 2,        // Hours between major assignments
  
  // Performance adjustments
  highPerformerBonus: 0.1,    // Extra capacity for top performers
  lowPerformerReduction: 0.15, // Reduced capacity for struggling barristers
  newBarristerReduction: 0.2  // Reduced initial capacity for new members
} as const

export interface WorkloadMetrics {
  barristerId: string
  currentHours: number
  maxHours: number
  utilizationRate: number
  dailyHours: number
  weeklyHours: number
  qualityScore: number
  activeEnquiries: number
  activeTasks: number
  lastAssignment: Date | null
  isAvailable: boolean
  specializations: string[]
}

export interface WorkloadAssignment {
  recommendedAssignee: string
  assignmentType: 'Barrister' | 'Clerk'
  confidence: number
  reasoning: string
  alternativeOptions: Array<{
    id: string
    name: string
    utilizationRate: number
    suitabilityScore: number
  }>
  workloadImpact: {
    beforeUtilization: number
    afterUtilization: number
    capacityChange: number
  }
  warnings: string[]
}

export interface CapacityPlan {
  currentUtilization: number
  projectedUtilization: number
  availableCapacity: number
  bottlenecks: Array<{
    resource: string
    severity: 'Low' | 'Medium' | 'High' | 'Critical'
    impact: string
    recommendation: string
  }>
  rebalanceRecommendations: Array<{
    action: 'Redistribute' | 'Hire' | 'Outsource' | 'Defer'
    priority: 'High' | 'Medium' | 'Low'
    description: string
    estimatedImpact: number
  }>
}

export interface WorkloadDistribution {
  barristers: Array<{
    id: string
    name: string
    currentWorkload: number
    optimalWorkload: number
    variance: number
    recommendations: string[]
  }>
  clerks: Array<{
    id: string
    name: string
    currentWorkload: number
    optimalWorkload: number
    variance: number
    recommendations: string[]
  }>
  overallBalance: number // 0-100 (100 = perfectly balanced)
  rebalanceRequired: boolean
}

/**
 * Calculate optimal workload assignment for an enquiry
 */
export function calculateWorkloadAssignment(
  enquiry: Enquiry,
  availableBarristers: Barrister[],
  availableClerks: Clerk[],
  currentWorkloads: Map<string, WorkloadMetrics>
): WorkloadAssignment {
  // Determine if this requires a barrister or clerk assignment
  const requiresBarrister = isBarristerRequired(enquiry)
  
  if (requiresBarrister) {
    return assignToBarrister(enquiry, availableBarristers, currentWorkloads)
  } else {
    return assignToClerk(enquiry, availableClerks, currentWorkloads)
  }
}

/**
 * Assign enquiry to optimal barrister
 */
export function assignToBarrister(
  enquiry: Enquiry,
  availableBarristers: Barrister[],
  currentWorkloads: Map<string, WorkloadMetrics>
): WorkloadAssignment {
  const candidates = availableBarristers
    .map(barrister => evaluateBarristerWorkload(barrister, enquiry, currentWorkloads.get(barrister.id)))
    .filter(candidate => candidate !== null)
    .sort((a, b) => (b?.suitabilityScore || 0) - (a?.suitabilityScore || 0))

  const recommended = candidates[0]
  
  if (!recommended) {
    return {
      recommendedAssignee: '',
      assignmentType: 'Barrister',
      confidence: 0,
      reasoning: 'No suitable barristers available',
      alternativeOptions: [],
      workloadImpact: {
        beforeUtilization: 0,
        afterUtilization: 0,
        capacityChange: 0
      },
      warnings: ['No barristers have available capacity']
    }
  }

  const workload = currentWorkloads.get(recommended.barristerId)
  const estimatedHours = estimateEnquiryHours(enquiry)
  
  return {
    recommendedAssignee: recommended.barristerId,
    assignmentType: 'Barrister',
    confidence: Math.round(recommended.suitabilityScore),
    reasoning: recommended.reasoning,
    alternativeOptions: candidates.slice(1, 4).map(c => ({
      id: c.barristerId,
      name: c.barristerName,
      utilizationRate: c.utilizationRate,
      suitabilityScore: c.suitabilityScore
    })),
    workloadImpact: {
      beforeUtilization: workload?.utilizationRate || 0,
      afterUtilization: calculateProjectedUtilization(workload, estimatedHours),
      capacityChange: (estimatedHours / (workload?.maxHours || 40)) * 100
    },
    warnings: recommended.warnings
  }
}

/**
 * Assign enquiry to optimal clerk
 */
export function assignToClerk(
  enquiry: Enquiry,
  availableClerks: Clerk[],
  currentWorkloads: Map<string, WorkloadMetrics>
): WorkloadAssignment {
  const candidates = availableClerks
    .map(clerk => evaluateClerkWorkload(clerk, enquiry, currentWorkloads.get(clerk.id)))
    .filter(candidate => candidate !== null)
    .sort((a, b) => (b?.suitabilityScore || 0) - (a?.suitabilityScore || 0))

  const recommended = candidates[0]
  
  if (!recommended) {
    return {
      recommendedAssignee: '',
      assignmentType: 'Clerk',
      confidence: 0,
      reasoning: 'No suitable clerks available',
      alternativeOptions: [],
      workloadImpact: {
        beforeUtilization: 0,
        afterUtilization: 0,
        capacityChange: 0
      },
      warnings: ['All clerks are at capacity']
    }
  }

  const workload = currentWorkloads.get(recommended.clerkId)
  const estimatedHours = estimateEnquiryHours(enquiry) * 0.3 // Clerks typically handle 30% of enquiry work
  
  return {
    recommendedAssignee: recommended.clerkId,
    assignmentType: 'Clerk',
    confidence: Math.round(recommended.suitabilityScore),
    reasoning: recommended.reasoning,
    alternativeOptions: candidates.slice(1, 4).map(c => ({
      id: c.clerkId,
      name: c.clerkName,
      utilizationRate: c.utilizationRate,
      suitabilityScore: c.suitabilityScore
    })),
    workloadImpact: {
      beforeUtilization: workload?.utilizationRate || 0,
      afterUtilization: calculateProjectedUtilization(workload, estimatedHours),
      capacityChange: (estimatedHours / (workload?.maxHours || 40)) * 100
    },
    warnings: recommended.warnings
  }
}

interface BarristerCandidate {
  barristerId: string
  barristerName: string
  suitabilityScore: number
  utilizationRate: number
  reasoning: string
  warnings: string[]
}

interface ClerkCandidate {
  clerkId: string
  clerkName: string
  suitabilityScore: number
  utilizationRate: number
  reasoning: string
  warnings: string[]
}

/**
 * Evaluate barrister suitability for workload assignment
 */
function evaluateBarristerWorkload(
  barrister: Barrister,
  enquiry: Enquiry,
  workload?: WorkloadMetrics
): BarristerCandidate | null {
  if (!barrister.is_active || !workload?.isAvailable) {
    return null
  }

  const warnings: string[] = []
  let suitabilityScore = 0

  // Capacity assessment
  const capacityScore = calculateCapacityScore(workload.utilizationRate)
  suitabilityScore += capacityScore * WORKLOAD_CONFIG.fairnessWeight

  // Expertise matching
  const expertiseScore = calculateExpertiseMatch(barrister, enquiry)
  suitabilityScore += expertiseScore * WORKLOAD_CONFIG.expertiseWeight

  // Performance factor
  const performanceScore = (barrister.engagement_score || 50) / 100
  suitabilityScore += performanceScore * WORKLOAD_CONFIG.performanceWeight

  // Urgency handling ability
  const urgencyScore = calculateUrgencyHandlingScore(barrister, enquiry, workload)
  suitabilityScore += urgencyScore * WORKLOAD_CONFIG.urgencyWeight

  // Check for warnings
  if (workload.utilizationRate > WORKLOAD_CONFIG.warningCapacity) {
    warnings.push('Operating at high capacity')
  }

  if (workload.lastAssignment && isWithinCoolingOffPeriod(workload.lastAssignment)) {
    warnings.push('Recently assigned - may need time to settle')
    suitabilityScore *= 0.9
  }

  if ((barrister.engagement_score || 0) < WORKLOAD_CONFIG.minEngagementScore && 
      isComplexMatter(enquiry)) {
    warnings.push('Below minimum engagement score for complex matters')
    suitabilityScore *= 0.8
  }

  const reasoning = generateAssignmentReasoning(
    barrister.name,
    capacityScore,
    expertiseScore,
    performanceScore,
    urgencyScore
  )

  return {
    barristerId: barrister.id,
    barristerName: barrister.name,
    suitabilityScore: Math.round(suitabilityScore * 100),
    utilizationRate: workload.utilizationRate,
    reasoning,
    warnings
  }
}

/**
 * Evaluate clerk suitability for workload assignment
 */
function evaluateClerkWorkload(
  clerk: Clerk,
  enquiry: Enquiry,
  workload?: WorkloadMetrics
): ClerkCandidate | null {
  if (!workload?.isAvailable) {
    return null
  }

  const warnings: string[] = []
  let suitabilityScore = 0

  // Capacity assessment (primary factor for clerks)
  const capacityScore = calculateCapacityScore(workload.utilizationRate)
  suitabilityScore += capacityScore * 0.6

  // Team matching
  const teamScore = calculateTeamMatch(clerk, enquiry)
  suitabilityScore += teamScore * 0.2

  // Experience factor
  const experienceScore = clerk.is_senior ? 0.9 : 0.7
  suitabilityScore += experienceScore * 0.2

  // Check for warnings
  if (workload.utilizationRate > WORKLOAD_CONFIG.warningCapacity) {
    warnings.push('Operating at high capacity')
  }

  if (workload.activeEnquiries > 10) {
    warnings.push('Managing high number of enquiries')
    suitabilityScore *= 0.95
  }

  const reasoning = `Recommended based on ${Math.round(capacityScore * 100)}% capacity availability and ${clerk.is_senior ? 'senior' : 'standard'} experience level`

  return {
    clerkId: clerk.id,
    clerkName: clerk.name,
    suitabilityScore: Math.round(suitabilityScore * 100),
    utilizationRate: workload.utilizationRate,
    reasoning,
    warnings
  }
}

/**
 * Generate comprehensive capacity planning analysis
 */
export function generateCapacityPlan(
  barristers: Barrister[],
  clerks: Clerk[],
  workloads: Map<string, WorkloadMetrics>,
  upcomingEnquiries: Enquiry[]
): CapacityPlan {
  const currentUtilization = calculateAverageUtilization(workloads)
  const projectedHours = upcomingEnquiries.reduce((sum, enquiry) => sum + estimateEnquiryHours(enquiry), 0)
  const totalCapacity = Array.from(workloads.values()).reduce((sum, w) => sum + w.maxHours, 0)
  const projectedUtilization = (Array.from(workloads.values()).reduce((sum, w) => sum + w.currentHours, 0) + projectedHours) / totalCapacity

  const bottlenecks = identifyBottlenecks(workloads, 0.85)
  const rebalanceRecommendations = generateRebalanceRecommendations(workloads, projectedUtilization)

  return {
    currentUtilization: Math.round(currentUtilization * 100),
    projectedUtilization: Math.round(projectedUtilization * 100),
    availableCapacity: Math.round((1 - currentUtilization) * totalCapacity),
    bottlenecks,
    rebalanceRecommendations
  }
}

/**
 * Calculate optimal workload distribution across team
 */
export function calculateOptimalDistribution(
  barristers: Barrister[],
  clerks: Clerk[],
  workloads: Map<string, WorkloadMetrics>
): WorkloadDistribution {
  const barristerAnalysis = analyzeBarristerDistribution(barristers, workloads)
  const clerkAnalysis = analyzeClerkDistribution(clerks, workloads)
  
  const overallVariance = [...barristerAnalysis, ...clerkAnalysis]
    .reduce((sum, person) => sum + Math.abs(person.variance), 0) / (barristers.length + clerks.length)
  
  const overallBalance = Math.max(0, 100 - overallVariance * 5) // Convert to 0-100 scale
  const rebalanceRequired = overallBalance < 80

  return {
    barristers: barristerAnalysis,
    clerks: clerkAnalysis,
    overallBalance: Math.round(overallBalance),
    rebalanceRequired
  }
}

/**
 * Helper function to determine if enquiry requires barrister assignment
 */
function isBarristerRequired(enquiry: Enquiry): boolean {
  const value = enquiry.estimated_value || 0
  const isComplex = isComplexMatter(enquiry)
  const isUrgent = enquiry.urgency === 'Immediate'

  return value > 10000 || isComplex || isUrgent
}

/**
 * Helper function to check if matter is complex
 */
function isComplexMatter(enquiry: Enquiry): boolean {
  const description = enquiry.description?.toLowerCase() || ''
  const complexKeywords = ['appeal', 'judicial review', 'human rights', 'constitutional', 'fraud']
  
  return complexKeywords.some(keyword => description.includes(keyword)) ||
         (enquiry.estimated_value || 0) > 100000
}

/**
 * Calculate capacity score (higher score = more available)
 */
function calculateCapacityScore(utilizationRate: number): number {
  if (utilizationRate <= 0.5) return 1.0
  if (utilizationRate <= 0.7) return 0.8
  if (utilizationRate <= 0.85) return 0.6
  if (utilizationRate <= 0.95) return 0.3
  return 0.1
}

/**
 * Calculate expertise match score
 */
function calculateExpertiseMatch(barrister: Barrister, enquiry: Enquiry): number {
  if (!enquiry.practice_area) return 0.5

  const practiceAreas = barrister.practice_areas.map(area => area.toLowerCase())
  const required = enquiry.practice_area.toLowerCase()

  return practiceAreas.includes(required) ? 1.0 : 
         practiceAreas.some(area => area.includes(required) || required.includes(area)) ? 0.7 : 0.3
}

/**
 * Calculate urgency handling score
 */
function calculateUrgencyHandlingScore(barrister: Barrister, enquiry: Enquiry, workload: WorkloadMetrics): number {
  if (enquiry.urgency !== 'Immediate') return 0.5

  // Senior barristers handle urgency better
  const seniorityBonus = barrister.seniority === 'KC' ? 0.3 : 
                        barrister.seniority === 'Senior' ? 0.2 : 
                        barrister.seniority === 'Middle' ? 0.1 : 0

  // Lower workload = better urgency handling
  const capacityBonus = workload.utilizationRate <= 0.5 ? 0.3 : 
                       workload.utilizationRate <= 0.7 ? 0.2 : 0.1

  return Math.min(1.0, 0.4 + seniorityBonus + capacityBonus)
}

/**
 * Calculate team matching for clerks
 */
function calculateTeamMatch(clerk: Clerk, enquiry: Enquiry): number {
  // Simple team matching - can be enhanced with practice area specializations
  return clerk.team ? 0.8 : 0.6
}

/**
 * Check if assignment is within cooling off period
 */
function isWithinCoolingOffPeriod(lastAssignment: Date): boolean {
  const now = new Date()
  const hoursDiff = (now.getTime() - lastAssignment.getTime()) / (1000 * 60 * 60)
  return hoursDiff < WORKLOAD_CONFIG.coolingOffPeriod
}

/**
 * Estimate hours required for an enquiry
 */
function estimateEnquiryHours(enquiry: Enquiry): number {
  const baseHours = 2 // Minimum time for any enquiry
  const value = enquiry.estimated_value || 0
  
  // Value-based estimation
  let hours = baseHours
  if (value > 100000) hours += 8
  else if (value > 50000) hours += 4
  else if (value > 10000) hours += 2

  // Complexity adjustment
  if (isComplexMatter(enquiry)) hours *= 1.5

  // Urgency adjustment
  if (enquiry.urgency === 'Immediate') hours *= 1.2

  return Math.round(hours)
}

/**
 * Calculate projected utilization after assignment
 */
function calculateProjectedUtilization(workload: WorkloadMetrics | undefined, additionalHours: number): number {
  if (!workload) return 0
  
  const projectedHours = workload.currentHours + additionalHours
  return Math.round((projectedHours / workload.maxHours) * 100)
}

/**
 * Generate assignment reasoning text
 */
function generateAssignmentReasoning(
  name: string,
  capacityScore: number,
  expertiseScore: number,
  performanceScore: number,
  urgencyScore: number
): string {
  const factors = []
  
  if (capacityScore > 0.8) factors.push('good availability')
  if (expertiseScore > 0.8) factors.push('strong expertise match')
  if (performanceScore > 0.8) factors.push('high performance rating')
  if (urgencyScore > 0.8) factors.push('excellent urgency handling')
  
  const reason = factors.length > 0 
    ? `${name} recommended due to ${factors.join(', ')}`
    : `${name} is the best available option`
  
  const totalScore = Math.round((capacityScore + expertiseScore + performanceScore + urgencyScore) * 25)
  return `${reason} (suitability: ${totalScore}/100)`
}

/**
 * Calculate average utilization across all resources
 */
function calculateAverageUtilization(workloads: Map<string, WorkloadMetrics>): number {
  const utilizationRates = Array.from(workloads.values()).map(w => w.utilizationRate)
  return utilizationRates.reduce((sum, rate) => sum + rate, 0) / utilizationRates.length
}

/**
 * Identify capacity bottlenecks
 */
function identifyBottlenecks(
  workloads: Map<string, WorkloadMetrics>,
  threshold: number
): CapacityPlan['bottlenecks'] {
  const bottlenecks: CapacityPlan['bottlenecks'] = []
  
  for (const [id, workload] of workloads) {
    if (workload.utilizationRate >= threshold) {
      let severity: 'Low' | 'Medium' | 'High' | 'Critical'
      
      if (workload.utilizationRate >= 0.98) severity = 'Critical'
      else if (workload.utilizationRate >= 0.92) severity = 'High'
      else if (workload.utilizationRate >= 0.87) severity = 'Medium'
      else severity = 'Low'
      
      bottlenecks.push({
        resource: id,
        severity,
        impact: `${Math.round(workload.utilizationRate * 100)}% capacity utilization`,
        recommendation: severity === 'Critical' 
          ? 'Immediate workload redistribution required'
          : 'Monitor closely and prepare for overflow'
      })
    }
  }
  
  return bottlenecks
}

/**
 * Generate rebalancing recommendations
 */
function generateRebalanceRecommendations(
  workloads: Map<string, WorkloadMetrics>,
  projectedUtilization: number
): CapacityPlan['rebalanceRecommendations'] {
  const recommendations: CapacityPlan['rebalanceRecommendations'] = []
  
  if (projectedUtilization > 0.95) {
    recommendations.push({
      action: 'Hire',
      priority: 'High',
      description: 'Consider hiring additional resources to handle projected demand',
      estimatedImpact: 20
    })
  } else if (projectedUtilization > 0.85) {
    recommendations.push({
      action: 'Redistribute',
      priority: 'Medium',
      description: 'Redistribute workload to optimize utilization',
      estimatedImpact: 10
    })
  }
  
  return recommendations
}

/**
 * Analyze barrister workload distribution
 */
function analyzeBarristerDistribution(
  barristers: Barrister[],
  workloads: Map<string, WorkloadMetrics>
): WorkloadDistribution['barristers'] {
  const avgUtilization = calculateAverageUtilization(workloads)
  
  return barristers.map(barrister => {
    const workload = workloads.get(barrister.id)
    const currentUtilization = workload?.utilizationRate || 0
    const variance = Math.abs(currentUtilization - avgUtilization)
    
    const recommendations: string[] = []
    if (currentUtilization > avgUtilization + 0.15) {
      recommendations.push('Consider reducing workload allocation')
    } else if (currentUtilization < avgUtilization - 0.15) {
      recommendations.push('Available for additional assignments')
    }
    
    return {
      id: barrister.id,
      name: barrister.name,
      currentWorkload: Math.round(currentUtilization * 100),
      optimalWorkload: Math.round(avgUtilization * 100),
      variance: Math.round(variance * 100),
      recommendations
    }
  })
}

/**
 * Analyze clerk workload distribution
 */
function analyzeClerkDistribution(
  clerks: Clerk[],
  workloads: Map<string, WorkloadMetrics>
): WorkloadDistribution['clerks'] {
  const clerkWorkloads = new Map<string, WorkloadMetrics>()
  for (const clerk of clerks) {
    const workload = workloads.get(clerk.id)
    if (workload) clerkWorkloads.set(clerk.id, workload)
  }
  
  const avgUtilization = calculateAverageUtilization(clerkWorkloads)
  
  return clerks.map(clerk => {
    const workload = workloads.get(clerk.id)
    const currentUtilization = workload?.utilizationRate || 0
    const variance = Math.abs(currentUtilization - avgUtilization)
    
    const recommendations: string[] = []
    if (currentUtilization > avgUtilization + 0.15) {
      recommendations.push('Consider workload redistribution')
    } else if (currentUtilization < avgUtilization - 0.15) {
      recommendations.push('Available for additional responsibilities')
    }
    
    return {
      id: clerk.id,
      name: clerk.name,
      currentWorkload: Math.round(currentUtilization * 100),
      optimalWorkload: Math.round(avgUtilization * 100),
      variance: Math.round(variance * 100),
      recommendations
    }
  })
}