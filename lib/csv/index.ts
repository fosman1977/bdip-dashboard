/**
 * CSV Integration System - Main Entry Point
 * 
 * Secure, high-performance CSV processing for UK barristers' chambers
 * with comprehensive validation, real-time progress tracking, and audit logging.
 * 
 * Key Features:
 * - Security-first design with input validation and sanitization
 * - UK-specific data format support (dates, currency, legal titles)
 * - Real-time progress tracking with user permission checks
 * - Comprehensive error reporting and security event logging
 * - Performance optimized with database indexes and batch processing
 * - Full test coverage including security and integration tests
 * 
 * @author CSV Integration Specialist
 * @version 1.0.0
 * @security Implements defense-in-depth security model
 */

// Core processing functions
export {
  validateCSVFile,
  parseCSVStream,
  processLEXImport,
  getImportProgress,
  generateLEXExport,
  initializeCSVImport,
  CSV_CONFIG,
  type ProcessingStatus,
  type ProcessingProgress
} from './processor'

// Validation and UK-specific utilities
export {
  validateLEXImportRow,
  validateLEXImportBatch,
  parseUKDate,
  parseUKCurrency,
  normalizeFeeEarnerName,
  UK_PATTERNS,
  securitySchemas,
  type ValidationError,
  type ValidationResult
} from './validation'

// Database constraints and validation
export {
  DatabaseValidator,
  dbConstraints,
  tableSchemas,
  isValidUUID,
  isValidEmail,
  isValidUKPhone,
  isValidLEXReference,
  sanitizeString,
  sanitizeNumber
} from './database-constraints'

// Progress tracking system
export {
  progressTracker,
  cleanupStaleProgress,
  type ProgressUpdate,
  type ProgressTracker
} from './progress-tracker'

// Error reporting and security logging
export {
  errorReporter,
  logSecurityEvent,
  createAuditLog,
  type SecurityEvent,
  type ErrorReport,
  type AuditLogEntry
} from './error-reporting'

// Performance optimization helpers
export {
  performanceOptimizer,
  optimizeForBulkOperations,
  findClientOptimized,
  findBarristerOptimized,
  checkLEXReferenceExists,
  type PerformanceMetrics,
  type BatchProcessingOptions
} from './performance-helpers'

/**
 * Quick Start Guide:
 * 
 * 1. File Upload & Validation:
 * ```typescript
 * import { validateCSVFile, parseCSVStream } from '@/lib/csv'
 * 
 * const validation = validateCSVFile(file)
 * if (validation.isValid) {
 *   const content = await file.text()
 *   const result = await parseCSVStream(content)
 * }
 * ```
 * 
 * 2. Data Validation:
 * ```typescript
 * import { validateLEXImportBatch } from '@/lib/csv'
 * 
 * const validation = validateLEXImportBatch(csvData)
 * console.log(`Valid: ${validation.validRows.length}, Errors: ${validation.errors.length}`)
 * ```
 * 
 * 3. Processing with Progress Tracking:
 * ```typescript
 * import { initializeCSVImport, processLEXImport, getImportProgress } from '@/lib/csv'
 * 
 * const importId = await initializeCSVImport(filename, 'enquiries')
 * processLEXImport(importId, csvContent) // Async processing
 * 
 * // Check progress
 * const progress = await getImportProgress(importId)
 * console.log(`Progress: ${progress?.progress.percentageComplete}%`)
 * ```
 * 
 * 4. Security Monitoring:
 * ```typescript
 * import { logSecurityEvent } from '@/lib/csv'
 * 
 * await logSecurityEvent(
 *   'file_upload',
 *   'medium',
 *   { filename: 'suspicious.csv', fileSize: 1000000 },
 *   userId,
 *   userEmail
 * )
 * ```
 * 
 * 5. Performance Optimization:
 * ```typescript
 * import { optimizeForBulkOperations, findClientOptimized } from '@/lib/csv'
 * 
 * await optimizeForBulkOperations()
 * const client = await findClientOptimized('Smith & Associates', 'Company')
 * ```
 */

/**
 * Configuration Constants
 */
export const CSV_INTEGRATION_CONFIG = {
  // File limits
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_ROWS: 50000,
  BATCH_SIZE: 500,
  
  // Processing timeouts
  PROCESSING_TIMEOUT: 10 * 60 * 1000, // 10 minutes
  PROGRESS_UPDATE_INTERVAL: 2000, // 2 seconds
  
  // Security settings
  MAX_RETRIES: 3,
  RATE_LIMIT_WINDOW: 60 * 60 * 1000, // 1 hour
  RATE_LIMIT_MAX_REQUESTS: 10,
  
  // Performance settings
  MAX_CONCURRENCY: 3,
  CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  RETENTION_DAYS: 30,
  
  // UK-specific formats
  UK_DATE_FORMAT: 'DD/MM/YYYY',
  UK_CURRENCY_SYMBOL: '£',
  LEX_REFERENCE_FORMAT: 'LEX####-######'
} as const

/**
 * System Status Information
 */
export const CSV_SYSTEM_INFO = {
  version: '1.0.0',
  buildDate: new Date().toISOString(),
  features: [
    'Secure file upload with validation',
    'UK-specific date and currency parsing',
    'Real-time progress tracking',
    'Comprehensive error reporting',
    'Security event logging',
    'Performance optimization',
    'Database constraint validation',
    'LEX system integration',
    'Audit trail maintenance'
  ],
  securityFeatures: [
    'Path traversal protection',
    'Input sanitization',
    'SQL injection prevention',
    'XSS protection',
    'Rate limiting',
    'Authentication required',
    'Role-based access control',
    'Security event monitoring'
  ],
  performanceFeatures: [
    'Streaming CSV parsing',
    'Batch processing',
    'Database query optimization',
    'Fuzzy name matching',
    'Progress tracking',
    'Concurrent processing',
    'Memory efficient',
    'Auto-cleanup'
  ]
} as const