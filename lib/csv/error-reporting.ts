import { createServiceRoleClient } from '../supabase/server'
import type { ValidationError } from './validation'

/**
 * Comprehensive error reporting and security event logging system
 * Provides detailed error analysis, security monitoring, and audit trails
 */

export interface SecurityEvent {
  id?: string
  event_type: 'file_upload' | 'validation_failure' | 'processing_error' | 'authentication_failure' | 'authorization_failure' | 'data_export' | 'suspicious_activity'
  severity: 'low' | 'medium' | 'high' | 'critical'
  user_id: string | null
  user_email: string | null
  import_id: string | null
  details: Record<string, any>
  ip_address: string | null
  user_agent: string | null
  timestamp: string
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  notes: string | null
}

export interface ErrorReport {
  importId: string
  filename: string
  totalErrors: number
  totalWarnings: number
  categories: {
    validation: number
    format: number
    constraint: number
    business_logic: number
    system: number
  }
  topErrors: Array<{
    error: string
    count: number
    fields: string[]
    samples: Array<{
      row: number
      value: string
      field: string
    }>
  }>
  recommendations: string[]
  securityConcerns: Array<{
    concern: string
    severity: 'low' | 'medium' | 'high'
    description: string
    recommendation: string
  }>
}

export interface AuditLogEntry {
  id?: string
  user_id: string
  user_email: string
  action: 'csv_upload' | 'csv_export' | 'import_cancel' | 'data_access' | 'system_error'
  resource_type: 'csv_import' | 'enquiry' | 'client' | 'barrister' | 'system'
  resource_id: string | null
  details: Record<string, any>
  ip_address: string | null
  user_agent: string | null
  success: boolean
  timestamp: string
}

export class ErrorReportingService {
  private supabase = createServiceRoleClient()
  
  /**
   * Generate comprehensive error report for CSV import
   */
  async generateErrorReport(
    importId: string,
    errors: ValidationError[],
    warnings: ValidationError[],
    metadata: {
      filename: string
      totalRows: number
      processedRows: number
    }
  ): Promise<ErrorReport> {
    // Categorize errors
    const categories = {
      validation: 0,
      format: 0,
      constraint: 0,
      business_logic: 0,
      system: 0
    }
    
    const errorCounts = new Map<string, {
      count: number
      fields: Set<string>
      samples: Array<{ row: number; value: string; field: string }>
    }>()
    
    // Analyze errors
    errors.forEach(error => {
      // Categorize error
      if (error.error.includes('format') || error.error.includes('parse')) {
        categories.format++
      } else if (error.error.includes('constraint') || error.error.includes('validation')) {
        categories.validation++
      } else if (error.error.includes('required') || error.error.includes('length')) {
        categories.constraint++
      } else if (error.error.includes('business') || error.error.includes('duplicate')) {
        categories.business_logic++
      } else {
        categories.system++
      }
      
      // Group similar errors
      const errorKey = this.normalizeError(error.error)
      if (!errorCounts.has(errorKey)) {
        errorCounts.set(errorKey, {
          count: 0,
          fields: new Set(),
          samples: []
        })
      }
      
      const errorGroup = errorCounts.get(errorKey)!
      errorGroup.count++
      errorGroup.fields.add(error.field)
      
      // Add sample (limit to 3 samples per error type)
      if (errorGroup.samples.length < 3) {
        errorGroup.samples.push({
          row: error.row,
          value: this.sanitizeValue(error.value),
          field: error.field
        })
      }
    })
    
    // Get top errors
    const topErrors = Array.from(errorCounts.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([error, data]) => ({
        error,
        count: data.count,
        fields: Array.from(data.fields),
        samples: data.samples
      }))
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(topErrors, categories, metadata)
    
    // Identify security concerns
    const securityConcerns = this.identifySecurityConcerns(errors, warnings, metadata)
    
    const report: ErrorReport = {
      importId,
      filename: metadata.filename,
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      categories,
      topErrors,
      recommendations,
      securityConcerns
    }
    
    // Store report in database
    await this.storeErrorReport(importId, report)
    
    return report
  }
  
