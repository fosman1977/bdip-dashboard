import { createServerSupabaseClient } from '../supabase/server'
import type { ProcessingProgress, ValidationError } from './processor'

/**
 * Real-time progress tracking system for CSV imports
 * Provides secure status updates with user permission checks
 */

export interface ProgressUpdate {
  importId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: {
    totalRows: number
    processedRows: number
    errorRows: number
    successRows: number
    percentageComplete: number
  }
  timing: {
    startTime: string | null
    endTime: string | null
    estimatedCompletion: string | null
    duration: number | null
    avgRowProcessingTime: number | null
  }
  errors: {
    count: number
    items: Array<{
      row: number
      field: string
      error: string
      severity: 'error' | 'warning'
      timestamp: string
    }>
    hasMore: boolean
  }
  warnings: {
    count: number
    items: Array<{
      row: number
      field: string
      error: string
      severity: 'error' | 'warning'
      timestamp: string
    }>
    hasMore: boolean
  }
  metadata: {
    filename: string
    type: string
    fileSize: number
    userId: string
    userEmail: string
  }
}

export interface ProgressTracker {
  startTime: number
  lastUpdate: number
  processedRows: number
  totalRows: number
  errors: ValidationError[]
  warnings: ValidationError[]
  batchTimes: number[]
  estimatedTimePerRow: number
}

// In-memory progress tracking (for real-time updates)
const progressTrackers = new Map<string, ProgressTracker>()

// Security: User session tracking for progress access control
const userProgressMap = new Map<string, Set<string>>() // userId -> Set<importId>

export class ProgressTrackingService {
  private supabase = createServerSupabaseClient()
  
  /**
   * Initialize progress tracking for an import
   */
  async initializeTracking(
    importId: string,
    userId: string,
    metadata: {
      filename: string
      type: string
      fileSize: number
      userEmail: string
    }
  ): Promise<void> {
    // Initialize in-memory tracker
    progressTrackers.set(importId, {
      startTime: Date.now(),
      lastUpdate: Date.now(),
      processedRows: 0,
      totalRows: 0,
      errors: [],
      warnings: [],
      batchTimes: [],
      estimatedTimePerRow: 0
    })
    
    // Track user access to this import
    if (!userProgressMap.has(userId)) {
      userProgressMap.set(userId, new Set())
    }
    userProgressMap.get(userId)!.add(importId)
    
    // Store metadata in database
    try {
      const { error } = await this.supabase
        .from('csv_imports')
        .update({
          status: 'pending',
          started_at: null, // Will be set when processing starts
          errors: {
            metadata,
            tracking_initialized: new Date().toISOString()
          }
        })
        .eq('id', importId)
      
      if (error) {
        console.error(`Failed to initialize tracking for ${importId}:`, error)
      }
    } catch (error) {
      console.error(`Tracking initialization error for ${importId}:`, error)
    }
  }
  
  /**
   * Update processing progress with performance tracking
   */
  async updateProgress(
    importId: string,
    update: {
      status?: 'pending' | 'processing' | 'completed' | 'failed'
      totalRows?: number
      processedRows?: number
      errorRows?: number
      errors?: ValidationError[]
      warnings?: ValidationError[]
      batchProcessingTime?: number
    }
  ): Promise<void> {
    const tracker = progressTrackers.get(importId)
    if (!tracker) {
      console.warn(`No tracker found for import ${importId}`)
      return
    }
    
    const now = Date.now()
    
    // Update in-memory tracker
    if (update.totalRows !== undefined) {
      tracker.totalRows = update.totalRows
    }
    
    if (update.processedRows !== undefined) {
      tracker.processedRows = update.processedRows
    }
    
    if (update.errors) {
      // Add timestamps to new errors
      const timestampedErrors = update.errors.map(error => ({
        ...error,
        timestamp: new Date().toISOString()
      }))
      tracker.errors.push(...timestampedErrors)
    }
    
    if (update.warnings) {
      const timestampedWarnings = update.warnings.map(warning => ({
        ...warning,
        timestamp: new Date().toISOString()
      }))
      tracker.warnings.push(...timestampedWarnings)
    }
    
    if (update.batchProcessingTime) {
      tracker.batchTimes.push(update.batchProcessingTime)
      
      // Calculate average time per row for estimation
      const totalBatchTime = tracker.batchTimes.reduce((sum, time) => sum + time, 0)
      const totalProcessedInBatches = tracker.processedRows
      if (totalProcessedInBatches > 0) {
        tracker.estimatedTimePerRow = totalBatchTime / totalProcessedInBatches
      }
    }
    
    tracker.lastUpdate = now
    
    // Update database (throttled to avoid excessive writes)
    const timeSinceLastUpdate = now - tracker.lastUpdate
    if (timeSinceLastUpdate > 2000 || update.status === 'completed' || update.status === 'failed') {
      await this.persistProgress(importId, update)
    }
  }
  
