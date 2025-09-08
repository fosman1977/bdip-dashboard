// CSV Import/Export Types with proper type safety

export interface CSVImportRecord {
  id: string
  filename: string
  type: 'enquiries' | 'clients' | 'matters' | 'fees'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_rows: number | null
  processed_rows: number
  error_rows: number
  errors: CSVImportErrors | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface CSVImportErrors {
  errors: ValidationError[]
  warnings: ValidationError[]
  summary?: {
    total: number
    valid: number
    invalid: number
    cancelled?: boolean
  }
  cancelled?: boolean
  cancelledBy?: string
  cancelledAt?: string
  reason?: string
}

export interface ValidationError {
  row: number
  field: string
  value: string | number | null
  error: string
  severity: 'error' | 'warning'
}

export interface ProcessingProgress {
  importId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  totalRows: number
  processedRows: number
  errorRows: number
  errors: ValidationError[]
  warnings: ValidationError[]
  startTime: Date
  endTime?: Date
  estimatedCompletion?: Date
}

// LEX Import/Export specific types
export interface LEXImportRow {
  Client: string
  'Matter Description': string
  'Fee Earner': string
  'Date Received': string
  Value: string
  Status: string
  Reference: string
}

export interface LEXExportRow {
  Reference: string
  Status: string
  'Assigned To': string
  'Response Date': string
  Notes: string
}

// Database insert types
export interface ClientInsert {
  name: string
  type: 'Individual' | 'Company' | 'Solicitor'
  email?: string | null
  phone?: string | null
  company_number?: string | null
  total_value?: number
  matter_count?: number
  first_instruction?: string | null
  last_instruction?: string | null
}

export interface EnquiryInsert {
  lex_reference?: string | null
  client_id: string
  source: 'Email' | 'Phone' | 'Website' | 'Referral' | 'Direct'
  practice_area?: string | null
  matter_type?: string | null
  description?: string | null
  estimated_value?: number | null
  urgency: 'Immediate' | 'This Week' | 'This Month' | 'Flexible'
  status: 'New' | 'Assigned' | 'In Progress' | 'Converted' | 'Lost'
  assigned_clerk_id?: string | null
  assigned_barrister_id?: string | null
  received_at: string
  responded_at?: string | null
  converted_at?: string | null
  response_time_hours?: number | null
  conversion_probability?: number | null
}

export interface BarristerLookup {
  id: string
  name: string
  practice_areas: string[]
  seniority: 'Pupil' | 'Junior' | 'Middle' | 'Senior' | 'KC'
  current_workload: number
  max_workload: number
  is_active: boolean
}

// CSV Processing configuration
export interface CSVProcessorConfig {
  maxFileSize: number
  maxRows: number
  batchSize: number
  timeout: number
  retryAttempts: number
  retryDelay: number
}

// CSV Processing results
export interface CSVProcessingResult {
  success: boolean
  totalRows: number
  processedRows: number
  errorRows: number
  errors: ValidationError[]
  warnings: ValidationError[]
  duration: number
}

// Export generation types
export interface ExportRequest {
  format: 'csv' | 'xlsx'
  type: 'lex-export' | 'enquiries' | 'clients'
  filters?: {
    status?: string[]
    dateFrom?: string
    dateTo?: string
    practiceArea?: string
  }
}

export interface ExportData {
  filename: string
  content: string
  mimeType: string
  recordCount: number
}

// Audit trail types
export interface AuditContext {
  userId: string
  userRole: string
  userEmail?: string
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, any>
  timestamp: string
  ipAddress?: string
  userAgent?: string
}