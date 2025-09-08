import { z } from 'zod'

// UK-specific validation patterns
export const UK_PATTERNS = {
  // LEX reference format: LEX2025-001 to LEX2025-999999
  lexReference: /^LEX[0-9]{4}-[0-9]{3,6}$/,
  
  // UK date formats: DD/MM/YYYY (primary) and MM/DD/YYYY (legacy support)
  ukDate: /^(0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/([0-9]{4})$/,
  usDate: /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12][0-9]|3[01])\/([0-9]{4})$/,
  
  // UK currency: £1,234.56 or 1234.56 or £1234.56
  currency: /^£?([0-9]{1,3}(,[0-9]{3})*|[0-9]+)(\.[0-9]{2})?$/,
  
  // UK phone: +44... or 01... or 02... or 03... or 07... or 08... or 09...
  ukPhone: /^(\+44|0)[1-9][0-9]{8,9}$/,
  
  // UK company number: 8 digits or 2 letters followed by 6 digits
  companyNumber: /^([0-9]{8}|[A-Z]{2}[0-9]{6})$/,
  
  // Email (RFC compliant)
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  
  // Safe filename (prevents path traversal)
  safeFilename: /^[a-zA-Z0-9._-]+\.csv$/i
} as const

// Security validation schemas
export const securitySchemas = {
  // File upload validation
  fileUpload: z.object({
    name: z.string().regex(UK_PATTERNS.safeFilename, 'Invalid filename - only CSV files allowed'),
    size: z.number().min(1, 'File cannot be empty').max(50 * 1024 * 1024, 'File too large - max 50MB'),
    type: z.string().refine(type => 
      ['text/csv', 'application/csv', 'text/plain'].includes(type),
      'Invalid file type - only CSV files allowed'
    )
  }),
  
  // LEX import row validation
  lexImportRow: z.object({
    Client: z.string()
      .min(1, 'Client name is required')
      .max(255, 'Client name too long')
      .regex(/^[a-zA-Z0-9\s\-'&.,()]+$/, 'Client name contains invalid characters'),
    
    'Matter Description': z.string()
      .min(1, 'Matter description is required')
      .max(1000, 'Matter description too long'),
    
    'Fee Earner': z.string()
      .min(1, 'Fee earner is required')
      .max(255, 'Fee earner name too long')
      .regex(/^[a-zA-Z\s\-'.()QKC]+$/, 'Fee earner name contains invalid characters'),
    
    'Date Received': z.string()
      .min(1, 'Date received is required')
      .refine(date => UK_PATTERNS.ukDate.test(date) || UK_PATTERNS.usDate.test(date), 
        'Invalid date format - use DD/MM/YYYY'),
    
    Value: z.string()
      .regex(UK_PATTERNS.currency, 'Invalid currency format - use £1,234.56'),
    
    Status: z.enum(['New', 'Assigned', 'In Progress', 'Converted', 'Lost'], {
      errorMap: () => ({ message: 'Status must be: New, Assigned, In Progress, Converted, or Lost' })
    }),
    
    Reference: z.string()
      .regex(UK_PATTERNS.lexReference, 'Invalid LEX reference - use format LEX2025-001')
  }),
  
  // Client data validation
  client: z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['Individual', 'Company', 'Solicitor']),
    email: z.string().regex(UK_PATTERNS.email).nullable().optional(),
    phone: z.string().regex(UK_PATTERNS.ukPhone).nullable().optional(),
    company_number: z.string().regex(UK_PATTERNS.companyNumber).nullable().optional()
  })
} as const

// Date parsing with UK format priority
export function parseUKDate(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') return null
  
  // Remove whitespace
  const clean = dateString.trim()
  
  // Try UK format first: DD/MM/YYYY
  const ukMatch = clean.match(UK_PATTERNS.ukDate)
  if (ukMatch) {
    const [, day, month, year] = ukMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    
    // Validate the date is real (handles Feb 30th etc)
    if (date.getDate() === parseInt(day) && 
        date.getMonth() === parseInt(month) - 1 && 
        date.getFullYear() === parseInt(year)) {
      return date
    }
  }
  
  // Try US format as fallback: MM/DD/YYYY
  const usMatch = clean.match(UK_PATTERNS.usDate)
  if (usMatch) {
    const [, month, day, year] = usMatch
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    
    if (date.getDate() === parseInt(day) && 
        date.getMonth() === parseInt(month) - 1 && 
        date.getFullYear() === parseInt(year)) {
      return date
    }
  }
  
  return null
}

// Currency parsing with UK format support
export function parseUKCurrency(currencyString: string): number | null {
  if (!currencyString || typeof currencyString !== 'string') return null
  
  // Remove whitespace and convert to string
  const clean = currencyString.trim()
  
  // Check format
  if (!UK_PATTERNS.currency.test(clean)) return null
  
  // Remove £ symbol and commas
  const numericString = clean.replace(/[£,]/g, '')
  
  const value = parseFloat(numericString)
  
  // Validate positive number
  if (isNaN(value) || value < 0) return null
  
  return value
}

// Fee earner name normalization
export function normalizeFeeEarnerName(name: string): string {
  if (!name || typeof name !== 'string') return ''
  
  return name
    .trim()
    // Standardize titles
    .replace(/\bQ\.?C\.?\b/gi, 'QC')
    .replace(/\bK\.?C\.?\b/gi, 'KC')
    .replace(/\bMr\.?\s+/gi, '')
    .replace(/\bMrs\.?\s+/gi, '')
    .replace(/\bMs\.?\s+/gi, '')
    .replace(/\bDr\.?\s+/gi, 'Dr ')
    // Clean up spacing
    .replace(/\s+/g, ' ')
    .trim()
}

// Validation error types for detailed reporting
export interface ValidationError {
  row: number
  field: string
  value: any
  error: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  isValid: boolean
  data?: any
  errors: ValidationError[]
  warnings: ValidationError[]
}

// Comprehensive row validator
export function validateLEXImportRow(row: any, rowNumber: number): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []
  
  try {
    // Basic schema validation
    const result = securitySchemas.lexImportRow.safeParse(row)
    
    if (!result.success) {
      result.error.errors.forEach(err => {
        errors.push({
          row: rowNumber,
          field: err.path.join('.'),
          value: row[err.path[0]],
          error: err.message,
          severity: 'error'
        })
      })
    }
    
    // Additional business logic validation
    if (result.success) {
      const data = result.data
      
      // Date validation with specific error messages
      const parsedDate = parseUKDate(data['Date Received'])
      if (!parsedDate) {
        errors.push({
          row: rowNumber,
          field: 'Date Received',
          value: data['Date Received'],
          error: 'Could not parse date - use DD/MM/YYYY format',
          severity: 'error'
        })
      } else if (parsedDate > new Date()) {
        warnings.push({
          row: rowNumber,
          field: 'Date Received',
          value: data['Date Received'],
          error: 'Future date detected - please verify',
          severity: 'warning'
        })
      }
      
      // Currency validation
      const parsedValue = parseUKCurrency(data.Value)
      if (!parsedValue) {
        errors.push({
          row: rowNumber,
          field: 'Value',
          value: data.Value,
          error: 'Could not parse currency value',
          severity: 'error'
        })
      } else if (parsedValue > 10000000) { // £10M limit
        warnings.push({
          row: rowNumber,
          field: 'Value',
          value: data.Value,
          error: 'Very high value detected - please verify',
          severity: 'warning'
        })
      }
      
      // Fee earner normalization check
      const normalizedFeeEarner = normalizeFeeEarnerName(data['Fee Earner'])
      if (normalizedFeeEarner !== data['Fee Earner']) {
        warnings.push({
          row: rowNumber,
          field: 'Fee Earner',
          value: data['Fee Earner'],
          error: `Name will be normalized to: ${normalizedFeeEarner}`,
          severity: 'warning'
        })
      }
    }
    
    return {
      isValid: errors.length === 0,
      data: result.success ? result.data : undefined,
      errors,
      warnings
    }
    
  } catch (error) {
    // Catch any unexpected errors
    errors.push({
      row: rowNumber,
      field: 'unknown',
      value: row,
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'error'
    })
    
    return {
      isValid: false,
      errors,
      warnings
    }
  }
}

// Batch validation for performance
export function validateLEXImportBatch(rows: any[]): {
  validRows: any[]
  invalidRows: any[]
  errors: ValidationError[]
  warnings: ValidationError[]
  summary: {
    total: number
    valid: number
    invalid: number
    errorCount: number
    warningCount: number
  }
} {
  const validRows: any[] = []
  const invalidRows: any[] = []
  const allErrors: ValidationError[] = []
  const allWarnings: ValidationError[] = []
  
  rows.forEach((row, index) => {
    const validation = validateLEXImportRow(row, index + 2) // +2 for header + 1-based indexing
    
    if (validation.isValid && validation.data) {
      validRows.push(validation.data)
    } else {
      invalidRows.push(row)
    }
    
    allErrors.push(...validation.errors)
    allWarnings.push(...validation.warnings)
  })
  
  return {
    validRows,
    invalidRows,
    errors: allErrors,
    warnings: allWarnings,
    summary: {
      total: rows.length,
      valid: validRows.length,
      invalid: invalidRows.length,
      errorCount: allErrors.length,
      warningCount: allWarnings.length
    }
  }
}