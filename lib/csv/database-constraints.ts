import { z } from 'zod'
import { UK_PATTERNS } from './validation'

/**
 * Database constraint validation schemas that mirror SQL constraints
 * These provide first-line validation before database operations
 */

// Core database field constraints
export const dbConstraints = {
  // Text length constraints (matching SQL schema)
  shortText: z.string().max(255, 'Text too long - maximum 255 characters'),
  mediumText: z.string().max(1000, 'Text too long - maximum 1000 characters'),
  longText: z.string().max(5000, 'Text too long - maximum 5000 characters'),
  
  // Email validation (RFC compliant)
  email: z.string()
    .max(255, 'Email too long')
    .regex(UK_PATTERNS.email, 'Invalid email format')
    .or(z.literal('')),
  
  // UK phone validation
  ukPhone: z.string()
    .max(50, 'Phone number too long')
    .regex(UK_PATTERNS.ukPhone, 'Invalid UK phone number format')
    .or(z.literal('')),
  
  // UK company number validation
  companyNumber: z.string()
    .max(20, 'Company number too long')
    .regex(UK_PATTERNS.companyNumber, 'Invalid UK company number format')
    .or(z.literal('')),
  
  // LEX reference validation
  lexReference: z.string()
    .max(50, 'LEX reference too long')
    .regex(UK_PATTERNS.lexReference, 'Invalid LEX reference format'),
  
  // Currency validation (positive values only)
  currency: z.number()
    .min(0, 'Amount must be positive')
    .max(999999999.99, 'Amount too large'),
  
  // Year validation (for year_of_call)
  year: z.number()
    .int('Year must be an integer')
    .min(1800, 'Year too early')
    .max(new Date().getFullYear(), 'Year cannot be in the future'),
  
  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),
  
  // Enum validation helpers
  clientType: z.enum(['Individual', 'Company', 'Solicitor'], {
    errorMap: () => ({ message: 'Client type must be Individual, Company, or Solicitor' })
  }),
  
  enquirySource: z.enum(['Email', 'Phone', 'Website', 'Referral', 'Direct'], {
    errorMap: () => ({ message: 'Invalid enquiry source' })
  }),
  
  enquiryStatus: z.enum(['New', 'Assigned', 'In Progress', 'Converted', 'Lost'], {
    errorMap: () => ({ message: 'Invalid enquiry status' })
  }),
  
  urgency: z.enum(['Immediate', 'This Week', 'This Month', 'Flexible'], {
    errorMap: () => ({ message: 'Invalid urgency level' })
  }),
  
  seniority: z.enum(['Pupil', 'Junior', 'Middle', 'Senior', 'KC'], {
    errorMap: () => ({ message: 'Invalid seniority level' })
  }),
  
  userRole: z.enum(['barrister', 'clerk', 'admin', 'read_only'], {
    errorMap: () => ({ message: 'Invalid user role' })
  }),
  
  csvImportType: z.enum(['enquiries', 'clients', 'matters', 'fees'], {
    errorMap: () => ({ message: 'Invalid CSV import type' })
  }),
  
  csvImportStatus: z.enum(['pending', 'processing', 'completed', 'failed'], {
    errorMap: () => ({ message: 'Invalid import status' })
  })
} as const

