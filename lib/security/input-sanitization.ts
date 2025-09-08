import DOMPurify from 'isomorphic-dompurify'
import { z } from 'zod'

export interface SanitizationConfig {
  allowHtml?: boolean
  allowedTags?: string[]
  allowedAttributes?: Record<string, string[]>
  maxLength?: number
  trimWhitespace?: boolean
}

const defaultConfig: SanitizationConfig = {
  allowHtml: false,
  allowedTags: [],
  allowedAttributes: {},
  maxLength: 10000,
  trimWhitespace: true
}

export class InputSanitizer {
  private config: SanitizationConfig

  constructor(config: Partial<SanitizationConfig> = {}) {
    this.config = { ...defaultConfig, ...config }
  }

  sanitizeString(input: unknown): string {
    if (typeof input !== 'string') {
      return ''
    }

    let sanitized = input

    if (this.config.trimWhitespace) {
      sanitized = sanitized.trim()
    }

    if (this.config.maxLength && sanitized.length > this.config.maxLength) {
      sanitized = sanitized.substring(0, this.config.maxLength)
    }

    if (this.config.allowHtml) {
      sanitized = DOMPurify.sanitize(sanitized, {
        ALLOWED_TAGS: this.config.allowedTags || [],
        ALLOWED_ATTR: Object.keys(this.config.allowedAttributes || {}),
        KEEP_CONTENT: true,
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
        SANITIZE_DOM: true
      })
    } else {
      sanitized = this.escapeHtml(sanitized)
    }

    return sanitized
  }

  sanitizeObject<T extends Record<string, unknown>>(obj: T, fieldConfigs?: Record<keyof T, SanitizationConfig>): T {
    const sanitized = {} as T

    for (const [key, value] of Object.entries(obj)) {
      const fieldConfig = fieldConfigs?.[key as keyof T] || this.config
      const sanitizer = new InputSanitizer(fieldConfig)

      if (typeof value === 'string') {
        sanitized[key as keyof T] = sanitizer.sanitizeString(value) as T[keyof T]
      } else if (Array.isArray(value)) {
        sanitized[key as keyof T] = value.map(item => 
          typeof item === 'string' ? sanitizer.sanitizeString(item) : item
        ) as T[keyof T]
      } else if (value && typeof value === 'object') {
        sanitized[key as keyof T] = sanitizer.sanitizeObject(value as Record<string, unknown>) as T[keyof T]
      } else {
        sanitized[key as keyof T] = value as T[keyof T]
      }
    }

    return sanitized
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\//g, "&#x2F;")
  }

  validateAndSanitize<T>(input: unknown, schema: z.ZodSchema<T>): { success: true; data: T } | { success: false; error: string } {
    try {
      let sanitizedInput = input

      if (typeof input === 'string') {
        sanitizedInput = this.sanitizeString(input)
      } else if (input && typeof input === 'object') {
        sanitizedInput = this.sanitizeObject(input as Record<string, unknown>)
      }

      const result = schema.safeParse(sanitizedInput)
      
      if (!result.success) {
        return { 
          success: false, 
          error: result.error.issues.map(issue => issue.message).join(', ')
        }
      }

      return { success: true, data: result.data }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      }
    }
  }
}

export const legalTextSanitizer = new InputSanitizer({
  allowHtml: false,
  maxLength: 50000,
  trimWhitespace: true
})

export const clientDataSanitizer = new InputSanitizer({
  allowHtml: false,
  maxLength: 1000,
  trimWhitespace: true
})

export const searchQuerySanitizer = new InputSanitizer({
  allowHtml: false,
  maxLength: 500,
  trimWhitespace: true
})

export const basicTextSanitizer = new InputSanitizer({
  allowHtml: false,
  maxLength: 5000,
  trimWhitespace: true
})

export function sanitizeEnquiryData(data: unknown) {
  const fieldConfigs = {
    client_name: { maxLength: 200, trimWhitespace: true, allowHtml: false },
    client_company: { maxLength: 200, trimWhitespace: true, allowHtml: false },
    description: { maxLength: 10000, trimWhitespace: true, allowHtml: false },
    matter_type: { maxLength: 100, trimWhitespace: true, allowHtml: false },
    email: { maxLength: 320, trimWhitespace: true, allowHtml: false },
    phone: { maxLength: 50, trimWhitespace: true, allowHtml: false },
    notes: { maxLength: 20000, trimWhitespace: true, allowHtml: false }
  }

  return clientDataSanitizer.sanitizeObject(data as Record<string, unknown>, fieldConfigs)
}

export function sanitizeTaskData(data: unknown) {
  const fieldConfigs = {
    title: { maxLength: 500, trimWhitespace: true, allowHtml: false },
    description: { maxLength: 5000, trimWhitespace: true, allowHtml: false },
    client_name: { maxLength: 200, trimWhitespace: true, allowHtml: false },
    enquiry_reference: { maxLength: 50, trimWhitespace: true, allowHtml: false }
  }

  return basicTextSanitizer.sanitizeObject(data as Record<string, unknown>, fieldConfigs)
}

export function createSecureDisplayText(text: string, maxLength: number = 1000): string {
  if (!text || typeof text !== 'string') return ''
  
  const sanitized = basicTextSanitizer.sanitizeString(text)
  return sanitized.length > maxLength ? `${sanitized.substring(0, maxLength)}...` : sanitized
}

export const validationSchemas = {
  enquiryInput: z.object({
    client_name: z.string().min(1).max(200),
    client_company: z.string().max(200).optional(),
    description: z.string().min(10).max(10000),
    matter_type: z.enum(['Commercial', 'Employment', 'Property', 'Dispute', 'Corporate']),
    email: z.string().email().max(320),
    phone: z.string().max(50).optional(),
    urgency: z.enum(['High', 'Medium', 'Low']),
    estimated_value: z.number().min(0).max(10000000)
  }),

  taskInput: z.object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(5000),
    type: z.enum(['Call', 'Email', 'Research', 'Meeting', 'Proposal', 'Follow-up']),
    priority: z.enum(['High', 'Medium', 'Low']),
    estimated_duration: z.number().min(15).max(480),
    due_date: z.string().datetime()
  }),

  searchQuery: z.object({
    query: z.string().min(1).max(500),
    filters: z.record(z.string()).optional(),
    sortBy: z.string().max(100).optional(),
    limit: z.number().min(1).max(100).optional()
  }),

  userProfile: z.object({
    full_name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    phone: z.string().max(50).optional(),
    role: z.enum(['admin', 'clerk', 'barrister', 'read_only']),
    practice_areas: z.array(z.string().max(100)).optional()
  })
}