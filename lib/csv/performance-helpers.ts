import { createServiceRoleClient } from '../supabase/server'

/**
 * Performance optimization helpers for CSV operations
 * Provides database-level optimizations and batch processing utilities
 */

export interface PerformanceMetrics {
  batchSize: number
  processingTime: number
  rowsPerSecond: number
  memoryUsage: number
  databaseConnections: number
}

export interface BatchProcessingOptions {
  batchSize: number
  maxConcurrency: number
  retryAttempts: number
  retryDelay: number
  progressCallback?: (processed: number, total: number) => void
}

export class PerformanceOptimizer {
  private supabase = createServiceRoleClient()
  private metrics: PerformanceMetrics[] = []
  
  /**
   * Optimize database connection settings for bulk operations
   */
  async optimizeForBulkOperations(): Promise<void> {
    try {
      // Set session-level optimizations for bulk processing
      await this.supabase.rpc('exec_sql', {
        sql: `
          -- Disable autocommit for better batch performance
          SET autocommit = OFF;
          
          -- Increase work memory for sorting operations
          SET work_mem = '256MB';
          
          -- Optimize for bulk inserts
          SET synchronous_commit = OFF;
          
          -- Increase maintenance work memory
          SET maintenance_work_mem = '512MB';
        `
      }).single()
      
    } catch (error) {
      console.warn('Failed to optimize database settings:', error)
      // Continue with default settings
    }
  }
  
  /**
   * Process data in optimized batches with performance monitoring
   */
  async processBatchesOptimized<T>(
    data: T[],
    processor: (batch: T[]) => Promise<void>,
    options: BatchProcessingOptions = {
      batchSize: 500,
      maxConcurrency: 3,
      retryAttempts: 3,
      retryDelay: 1000
    }
  ): Promise<PerformanceMetrics[]> {
    const startTime = Date.now()
    const batches = this.createBatches(data, options.batchSize)
    const metrics: PerformanceMetrics[] = []
    
    // Process batches with controlled concurrency
    const semaphore = new Semaphore(options.maxConcurrency)
    const promises = batches.map(async (batch, index) => {
      await semaphore.acquire()
      try {
        const batchStartTime = Date.now()
        const initialMemory = this.getMemoryUsage()
        
        await this.executeWithRetry(
          () => processor(batch),
          options.retryAttempts,
          options.retryDelay
        )
        
        const batchEndTime = Date.now()
        const processingTime = batchEndTime - batchStartTime
        const finalMemory = this.getMemoryUsage()
        
        const batchMetrics: PerformanceMetrics = {
          batchSize: batch.length,
          processingTime,
          rowsPerSecond: batch.length / (processingTime / 1000),
          memoryUsage: finalMemory - initialMemory,
          databaseConnections: await this.getActiveConnections()
        }
        
        metrics.push(batchMetrics)
        
        // Call progress callback
        const totalProcessed = (index + 1) * options.batchSize
        options.progressCallback?.(
          Math.min(totalProcessed, data.length),
          data.length
        )
        
      } finally {
        semaphore.release()
      }
    })
    
    await Promise.all(promises)
    
    // Store metrics for analysis
    this.metrics.push(...metrics)
    
    return metrics
  }
  
  /**
   * Optimized client matching with database functions
   */
  async findClientOptimized(
    name: string,
    type?: 'Individual' | 'Company' | 'Solicitor'
  ): Promise<{ id: string; name: string; type: string; similarity: number } | null> {
    try {
      const { data, error } = await this.supabase
        .rpc('find_client_by_name', {
          search_name: name.trim(),
          client_type: type || null
        })
      
      if (error) {
        throw new Error(`Client search failed: ${error.message}`)
      }
      
      // Return best match if similarity is high enough
      if (data && data.length > 0 && data[0].similarity_score > 0.6) {
        return {
          id: data[0].id,
          name: data[0].name,
          type: data[0].type,
          similarity: data[0].similarity_score
        }
      }
      
      return null
      
    } catch (error) {
      console.error('Optimized client search failed:', error)
      return null
    }
  }
  
  /**
   * Optimized barrister matching with workload consideration
   */
  async findBarristerOptimized(
    name: string
  ): Promise<{ id: string; name: string; similarity: number; available: boolean } | null> {
    try {
      const { data, error } = await this.supabase
        .rpc('find_barrister_by_name', {
          search_name: name.trim()
        })
      
      if (error) {
        throw new Error(`Barrister search failed: ${error.message}`)
      }
      
      // Return best match with availability check
      if (data && data.length > 0 && data[0].similarity_score > 0.5) {
        const match = data[0]
        return {
          id: match.id,
          name: match.name,
          similarity: match.similarity_score,
          available: match.current_workload < match.max_workload
        }
      }
      
      return null
      
    } catch (error) {
      console.error('Optimized barrister search failed:', error)
      return null
    }
  }
  
  /**
   * Batch upsert clients with conflict resolution
   */
  async batchUpsertClients(
    clients: Array<{
      name: string
      type: 'Individual' | 'Company' | 'Solicitor'
      email?: string
      phone?: string
      company_number?: string
    }>
  ): Promise<Array<{ id: string; wasCreated: boolean }>> {
    try {
      const { data, error } = await this.supabase
        .rpc('batch_upsert_clients', {
          client_data: JSON.stringify(clients)
        })
      
      if (error) {
        throw new Error(`Batch client upsert failed: ${error.message}`)
      }
      
      return data || []
      
    } catch (error) {
      console.error('Batch client upsert failed:', error)
      throw error
    }
  }
  
