// Performance optimization utilities for the BDIP application

export interface PerformanceMetrics {
  operationName: string
  duration: number
  memoryUsage?: number
  recordsProcessed?: number
  throughput?: number
  timestamp: Date
}

// Performance monitoring utility
export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics[]> = new Map()
  
  startTimer(operationName: string): PerformanceTimer {
    return new PerformanceTimer(operationName, (metrics) => {
      this.recordMetrics(metrics)
    })
  }
  
  recordMetrics(metrics: PerformanceMetrics): void {
    const existing = this.metrics.get(metrics.operationName) || []
    existing.push(metrics)
    
    // Keep only last 100 metrics per operation
    if (existing.length > 100) {
      existing.shift()
    }
    
    this.metrics.set(metrics.operationName, existing)
    
    // Log performance warnings
    if (metrics.duration > 5000) { // 5 seconds
      console.warn(`Slow operation detected: ${metrics.operationName} took ${metrics.duration}ms`)
    }
  }
  
  getMetrics(operationName: string): PerformanceMetrics[] {
    return this.metrics.get(operationName) || []
  }
  
  getAverageMetrics(operationName: string): {
    averageDuration: number
    averageThroughput: number
    totalOperations: number
  } | null {
    const metrics = this.getMetrics(operationName)
    if (metrics.length === 0) return null
    
    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0)
    const totalThroughput = metrics.reduce((sum, m) => sum + (m.throughput || 0), 0)
    
    return {
      averageDuration: totalDuration / metrics.length,
      averageThroughput: totalThroughput / metrics.length,
      totalOperations: metrics.length
    }
  }
}

class PerformanceTimer {
  private startTime: number
  private startMemory?: number
  
  constructor(
    private operationName: string,
    private onComplete: (metrics: PerformanceMetrics) => void
  ) {
    this.startTime = performance.now()
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.startMemory = process.memoryUsage().heapUsed
    }
  }
  
  end(recordsProcessed?: number): PerformanceMetrics {
    const duration = performance.now() - this.startTime
    let memoryUsage: number | undefined
    
    if (this.startMemory && typeof process !== 'undefined' && process.memoryUsage) {
      memoryUsage = process.memoryUsage().heapUsed - this.startMemory
    }
    
    const throughput = recordsProcessed ? recordsProcessed / (duration / 1000) : undefined
    
    const metrics: PerformanceMetrics = {
      operationName: this.operationName,
      duration,
      memoryUsage,
      recordsProcessed,
      throughput,
      timestamp: new Date()
    }
    
    this.onComplete(metrics)
    return metrics
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor()

// Database query optimization
export class DatabaseOptimizer {
  private queryCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map()
  
  // Cache database results with TTL
  async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttlMs: number = 300000 // 5 minutes default
  ): Promise<T> {
    const cached = this.queryCache.get(key)
    const now = Date.now()
    
    if (cached && (now - cached.timestamp) < cached.ttl) {
      return cached.data
    }
    
    const timer = performanceMonitor.startTimer(`db-query-${key}`)
    const result = await operation()
    timer.end()
    
    this.queryCache.set(key, {
      data: result,
      timestamp: now,
      ttl: ttlMs
    })
    
    return result
  }
  
  // Clear cache
  clearCache(pattern?: string): void {
    if (pattern) {
      const regex = new RegExp(pattern)
      for (const key of this.queryCache.keys()) {
        if (regex.test(key)) {
          this.queryCache.delete(key)
        }
      }
    } else {
      this.queryCache.clear()
    }
  }
  
  // Get cache statistics
  getCacheStats(): {
    totalEntries: number
    hitRate: number
    memoryUsage: number
  } {
    // This is a simplified implementation
    return {
      totalEntries: this.queryCache.size,
      hitRate: 0, // Would need hit/miss tracking
      memoryUsage: this.queryCache.size * 1024 // Rough estimate
    }
  }
}