  /**
   * Log security event with detailed context
   */
  async logSecurityEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved' | 'resolved_by' | 'resolved_at' | 'notes'>,
    request?: Request
  ): Promise<void> {
    try {
      const securityEvent: SecurityEvent = {
        ...event,
        timestamp: new Date().toISOString(),
        resolved: false,
        resolved_by: null,
        resolved_at: null,
        notes: null,
        ip_address: request ? this.extractIPAddress(request) : null,
        user_agent: request ? request.headers.get('user-agent') : null
      }
      
      // Store in security events table (would need to be created)
      // For now, we'll log to CSV imports table as extended error data
      await this.supabase
        .from('csv_imports')
        .update({
          errors: {
            security_event: securityEvent,
            logged_at: new Date().toISOString()
          }
        })
        .eq('id', event.import_id || 'system')
      
      // Log to console for monitoring
      console.warn('SECURITY EVENT:', JSON.stringify(securityEvent, null, 2))
      
      // For high/critical events, could trigger alerts
      if (event.severity === 'high' || event.severity === 'critical') {
        await this.triggerSecurityAlert(securityEvent)
      }
      
    } catch (error) {
      console.error('Failed to log security event:', error)
    }
  }
  
  /**
   * Create audit log entry
   */
  async createAuditLog(
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
    request?: Request
  ): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
        ip_address: request ? this.extractIPAddress(request) : null,
        user_agent: request ? request.headers.get('user-agent') : null
      }
      
      // Store audit log (would need dedicated table)
      // For now, we'll use a simplified approach
      console.log('AUDIT LOG:', JSON.stringify(auditEntry, null, 2))
      
    } catch (error) {
      console.error('Failed to create audit log:', error)
    }
  }
  
  /**
   * Get error statistics for monitoring dashboard
   */
  async getErrorStatistics(
    timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    totalImports: number
    failedImports: number
    errorRate: number
    commonErrors: Array<{ error: string; count: number }>
    securityEvents: Array<{ type: string; count: number; severity: string }>
  }> {
    const timeframeDays = {
      hour: 1/24,
      day: 1,
      week: 7,
      month: 30
    }
    
    const cutoffDate = new Date(Date.now() - (timeframeDays[timeframe] * 24 * 60 * 60 * 1000))
    
    try {
      // Get import statistics
      const { data: imports, error } = await this.supabase
        .from('csv_imports')
        .select('status, errors')
        .gte('created_at', cutoffDate.toISOString())
      
      if (error) {
        throw new Error(`Failed to fetch statistics: ${error.message}`)
      }
      
      const totalImports = imports?.length || 0
      const failedImports = imports?.filter(i => i.status === 'failed').length || 0
      const errorRate = totalImports > 0 ? (failedImports / totalImports) * 100 : 0
      
      // Analyze common errors (simplified)
      const errorCounts = new Map<string, number>()
      const securityEventCounts = new Map<string, { count: number; severity: string }>()
      
      imports?.forEach(imp => {
        if (imp.errors?.errors) {
          imp.errors.errors.forEach((error: ValidationError) => {
            const normalized = this.normalizeError(error.error)
            errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1)
          })
        }
        
        if (imp.errors?.security_event) {
          const event = imp.errors.security_event
          const key = `${event.event_type}_${event.severity}`
          securityEventCounts.set(key, {
            count: (securityEventCounts.get(key)?.count || 0) + 1,
            severity: event.severity
          })
        }
      })
      
      const commonErrors = Array.from(errorCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([error, count]) => ({ error, count }))
      
      const securityEvents = Array.from(securityEventCounts.entries())
        .map(([type, data]) => ({
          type: type.split('_')[0],
          count: data.count,
          severity: data.severity
        }))
      
      return {
        totalImports,
        failedImports,
        errorRate,
        commonErrors,
        securityEvents
      }
      
    } catch (error) {
      console.error('Failed to get error statistics:', error)
      return {
        totalImports: 0,
        failedImports: 0,
        errorRate: 0,
        commonErrors: [],
        securityEvents: []
      }
    }
  }
  
  /**
   * Generate user-friendly error recommendations
   */
  private generateRecommendations(
    topErrors: Array<{ error: string; count: number; fields: string[] }>,
    categories: Record<string, number>,
    metadata: { filename: string; totalRows: number; processedRows: number }
  ): string[] {
    const recommendations: string[] = []
    
    // Format-related recommendations
    if (categories.format > 0) {
      recommendations.push('Check date formats - ensure DD/MM/YYYY format is used consistently')
      recommendations.push('Verify currency values use £ symbol and comma separators (e.g., £1,234.56)')
    }
    
    // Validation recommendations
    if (categories.validation > 0) {
      recommendations.push('Review LEX references - they must follow LEX2025-001 format')
      recommendations.push('Check email addresses are valid and properly formatted')
    }
    
    // Constraint recommendations
    if (categories.constraint > 0) {
      recommendations.push('Ensure all required fields are populated')
      recommendations.push('Check text lengths - some fields may exceed maximum limits')
    }
    
    // Specific error recommendations
    topErrors.forEach(error => {
      if (error.error.includes('date')) {
        recommendations.push(`Fix date issues in fields: ${error.fields.join(', ')}`)
      } else if (error.error.includes('currency')) {
        recommendations.push(`Correct currency format in fields: ${error.fields.join(', ')}`)
      } else if (error.error.includes('required')) {
        recommendations.push(`Complete missing data in fields: ${error.fields.join(', ')}`)
      }
    })
    
    // Performance recommendations
    if (metadata.totalRows > 10000) {
      recommendations.push('Consider splitting large files into smaller batches for better performance')
    }
    
    return [...new Set(recommendations)] // Remove duplicates
  }
  
  /**
   * Identify potential security concerns
   */
  private identifySecurityConcerns(
    errors: ValidationError[],
    warnings: ValidationError[],
    metadata: { filename: string; totalRows: number; processedRows: number }
  ): Array<{
    concern: string
    severity: 'low' | 'medium' | 'high'
    description: string
    recommendation: string
  }> {
    const concerns: Array<{
      concern: string
      severity: 'low' | 'medium' | 'high'
      description: string
      recommendation: string
    }> = []
    
    // Check for suspicious file patterns
    if (metadata.filename.includes('..') || metadata.filename.includes('/')) {
      concerns.push({
        concern: 'Suspicious filename',
        severity: 'high',
        description: 'Filename contains path traversal characters',
        recommendation: 'Rename file without path characters'
      })
    }
    
    // Check for potential injection attempts
    const injectionPatterns = ['<script', 'javascript:', 'data:', 'vbscript:', 'onload=']
    let suspiciousContent = 0
    
    errors.forEach(error => {
      if (typeof error.value === 'string') {
        injectionPatterns.forEach(pattern => {
          if (error.value.toLowerCase().includes(pattern)) {
            suspiciousContent++
          }
        })
      }
    })
    
    if (suspiciousContent > 0) {
      concerns.push({
        concern: 'Potential injection attempts',
        severity: 'high',
        description: `Found ${suspiciousContent} instances of potentially malicious content`,
        recommendation: 'Review file for malicious content and clean data'
      })
    }
    
    // Check for unusually high error rate
    const errorRate = (errors.length / metadata.totalRows) * 100
    if (errorRate > 50) {
      concerns.push({
        concern: 'High error rate',
        severity: 'medium',
        description: `${errorRate.toFixed(1)}% of rows contain errors`,
        recommendation: 'Verify file integrity and data source'
      })
    }
    
    // Check for file size anomalies
    if (metadata.totalRows > 50000) {
      concerns.push({
        concern: 'Large file upload',
        severity: 'low',
        description: 'File contains unusually large number of rows',
        recommendation: 'Monitor for performance impact and consider rate limiting'
      })
    }
    
    return concerns
  }
  
  /**
   * Normalize error messages for grouping
   */
  private normalizeError(error: string): string {
    return error
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/['"]/g, '') // Remove quotes
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase()
  }
  
  /**
   * Sanitize sensitive values for logging
   */
  private sanitizeValue(value: any): string {
    if (typeof value !== 'string') {
      return '[complex value]'
    }
    
    // Truncate long values
    const truncated = value.length > 50 ? value.substring(0, 47) + '...' : value
    
    // Mask potential sensitive data
    return truncated
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card]')
      .replace(/\b\d{9,11}\b/g, '[phone]')
  }
  
  /**
   * Store error report in database
   */
  private async storeErrorReport(importId: string, report: ErrorReport): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('csv_imports')
        .update({
          errors: {
            report,
            generated_at: new Date().toISOString()
          }
        })
        .eq('id', importId)
      
      if (error) {
        console.error(`Failed to store error report for ${importId}:`, error)
      }
    } catch (error) {
      console.error(`Error report storage failed for ${importId}:`, error)
    }
  }
  
  /**
   * Extract IP address from request
   */
  private extractIPAddress(request: Request): string | null {
    // Try various headers for IP address
    const headers = [
      'x-forwarded-for',
      'x-real-ip',
      'x-client-ip',
      'cf-connecting-ip',
      'fastly-client-ip',
      'x-cluster-client-ip'
    ]
    
    for (const header of headers) {
      const value = request.headers.get(header)
      if (value) {
        // Handle comma-separated IPs (take first one)
        return value.split(',')[0].trim()
      }
    }
    
    return null
  }
  
  /**
   * Trigger security alert for high severity events
   */
  private async triggerSecurityAlert(event: SecurityEvent): Promise<void> {
    // In production, this would send alerts via email, Slack, etc.
    console.error('HIGH SEVERITY SECURITY EVENT:', {
      type: event.event_type,
      severity: event.severity,
      user: event.user_email,
      details: event.details,
      timestamp: event.timestamp
    })
    
    // Could implement:
    // - Email notifications
    // - Slack webhooks
    // - PagerDuty alerts
    // - Security team notifications
  }
}

// Singleton instance
export const errorReporter = new ErrorReportingService()

// Convenience functions
export async function logSecurityEvent(
  eventType: SecurityEvent['event_type'],
  severity: SecurityEvent['severity'],
  details: Record<string, any>,
  userId?: string,
  userEmail?: string,
  importId?: string,
  request?: Request
): Promise<void> {
  return errorReporter.logSecurityEvent({
    event_type: eventType,
    severity,
    user_id: userId || null,
    user_email: userEmail || null,
    import_id: importId || null,
    details
  }, request)
}

export async function createAuditLog(
  action: AuditLogEntry['action'],
  userId: string,
  userEmail: string,
  resourceType: AuditLogEntry['resource_type'],
  resourceId: string | null,
  details: Record<string, any>,
  success: boolean,
  request?: Request
): Promise<void> {
  return errorReporter.createAuditLog({
    user_id: userId,
    user_email: userEmail,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
    success
  }, request)
}

export { errorReporter }