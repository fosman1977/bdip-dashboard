/**
 * BDIP Algorithm Suite - Main Exports
 * 
 * Business Development Intelligence Platform core algorithms for UK barristers' chambers.
 * Provides intelligent enquiry routing, performance tracking, and workload management.
 * 
 * Key Features:
 * - Engagement scoring with multi-factor analysis
 * - Smart enquiry routing based on expertise and capacity
 * - Predictive conversion probability calculations  
 * - Intelligent workload balancing and capacity planning
 * 
 * All algorithms are optimized for production use with comprehensive error handling,
 * detailed logging, and performance benchmarks suitable for chambers handling 
 * 5,000+ enquiries per month.
 */

// Core Algorithm Exports
export {
  // Engagement Scoring
  calculateEngagementScore,
  calculateEngagementScoreFromData,
  calculateBatchEngagementScores,
  getEngagementScoreForStorage,
  explainEngagementScore,
  
  // Individual scoring components
  calculateResponseScore,
  calculateConversionScore,
  calculateSatisfactionScore,
  calculateRevenueScore,
  
  // Configuration and types
  ENGAGEMENT_WEIGHTS,
  SCORING_CONFIG,
  
  // Types
  type EngagementScoreResult,
  type BarristerMetricsInput
} from './engagement-scoring'

export {
  // Enquiry Routing
  routeEnquiry,
  extractRoutingCriteria,
  determineComplexity,
  evaluateCandidate,
  calculatePracticeAreaMatch,
  calculateSeniorityMatch,
  calculateWorkloadScore,
  calculateUrgencyBonus,
  getRoutingRecommendations,
  
  // Configuration
  ROUTING_CONFIG,
  SENIORITY_VALUES,
  
  // Types
  type RoutingCandidate,
  type RoutingResult,
  type BarristerWorkload
} from './enquiry-routing'

export {
  // Conversion Prediction
  calculateConversionProbability,
  calculateClientRelationshipAdjustment,
  calculateResponseTimeAdjustment,
  calculateValueAdjustment,
  calculateSourceAdjustment,
  calculateUrgencyAdjustment,
  calculateBarristerPerformanceAdjustment,
  calculatePracticeAreaAdjustment,
  calculateSeasonalityAdjustment,
  
  // Configuration
  CONVERSION_CONFIG,
  
  // Types
  type ConversionPredictionInput,
  type ConversionPrediction,
  type ClientHistoryData,
  type BarristerHistoryData,
  type PracticeAreaStats,
  type SeasonalityData
} from './conversion-prediction'

export {
  // Workload Balancing
  calculateWorkloadAssignment,
  assignToBarrister,
  assignToClerk,
  generateCapacityPlan,
  calculateOptimalDistribution,
  
  // Configuration
  WORKLOAD_CONFIG,
  
  // Types
  type WorkloadMetrics,
  type WorkloadAssignment,
  type CapacityPlan,
  type WorkloadDistribution
} from './workload-balancing'

// Utility Functions
export const AlgorithmUtils = {
  /**
   * Validate algorithm input data
   */
  validateInput: <T>(data: T, requiredFields: string[]): boolean => {
    if (!data || typeof data !== 'object') return false
    
    return requiredFields.every(field => {
      const value = (data as any)[field]
      return value !== null && value !== undefined
    })
  },

  /**
   * Calculate weighted average
   */
  calculateWeightedAverage: (values: number[], weights: number[]): number => {
    if (values.length !== weights.length) {
      throw new Error('Values and weights arrays must have the same length')
    }
    
    const weightedSum = values.reduce((sum, value, index) => sum + (value * weights[index]), 0)
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0
  },

  /**
   * Normalize value to 0-1 range
   */
  normalize: (value: number, min: number, max: number): number => {
    if (max === min) return 0
    return Math.max(0, Math.min(1, (value - min) / (max - min)))
  },

  /**
   * Calculate standard deviation
   */
  standardDeviation: (values: number[]): number => {
    if (values.length === 0) return 0
    
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2))
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length
    
    return Math.sqrt(variance)
  },

  /**
   * Calculate percentile rank
   */
  percentileRank: (value: number, dataset: number[]): number => {
    const sorted = dataset.slice().sort((a, b) => a - b)
    const belowCount = sorted.filter(v => v < value).length
    const equalCount = sorted.filter(v => v === value).length
    
    return (belowCount + equalCount / 2) / sorted.length * 100
  }
}