  /**
   * Get current progress with security checks
   */
  async getProgress(importId: string, userId: string): Promise<ProgressUpdate | null> {
    // Check user permission
    const userImports = userProgressMap.get(userId)
    if (!userImports || !userImports.has(importId)) {
      // Verify against database as fallback
      const hasAccess = await this.verifyUserAccess(importId, userId)
      if (!hasAccess) {
        throw new Error('Unauthorized access to import progress')
      }
      
      // Add to user map for future requests
      if (!userImports) {
        userProgressMap.set(userId, new Set([importId]))
      } else {
        userImports.add(importId)
      }
    }
    
    // Get latest data from database
    const { data: importRecord, error } = await this.supabase
      .from('csv_imports')
      .select('*')
      .eq('id', importId)
      .single()
    
    if (error || !importRecord) {
      return null
    }
    
    // Get in-memory tracker for real-time data
    const tracker = progressTrackers.get(importId)
    
    // Combine database and real-time data
    const progress: ProgressUpdate = {
      importId,
      status: importRecord.status,
      progress: {
        totalRows: tracker?.totalRows || importRecord.total_rows || 0,
        processedRows: tracker?.processedRows || importRecord.processed_rows || 0,
        errorRows: tracker?.errors?.length || importRecord.error_rows || 0,
        successRows: Math.max(0, 
          (tracker?.processedRows || importRecord.processed_rows || 0) - 
          (tracker?.errors?.length || importRecord.error_rows || 0)
        ),
        percentageComplete: this.calculatePercentage(
          tracker?.processedRows || importRecord.processed_rows || 0,
          tracker?.totalRows || importRecord.total_rows || 0
        )
      },
      timing: {
        startTime: importRecord.started_at,
        endTime: importRecord.completed_at,
        estimatedCompletion: this.calculateEstimatedCompletion(tracker, importRecord),
        duration: this.calculateDuration(importRecord.started_at, importRecord.completed_at),
        avgRowProcessingTime: tracker?.estimatedTimePerRow || null
      },
      errors: {
        count: tracker?.errors?.length || importRecord.error_rows || 0,
        items: this.sanitizeErrors(tracker?.errors || []).slice(0, 10),
        hasMore: (tracker?.errors?.length || 0) > 10
      },
      warnings: {
        count: tracker?.warnings?.length || 0,
        items: this.sanitizeErrors(tracker?.warnings || []).slice(0, 10),
        hasMore: (tracker?.warnings?.length || 0) > 10
      },
      metadata: importRecord.errors?.metadata || {
        filename: importRecord.filename,
        type: importRecord.type,
        fileSize: 0,
        userId: '',
        userEmail: ''
      }
    }
    
    return progress
  }
  
  /**
   * Clean up completed or failed imports
   */
  async cleanupProgress(importId: string, userId?: string): Promise<void> {
    // Remove from in-memory tracking
    progressTrackers.delete(importId)
    
    // Remove from user access map
    if (userId) {
      const userImports = userProgressMap.get(userId)
      if (userImports) {
        userImports.delete(importId)
        if (userImports.size === 0) {
          userProgressMap.delete(userId)
        }
      }
    }
  }
  
  /**
   * Get all active imports for a user
   */
  async getUserActiveImports(userId: string): Promise<string[]> {
    const userImports = userProgressMap.get(userId) || new Set()
    return Array.from(userImports)
  }
  