// Full table validation schemas matching database constraints
export const tableSchemas = {
  // Profiles table validation
  profile: z.object({
    id: dbConstraints.uuid,
    email: dbConstraints.email.refine(val => val !== '', 'Email is required'),
    full_name: dbConstraints.shortText.min(1, 'Full name is required'),
    role: dbConstraints.userRole,
    is_active: z.boolean().default(true),
    avatar_url: z.string().url().optional().or(z.literal('')),
    phone: dbConstraints.ukPhone.optional()
  }),
  
  // Barristers table validation
  barrister: z.object({
    id: dbConstraints.uuid.optional(),
    profile_id: dbConstraints.uuid.optional(),
    name: dbConstraints.shortText.min(1, 'Name is required'),
    email: dbConstraints.email.refine(val => val !== '', 'Email is required'),
    year_of_call: dbConstraints.year.optional(),
    practice_areas: z.array(z.string().max(100)).default([]),
    seniority: dbConstraints.seniority,
    is_active: z.boolean().default(true),
    engagement_score: z.number().min(0).max(100).default(0),
    current_workload: z.number().int().min(0).default(0),
    max_workload: z.number().int().min(1).default(20),
    phone: dbConstraints.ukPhone.optional(),
    clerk_notes: dbConstraints.longText.optional()
  }),
  
  // Clerks table validation
  clerk: z.object({
    id: dbConstraints.uuid.optional(),
    profile_id: dbConstraints.uuid.optional(),
    name: dbConstraints.shortText.min(1, 'Name is required'),
    email: dbConstraints.email.refine(val => val !== '', 'Email is required'),
    team: dbConstraints.shortText.optional(),
    is_senior: z.boolean().default(false),
    max_workload: z.number().int().min(1).default(20),
    current_workload: z.number().int().min(0).default(0),
    avg_response_time_hours: z.number().min(0).default(0),
    assignment_count: z.number().int().min(0).default(0),
    phone: dbConstraints.ukPhone.optional(),
    notes: dbConstraints.longText.optional()
  }),
  
  // Clients table validation
  client: z.object({
    id: dbConstraints.uuid.optional(),
    name: dbConstraints.shortText.min(1, 'Client name is required'),
    type: dbConstraints.clientType,
    email: dbConstraints.email.optional(),
    phone: dbConstraints.ukPhone.optional(),
    company_number: dbConstraints.companyNumber.optional(),
    total_value: dbConstraints.currency.default(0),
    matter_count: z.number().int().min(0).default(0),
    first_instruction: z.string().datetime().optional(),
    last_instruction: z.string().datetime().optional()
  }),
  
  // Enquiries table validation
  enquiry: z.object({
    id: dbConstraints.uuid.optional(),
    lex_reference: dbConstraints.lexReference.optional(),
    client_id: dbConstraints.uuid,
    source: dbConstraints.enquirySource,
    practice_area: dbConstraints.shortText.optional(),
    matter_type: dbConstraints.shortText.optional(),
    description: dbConstraints.longText.optional(),
    estimated_value: dbConstraints.currency.optional(),
    urgency: dbConstraints.urgency,
    status: dbConstraints.enquiryStatus,
    assigned_clerk_id: dbConstraints.uuid.optional(),
    assigned_barrister_id: dbConstraints.uuid.optional(),
    received_at: z.string().datetime(),
    responded_at: z.string().datetime().optional(),
    converted_at: z.string().datetime().optional(),
    response_time_hours: z.number().min(0).optional(),
    conversion_probability: z.number().min(0).max(100).optional()
  }),
  
  // CSV imports table validation
  csvImport: z.object({
    id: dbConstraints.uuid.optional(),
    filename: dbConstraints.shortText.min(1, 'Filename is required')
      .regex(/^[a-zA-Z0-9._-]+\.csv$/i, 'Invalid filename format'),
    type: dbConstraints.csvImportType,
    status: dbConstraints.csvImportStatus,
    total_rows: z.number().int().min(0).optional(),
    processed_rows: z.number().int().min(0).default(0),
    error_rows: z.number().int().min(0).default(0),
    errors: z.any().optional(), // JSON field
    started_at: z.string().datetime().optional(),
    completed_at: z.string().datetime().optional()
  })
} as const

// Validation helper functions
export class DatabaseValidator {
  