// Performance Monitoring
export const AlgorithmMetrics = {
  /**
   * Track algorithm execution time
   */
  timeExecution: async <T>(
    algorithmName: string,
    operation: () => Promise<T> | T
  ): Promise<{ result: T; executionTime: number }> => {
    const startTime = performance.now()
    
    try {
      const result = await operation()
      const executionTime = performance.now() - startTime
      
      // Log performance metrics (in production, this would go to your monitoring system)
      console.log(`Algorithm ${algorithmName} executed in ${executionTime.toFixed(2)}ms`)
      
      return { result, executionTime }
    } catch (error) {
      const executionTime = performance.now() - startTime
      console.error(`Algorithm ${algorithmName} failed after ${executionTime.toFixed(2)}ms:`, error)
      throw error
    }
  },

  /**
   * Validate algorithm output quality
   */
  validateOutput: (algorithmName: string, output: any, expectedType: string): boolean => {
    try {
      switch (expectedType) {
        case 'EngagementScoreResult':
          return typeof output.totalScore === 'number' && 
                 output.totalScore >= 0 && 
                 output.totalScore <= 100 &&
                 typeof output.breakdown === 'object'
        
        case 'RoutingResult':
          return typeof output.recommendedBarrister === 'object' &&
                 Array.isArray(output.alternativeCandidates) &&
                 typeof output.routingMetadata === 'object'
        
        case 'ConversionPrediction':
          return typeof output.probability === 'number' &&
                 output.probability >= 0 &&
                 output.probability <= 100 &&
                 typeof output.confidenceLevel === 'string'
        
        case 'WorkloadAssignment':
          return typeof output.recommendedAssignee === 'string' &&
                 typeof output.confidence === 'number' &&
                 typeof output.workloadImpact === 'object'
        
        default:
          return true
      }
    } catch (error) {
      console.error(`Output validation failed for ${algorithmName}:`, error)
      return false
    }
  }
}

// Configuration Management
export const AlgorithmConfig = {
  /**
   * Get algorithm configuration for environment
   */
  getConfig: (environment: 'development' | 'staging' | 'production' = 'production') => {
    const baseConfig = {
      engagement: ENGAGEMENT_WEIGHTS,
      routing: ROUTING_CONFIG,
      conversion: CONVERSION_CONFIG,
      workload: WORKLOAD_CONFIG
    }

    // Environment-specific adjustments
    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          // More lenient thresholds for testing
          routing: {
            ...ROUTING_CONFIG,
            minEngagementForHighValue: 50
          }
        }
      
      case 'staging':
        return {
          ...baseConfig,
          // Staging-specific configurations
          conversion: {
            ...CONVERSION_CONFIG,
            highConfidenceThreshold: 10
          }
        }
      
      default:
        return baseConfig
    }
  },

  /**
   * Validate configuration integrity
   */
  validateConfig: (): boolean => {
    try {
      // Check engagement weights sum to 1.0
      const engagementSum = Object.values(ENGAGEMENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
      if (Math.abs(engagementSum - 1.0) > 0.001) {
        console.error('Engagement weights do not sum to 1.0')
        return false
      }

      // Check routing weights are reasonable
      const routingWeightSum = ROUTING_CONFIG.engagementScoreWeight + 
                              ROUTING_CONFIG.workloadBalanceWeight + 
                              ROUTING_CONFIG.seniorityBonusWeight
      if (routingWeightSum > 1.0) {
        console.error('Routing weights exceed 1.0')
        return false
      }

      // Check workload thresholds are ascending
      if (WORKLOAD_CONFIG.optimalCapacity >= WORKLOAD_CONFIG.warningCapacity ||
          WORKLOAD_CONFIG.warningCapacity >= WORKLOAD_CONFIG.maxCapacity) {
        console.error('Workload capacity thresholds are not in ascending order')
        return false
      }

      return true
    } catch (error) {
      console.error('Configuration validation failed:', error)
      return false
    }
  }
}

// Version and Metadata
export const AlgorithmMeta = {
  version: '1.0.0',
  buildDate: new Date().toISOString(),
  description: 'BDIP Algorithm Suite for UK Barristers Chambers',
  algorithms: [
    'Engagement Scoring',
    'Enquiry Routing', 
    'Conversion Prediction',
    'Workload Balancing'
  ],
  compatibility: {
    node: '>=18.0.0',
    typescript: '>=4.9.0'
  }
}