  /**
   * Check LEX reference existence efficiently
   */
  async checkLEXReferenceExists(lexReference: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .rpc('check_lex_reference_exists', {
          lex_ref: lexReference
        })
      
      if (error) {
        throw new Error(`LEX reference check failed: ${error.message}`)
      }
      
      return data === true
      
    } catch (error) {
      console.error('LEX reference check failed:', error)
      return false
    }
  }
  
  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    avgBatchSize: number
    avgProcessingTime: number
    avgRowsPerSecond: number
    totalMemoryUsed: number
    maxConcurrentConnections: number
  } {
    if (this.metrics.length === 0) {
      return {
        avgBatchSize: 0,
        avgProcessingTime: 0,
        avgRowsPerSecond: 0,
        totalMemoryUsed: 0,
        maxConcurrentConnections: 0
      }
    }
    
    return {
      avgBatchSize: this.metrics.reduce((sum, m) => sum + m.batchSize, 0) / this.metrics.length,
      avgProcessingTime: this.metrics.reduce((sum, m) => sum + m.processingTime, 0) / this.metrics.length,
      avgRowsPerSecond: this.metrics.reduce((sum, m) => sum + m.rowsPerSecond, 0) / this.metrics.length,
      totalMemoryUsed: this.metrics.reduce((sum, m) => sum + m.memoryUsage, 0),
      maxConcurrentConnections: Math.max(...this.metrics.map(m => m.databaseConnections))
    }
  }
  
  /**
   * Clean up old import records to maintain performance
   */
  async cleanupOldImports(retentionDays: number = 30): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .rpc('cleanup_old_csv_imports', {
          retention_days: retentionDays
        })
      
      if (error) {
        throw new Error(`Cleanup failed: ${error.message}`)
      }
      
      return data || 0
      
    } catch (error) {
      console.error('Cleanup failed:', error)
      return 0
    }
  }
  
  /**
   * Refresh materialized views for better query performance
   */
  async refreshPerformanceViews(): Promise<void> {
    try {
      await this.supabase.rpc('exec_sql', {
        sql: 'REFRESH MATERIALIZED VIEW CONCURRENTLY csv_import_stats;'
      })
      
    } catch (error) {
      console.warn('Failed to refresh materialized views:', error)
    }
  }
  
  /**
   * Get current database performance metrics
   */
  async getDatabasePerformance(): Promise<{
    activeConnections: number
    averageQueryTime: number
    cacheHitRatio: number
    indexUsage: number
  }> {
    try {
      const { data, error } = await this.supabase
        .rpc('exec_sql', {
          sql: `
            SELECT 
              (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
              (SELECT COALESCE(avg(mean_exec_time), 0) FROM pg_stat_statements WHERE calls > 10) as avg_query_time,
              (SELECT COALESCE(sum(blks_hit)::float / nullif(sum(blks_hit) + sum(blks_read), 0) * 100, 0) FROM pg_stat_database) as cache_hit_ratio,
              (SELECT COALESCE(avg(idx_tup_read::float / nullif(seq_tup_read + idx_tup_read, 0) * 100), 0) FROM pg_stat_user_tables) as index_usage;
          `
        })
        .single()
      
      if (error) {
        throw new Error(`Performance query failed: ${error.message}`)
      }
      
      return {
        activeConnections: data.active_connections || 0,
        averageQueryTime: data.avg_query_time || 0,
        cacheHitRatio: data.cache_hit_ratio || 0,
        indexUsage: data.index_usage || 0
      }
      
    } catch (error) {
      console.error('Failed to get database performance:', error)
      return {
        activeConnections: 0,
        averageQueryTime: 0,
        cacheHitRatio: 0,
        indexUsage: 0
      }
    }
  }
  
  /**
   * Create optimized batches based on data characteristics
   */
  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize))
    }
    
    return batches
  }
  
  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    delayMs: number
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt === maxAttempts) break
        
        // Exponential backoff
        const delay = delayMs * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    throw lastError
  }
  
  /**
   * Get current memory usage (simplified)
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed
    }
    return 0
  }
  
  /**
   * Get active database connections
   */
  private async getActiveConnections(): Promise<number> {
    try {
      const { data } = await this.supabase
        .rpc('exec_sql', {
          sql: 'SELECT count(*) as count FROM pg_stat_activity WHERE state = \'active\';'
        })
        .single()
      
      return data?.count || 0
    } catch {
      return 0
    }
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private available: number
  private waitQueue: (() => void)[] = []
  
  constructor(capacity: number) {
    this.available = capacity
  }
  
  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--
      return
    }
    
    return new Promise(resolve => {
      this.waitQueue.push(resolve)
    })
  }
  
  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!
      next()
    } else {
      this.available++
    }
  }
}

// Singleton instance
export const performanceOptimizer = new PerformanceOptimizer()

// Convenience functions
export async function optimizeForBulkOperations(): Promise<void> {
  return performanceOptimizer.optimizeForBulkOperations()
}

export async function findClientOptimized(
  name: string,
  type?: 'Individual' | 'Company' | 'Solicitor'
): Promise<{ id: string; name: string; type: string; similarity: number } | null> {
  return performanceOptimizer.findClientOptimized(name, type)
}

export async function findBarristerOptimized(
  name: string
): Promise<{ id: string; name: string; similarity: number; available: boolean } | null> {
  return performanceOptimizer.findBarristerOptimized(name)
}

export async function checkLEXReferenceExists(lexReference: string): Promise<boolean> {
  return performanceOptimizer.checkLEXReferenceExists(lexReference)
}

export { PerformanceOptimizer }