  /**
   * Validate data against table schema with detailed error reporting
   */
  static validate<T extends keyof typeof tableSchemas>(
    table: T,
    data: unknown
  ): {
    success: boolean
    data?: z.infer<typeof tableSchemas[T]>
    errors: Array<{
      field: string
      message: string
      code: string
    }>
  } {
    const schema = tableSchemas[table]
    const result = schema.safeParse(data)
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
        errors: []
      }
    }
    
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }))
    
    return {
      success: false,
      errors
    }
  }
  
  /**
   * Validate required fields are present and not empty
   */
  static validateRequired<T extends Record<string, any>>(
    data: T,
    requiredFields: (keyof T)[]
  ): { field: string; message: string }[] {
    const errors: { field: string; message: string }[] = []
    
    for (const field of requiredFields) {
      const value = data[field]
      if (value === undefined || value === null || value === '') {
        errors.push({
          field: String(field),
          message: `${String(field)} is required`
        })
      }
    }
    
    return errors
  }
  
  /**
   * Sanitize string data to prevent injection and ensure length limits
   */
  static sanitizeString(
    input: unknown,
    maxLength: number = 255,
    allowEmpty: boolean = true
  ): string {
    if (input === null || input === undefined) {
      return allowEmpty ? '' : ''
    }
    
    let str = String(input).trim()
    
    // Remove potentially dangerous characters
    str = str.replace(/[\x00-\x1F\x7F]/g, '') // Control characters
    str = str.replace(/[<>]/g, '') // HTML brackets
    
    // Truncate to max length
    if (str.length > maxLength) {
      str = str.substring(0, maxLength).trim()
    }
    
    return str
  }
  
  /**
   * Validate and sanitize numeric input
   */
  static sanitizeNumber(
    input: unknown,
    min: number = 0,
    max: number = Number.MAX_SAFE_INTEGER,
    allowNull: boolean = false
  ): number | null {
    if (input === null || input === undefined || input === '') {
      return allowNull ? null : 0
    }
    
    const num = typeof input === 'number' ? input : parseFloat(String(input))
    
    if (isNaN(num)) {
      return allowNull ? null : 0
    }
    
    // Clamp to valid range
    return Math.max(min, Math.min(max, num))
  }
  
  /**
   * Validate UUID format
   */
  static isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
  }
  
  /**
   * Validate email format using UK patterns
   */
  static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false
    return UK_PATTERNS.email.test(email.trim())
  }
  
  /**
   * Validate UK phone format
   */
  static isValidUKPhone(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false
    return UK_PATTERNS.ukPhone.test(phone.trim())
  }
  
  /**
   * Validate LEX reference format
   */
  static isValidLEXReference(reference: string): boolean {
    if (!reference || typeof reference !== 'string') return false
    return UK_PATTERNS.lexReference.test(reference.trim())
  }
  
  /**
   * Batch validate multiple records
   */
  static validateBatch<T extends keyof typeof tableSchemas>(
    table: T,
    records: unknown[]
  ): {
    validRecords: z.infer<typeof tableSchemas[T]>[]
    invalidRecords: Array<{
      index: number
      data: unknown
      errors: Array<{ field: string; message: string; code: string }>
    }>
    summary: {
      total: number
      valid: number
      invalid: number
    }
  } {
    const validRecords: z.infer<typeof tableSchemas[T]>[] = []
    const invalidRecords: Array<{
      index: number
      data: unknown
      errors: Array<{ field: string; message: string; code: string }>
    }> = []
    
    records.forEach((record, index) => {
      const validation = this.validate(table, record)
      
      if (validation.success && validation.data) {
        validRecords.push(validation.data)
      } else {
        invalidRecords.push({
          index,
          data: record,
          errors: validation.errors
        })
      }
    })
    
    return {
      validRecords,
      invalidRecords,
      summary: {
        total: records.length,
        valid: validRecords.length,
        invalid: invalidRecords.length
      }
    }
  }
}

// Export commonly used validators
export const isValidUUID = DatabaseValidator.isValidUUID
export const isValidEmail = DatabaseValidator.isValidEmail
export const isValidUKPhone = DatabaseValidator.isValidUKPhone
export const isValidLEXReference = DatabaseValidator.isValidLEXReference
export const sanitizeString = DatabaseValidator.sanitizeString
export const sanitizeNumber = DatabaseValidator.sanitizeNumber

// Export for use in API routes
export default DatabaseValidator