  /**
   * Persist progress to database (throttled)
   */
  private async persistProgress(
    importId: string,
    update: {
      status?: 'pending' | 'processing' | 'completed' | 'failed'
      totalRows?: number
      processedRows?: number
      errorRows?: number
    }
  ): Promise<void> {
    try {
      const tracker = progressTrackers.get(importId)
      
      const dbUpdate: any = {}
      
      if (update.status) {
        dbUpdate.status = update.status
        
        if (update.status === 'processing' && !dbUpdate.started_at) {
          dbUpdate.started_at = new Date().toISOString()
        }
        
        if (update.status === 'completed' || update.status === 'failed') {
          dbUpdate.completed_at = new Date().toISOString()
        }
      }
      
      if (update.totalRows !== undefined) {
        dbUpdate.total_rows = update.totalRows
      }
      
      if (update.processedRows !== undefined) {
        dbUpdate.processed_rows = update.processedRows
      }
      
      if (update.errorRows !== undefined) {
        dbUpdate.error_rows = update.errorRows
      }
      
      // Include error summary if available
      if (tracker) {
        dbUpdate.errors = {
          ...dbUpdate.errors,
          errors: tracker.errors.slice(-100), // Keep last 100 errors
          warnings: tracker.warnings.slice(-100),
          performance: {
            avgTimePerRow: tracker.estimatedTimePerRow,
            totalBatches: tracker.batchTimes.length,
            avgBatchTime: tracker.batchTimes.length > 0 
              ? tracker.batchTimes.reduce((sum, time) => sum + time, 0) / tracker.batchTimes.length
              : 0
          },
          lastUpdate: new Date().toISOString()
        }
      }
      
      const { error } = await this.supabase
        .from('csv_imports')
        .update(dbUpdate)
        .eq('id', importId)
      
      if (error) {
        console.error(`Failed to persist progress for ${importId}:`, error)
      }
    } catch (error) {
      console.error(`Progress persistence error for ${importId}:`, error)
    }
  }
  
  /**
   * Verify user has access to import
   */
  private async verifyUserAccess(importId: string, userId: string): Promise<boolean> {
    try {
      // In a real system, you might check based on user role, organization, etc.
      // For now, we'll allow access if the import exists and user is authenticated
      const { data, error } = await this.supabase
        .from('csv_imports')
        .select('id')
        .eq('id', importId)
        .single()
      
      return !error && !!data
    } catch {
      return false
    }
  }
  
  /**
   * Calculate percentage complete
   */
  private calculatePercentage(processed: number, total: number): number {
    if (total === 0) return 0
    return Math.round((processed / total) * 100)
  }
  
  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletion(
    tracker: ProgressTracker | undefined,
    importRecord: any
  ): string | null {
    if (!tracker || tracker.processedRows === 0 || tracker.totalRows === 0) {
      return null
    }
    
    if (tracker.processedRows >= tracker.totalRows) {
      return null // Already complete
    }
    
    const now = Date.now()
    const elapsed = now - tracker.startTime
    const avgTimePerRow = elapsed / tracker.processedRows
    const remainingRows = tracker.totalRows - tracker.processedRows
    const estimatedRemainingTime = avgTimePerRow * remainingRows
    
    return new Date(now + estimatedRemainingTime).toISOString()
  }
  
  /**
   * Calculate total duration
   */
  private calculateDuration(startTime: string | null, endTime: string | null): number | null {
    if (!startTime) return null
    
    const start = new Date(startTime).getTime()
    const end = endTime ? new Date(endTime).getTime() : Date.now()
    
    return end - start
  }
  
  /**
   * Sanitize errors for frontend display
   */
  private sanitizeErrors(errors: ValidationError[]): Array<{
    row: number
    field: string
    error: string
    severity: 'error' | 'warning'
    timestamp: string
  }> {
    return errors.map(error => ({
      row: error.row,
      field: error.field,
      error: error.error.substring(0, 200), // Limit error message length
      severity: error.severity,
      timestamp: (error as any).timestamp || new Date().toISOString()
    }))
  }
}

// Singleton instance
export const progressTracker = new ProgressTrackingService()

// Cleanup function for long-running processes
export function cleanupStaleProgress(maxAge: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now()
  
  for (const [importId, tracker] of progressTrackers.entries()) {
    if (now - tracker.lastUpdate > maxAge) {
      progressTrackers.delete(importId)
      console.log(`Cleaned up stale progress tracker: ${importId}`)
    }
  }
}