// CSV processing optimization
export class CSVOptimizer {
  // Stream-based CSV processing for large files
  static async processLargeCSV(
    csvContent: string,
    processor: (batch: any[]) => Promise<void>,
    batchSize: number = 1000
  ): Promise<void> {
    const timer = performanceMonitor.startTimer('csv-stream-processing')
    
    try {
      // Use streaming approach for large files
      const lines = csvContent.split('\n')
      const header = lines[0]
      let batch: any[] = []
      let totalProcessed = 0
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        // Parse CSV row (simplified - would use proper CSV parser in production)
        const row = this.parseCSVLine(header, line)
        batch.push(row)
        
        if (batch.length >= batchSize) {
          await processor(batch)
          totalProcessed += batch.length
          batch = []
          
          // Allow event loop to breathe
          await new Promise(resolve => setImmediate(resolve))
        }
      }
      
      // Process remaining batch
      if (batch.length > 0) {
        await processor(batch)
        totalProcessed += batch.length
      }
      
      timer.end(totalProcessed)
    } catch (error) {
      timer.end()
      throw error
    }
  }
  
  private static parseCSVLine(header: string, line: string): Record<string, string> {
    // Simplified CSV parsing - in production, use Papa Parse streaming
    const headers = header.split(',').map(h => h.trim().replace(/"/g, ''))
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    
    return row
  }
  
  // Batch database operations
  static async batchDatabaseOperations<T>(
    items: T[],
    operation: (batch: T[]) => Promise<void>,
    batchSize: number = 500
  ): Promise<void> {
    const timer = performanceMonitor.startTimer('batch-db-operations')
    
    try {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await operation(batch)
        
        // Prevent blocking the event loop
        if (i + batchSize < items.length) {
          await new Promise(resolve => setImmediate(resolve))
        }
      }
      
      timer.end(items.length)
    } catch (error) {
      timer.end()
      throw error
    }
  }
}

// Memory optimization utilities
export class MemoryOptimizer {
  private static readonly MAX_HEAP_USAGE = 0.8 // 80% of available heap
  
  // Check if memory usage is too high
  static checkMemoryUsage(): { 
    isHigh: boolean
    heapUsed: number
    heapTotal: number
    usage: number
  } {
    if (typeof process === 'undefined') {
      return { isHigh: false, heapUsed: 0, heapTotal: 0, usage: 0 }
    }
    
    const memUsage = process.memoryUsage()
    const usage = memUsage.heapUsed / memUsage.heapTotal
    
    return {
      isHigh: usage > this.MAX_HEAP_USAGE,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      usage
    }
  }
  
  // Force garbage collection if available and memory is high
  static async collectGarbage(): Promise<void> {
    const memCheck = this.checkMemoryUsage()
    
    if (memCheck.isHigh) {
      console.warn(`High memory usage detected: ${(memCheck.usage * 100).toFixed(1)}%`)
      
      if (global.gc) {
        global.gc()
        console.log('Manual garbage collection triggered')
      }
      
      // Give GC time to run
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  // Monitor memory during operations
  static async withMemoryMonitoring<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const initialMemory = this.checkMemoryUsage()
    console.log(`${operationName} - Initial memory: ${(initialMemory.usage * 100).toFixed(1)}%`)
    
    try {
      const result = await operation()
      
      const finalMemory = this.checkMemoryUsage()
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed
      
      console.log(`${operationName} - Final memory: ${(finalMemory.usage * 100).toFixed(1)}% (${memoryDelta > 0 ? '+' : ''}${Math.round(memoryDelta / 1024 / 1024)}MB)`)
      
      if (finalMemory.isHigh) {
        await this.collectGarbage()
      }
      
      return result
    } catch (error) {
      const errorMemory = this.checkMemoryUsage()
      console.error(`${operationName} - Error occurred at ${(errorMemory.usage * 100).toFixed(1)}% memory usage`)
      throw error
    }
  }
}

// Response caching for API endpoints
export class ResponseCache {
  private cache: Map<string, { data: any; timestamp: number; etag: string }> = new Map()
  
  generateKey(request: { url: string; method: string; userId?: string }): string {
    return `${request.method}:${request.url}:${request.userId || 'anonymous'}`
  }
  
  generateETag(data: any): string {
    // Simple ETag generation - in production, use more sophisticated hashing
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)
  }
  
  get(key: string, maxAge: number = 300000): { data: any; etag: string } | null {
    const cached = this.cache.get(key)
    
    if (cached && (Date.now() - cached.timestamp) < maxAge) {
      return { data: cached.data, etag: cached.etag }
    }
    
    this.cache.delete(key)
    return null
  }
  
  set(key: string, data: any): string {
    const etag = this.generateETag(data)
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      etag
    })
    
    return etag
  }
  
  invalidate(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }
}