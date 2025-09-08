import * as Papa from 'papaparse'
import { createServiceRoleClient } from '../supabase/server'
import { validateLEXImportBatch, parseUKDate, parseUKCurrency, normalizeFeeEarnerName, type ValidationError } from './validation'
import { withTransaction, safeBulkInsert, CSVTransactionManager } from '../database/transactions'
import { env } from '../env'
import type { LEXImportRow, LEXExportRow, CSVImport } from '../../types'

// CSV Processing Configuration
export const CSV_CONFIG = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxRows: 50000, // Maximum rows to process
  batchSize: 500, // Process in batches for performance
  timeout: 10 * 60 * 1000, // 10 minutes timeout
  retryAttempts: 3,
  retryDelay: 1000 // 1 second
} as const

// Processing status types
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ProcessingProgress {
  importId: string
  status: ProcessingStatus
  totalRows: number
  processedRows: number
  errorRows: number
  errors: ValidationError[]
  warnings: ValidationError[]
  startTime: Date
  endTime?: Date
  estimatedCompletion?: Date
}

// Security-focused file validation
export function validateCSVFile(file: File): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // File type validation
  if (!file.type.includes('csv') && !file.type.includes('text/plain')) {
    errors.push('Invalid file type - only CSV files are allowed')
  }
  
  // File size validation
  if (file.size === 0) {
    errors.push('File is empty')
  } else if (file.size > CSV_CONFIG.maxFileSize) {
    errors.push(`File too large - maximum size is ${CSV_CONFIG.maxFileSize / (1024 * 1024)}MB`)
  }
  
  // File name validation (prevent path traversal)
  if (!/^[a-zA-Z0-9._-]+\.csv$/i.test(file.name)) {
    errors.push('Invalid filename - use only letters, numbers, dots, dashes and underscores')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Stream-based CSV parsing for large files
export function parseCSVStream(csvContent: string): Promise<{
  data: any[]
  errors: Papa.ParseError[]
  meta: Papa.ParseMeta
}> {
  return new Promise((resolve, reject) => {
    try {
      const results = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        trimHeaders: true,
        transformHeader: (header: string) => header.trim(),
        transform: (value: string) => value.trim(),
        error: (error: Papa.ParseError) => {
          console.error('Papa Parse error:', error)
        },
        complete: (results) => {
          // Validate row count
          if (results.data.length > CSV_CONFIG.maxRows) {
            reject(new Error(`Too many rows - maximum ${CSV_CONFIG.maxRows} allowed`))
            return
          }
          
          resolve({
            data: results.data,
            errors: results.errors || [],
            meta: results.meta
          })
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

// Database operations with transaction safety
class SecureCSVProcessor {
  private supabase = createServiceRoleClient()
  private transactionManager: CSVTransactionManager
  private progress: Map<string, ProcessingProgress> = new Map()
  
  constructor() {
    this.transactionManager = new CSVTransactionManager(this.supabase)
  }
  
  // Initialize CSV import job with security validation
  async initializeImport(filename: string, type: CSVImport['type'], userId?: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('csv_imports')
      .insert({
        filename: filename.replace(/[^a-zA-Z0-9._-]/g, '_'), // Sanitize filename
        type,
        status: 'pending',
        total_rows: null,
        processed_rows: 0,
        error_rows: 0,
        errors: null,
        started_at: null,
        completed_at: null
      })
      .select('id')
      .single()
    
    if (error) {
      throw new Error(`Failed to initialize import: ${error.message}`)
    }
    
    return data.id
  }
  
  // Update import progress with validation
  async updateProgress(importId: string, update: Partial<CSVImport>): Promise<void> {
    // Sanitize update data
    const sanitizedUpdate = {
      ...update,
      // Ensure numeric fields are valid
      total_rows: typeof update.total_rows === 'number' ? Math.max(0, update.total_rows) : update.total_rows,
      processed_rows: typeof update.processed_rows === 'number' ? Math.max(0, update.processed_rows) : update.processed_rows,
      error_rows: typeof update.error_rows === 'number' ? Math.max(0, update.error_rows) : update.error_rows
    }
    
    const result = await this.transactionManager.updateImportProgress(importId, sanitizedUpdate)
    if (!result.success) {
      throw result.error || new Error('Failed to update progress')
    }
  }
  
  // Find or create client with deduplication
  async findOrCreateClient(clientData: {
    name: string
    type: 'Individual' | 'Company' | 'Solicitor'
    email?: string
    phone?: string
  }): Promise<string> {
    // Sanitize client name
    const sanitizedName = clientData.name.trim().substring(0, 255)
    
    // Try to find existing client by name (case insensitive)
    const { data: existingClients, error: searchError } = await this.supabase
      .from('clients')
      .select('id')
      .ilike('name', sanitizedName)
      .eq('type', clientData.type)
      .limit(1)
    
    if (searchError) {
      throw new Error(`Client search failed: ${searchError.message}`)
    }
    
    if (existingClients && existingClients.length > 0) {
      return existingClients[0].id
    }
    
    // Create new client
    const { data: newClient, error: createError } = await this.supabase
      .from('clients')
      .insert({
        name: sanitizedName,
        type: clientData.type,
        email: clientData.email?.substring(0, 255) || null,
        phone: clientData.phone?.substring(0, 50) || null,
        total_value: 0,
        matter_count: 0
      })
      .select('id')
      .single()
    
    if (createError) {
      throw new Error(`Client creation failed: ${createError.message}`)
    }
    
    return newClient.id
  }
  
  // Find barrister by name with fuzzy matching
  async findBarristerByName(name: string): Promise<string | null> {
    const normalizedName = normalizeFeeEarnerName(name)
    
    // Try exact match first
    const { data: exactMatch } = await this.supabase
      .from('barristers')
      .select('id')
      .ilike('name', normalizedName)
      .limit(1)
    
    if (exactMatch && exactMatch.length > 0) {
      return exactMatch[0].id
    }
    
    // Try fuzzy match using LIKE with partial name
    const nameParts = normalizedName.split(' ')
    if (nameParts.length > 1) {
      const { data: fuzzyMatch } = await this.supabase
        .from('barristers')
        .select('id')
        .or(nameParts.map(part => `name.ilike.%${part}%`).join(','))
        .limit(1)
      
      if (fuzzyMatch && fuzzyMatch.length > 0) {
        return fuzzyMatch[0].id
      }
    }
    
    return null
  }
  
  // Process LEX import with comprehensive error handling
  async processLEXImport(importId: string, csvContent: string): Promise<ProcessingProgress> {
    const startTime = new Date()
    let progress: ProcessingProgress = {
      importId,
      status: 'processing',
      totalRows: 0,
      processedRows: 0,
      errorRows: 0,
      errors: [],
      warnings: [],
      startTime
    }
    
    this.progress.set(importId, progress)
    
    try {
      // Update status to processing
      await this.updateProgress(importId, { 
        status: 'processing', 
        started_at: startTime.toISOString() 
      })
      
      // Parse CSV with security validation
      const parseResult = await parseCSVStream(csvContent)
      
      if (parseResult.errors.length > 0) {
        throw new Error(`CSV parsing failed: ${parseResult.errors.map(e => e.message).join(', ')}`)
      }
      
      progress.totalRows = parseResult.data.length
      await this.updateProgress(importId, { total_rows: progress.totalRows })
      
      // Validate all rows
      const validation = validateLEXImportBatch(parseResult.data)
      progress.errors = validation.errors
      progress.warnings = validation.warnings
      progress.errorRows = validation.invalidRows.length
      
      // Process valid rows in batches
      const batches = []
      for (let i = 0; i < validation.validRows.length; i += CSV_CONFIG.batchSize) {
        batches.push(validation.validRows.slice(i, i + CSV_CONFIG.batchSize))
      }
      
      for (const [batchIndex, batch] of batches.entries()) {
        await this.processBatch(batch, progress)
        
        // Update progress
        progress.processedRows = Math.min(
          (batchIndex + 1) * CSV_CONFIG.batchSize,
          validation.validRows.length
        )
        
        await this.updateProgress(importId, { 
          processed_rows: progress.processedRows,
          error_rows: progress.errorRows,
          errors: {
            errors: progress.errors,
            warnings: progress.warnings,
            summary: validation.summary
          }
        })
        
        // Update in-memory progress
        this.progress.set(importId, progress)
      }
      
      // Mark as completed
      const endTime = new Date()
      progress.status = 'completed'
      progress.endTime = endTime
      
      await this.updateProgress(importId, { 
        status: 'completed',
        completed_at: endTime.toISOString()
      })
      
      return progress
      
    } catch (error) {
      // Mark as failed
      progress.status = 'failed'
      progress.errors.push({
        row: 0,
        field: 'system',
        value: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        severity: 'error'
      })
      
      await this.updateProgress(importId, { 
        status: 'failed',
        errors: {
          errors: progress.errors,
          warnings: progress.warnings
        }
      })
      
      throw error
    }
  }
  
  // Process batch of validated rows with proper transaction handling
  private async processBatch(batch: any[], progress: ProcessingProgress): Promise<void> {
    const result = await this.transactionManager.processCSVBatch(
      batch,
      async (row) => await this.processRow(row)
    )
    
    if (!result.success) {
      throw result.error || new Error('Batch processing failed')
    }
    
    // Update progress with batch results
    if (result.data) {
      progress.processedRows += result.data.processed
      progress.errorRows += result.data.errors.length
      
      // Add errors to progress
      result.data.errors.forEach(error => {
        progress.errors.push({
          row: error.row,
          field: 'batch_processing',
          value: null,
          error: error.error,
          severity: 'error'
        })
      })
    }
  }
  
  // Process individual row with LEX integration
  private async processRow(row: any): Promise<void> {
    // Find or create client
    const clientId = await this.findOrCreateClient({
      name: row.Client,
      type: 'Company', // Default assumption, could be enhanced
      email: null,
      phone: null
    })
    
    // Find barrister
    const barristerId = await this.findBarristerByName(row['Fee Earner'])
    
    // Parse dates and currency
    const receivedDate = parseUKDate(row['Date Received'])
    const estimatedValue = parseUKCurrency(row.Value)
    
    // Check for existing enquiry by LEX reference
    const { data: existingEnquiry } = await this.supabase
      .from('enquiries')
      .select('id')
      .eq('lex_reference', row.Reference)
      .single()
    
    const enquiryData = {
      lex_reference: row.Reference,
      client_id: clientId,
      source: 'Direct' as const,
      practice_area: null, // Could be inferred from matter description
      matter_type: row['Matter Description'].substring(0, 255),
      description: row['Matter Description'],
      estimated_value: estimatedValue,
      urgency: 'Flexible' as const, // Default
      status: row.Status as any,
      assigned_barrister_id: barristerId,
      received_at: receivedDate?.toISOString() || new Date().toISOString()
    }
    
    if (existingEnquiry) {
      // Update existing enquiry
      const { error } = await this.supabase
        .from('enquiries')
        .update(enquiryData)
        .eq('id', existingEnquiry.id)
      
      if (error) throw new Error(`Failed to update enquiry: ${error.message}`)
    } else {
      // Create new enquiry
      const { error } = await this.supabase
        .from('enquiries')
        .insert(enquiryData)
      
      if (error) throw new Error(`Failed to create enquiry: ${error.message}`)
    }
  }
  
  // Get current progress
  getProgress(importId: string): ProcessingProgress | null {
    return this.progress.get(importId) || null
  }
  
  // Generate LEX export
  async generateLEXExport(): Promise<string> {
    const { data: enquiries, error } = await this.supabase
      .from('enquiries')
      .select(`
        lex_reference,
        status,
        responded_at,
        assigned_barrister:barristers(name),
        description
      `)
      .not('lex_reference', 'is', null)
      .order('updated_at', { ascending: false })
    
    if (error) {
      throw new Error(`Failed to fetch enquiries: ${error.message}`)
    }
    
    // Transform to LEX export format
    const exportRows: LEXExportRow[] = enquiries.map(enquiry => ({
      Reference: enquiry.lex_reference || '',
      Status: enquiry.status || 'New',
      'Assigned To': enquiry.assigned_barrister?.name || 'Unassigned',
      'Response Date': enquiry.responded_at ? 
        new Date(enquiry.responded_at).toLocaleDateString('en-GB') : '',
      Notes: enquiry.description ? enquiry.description.substring(0, 500) : ''
    }))
    
    // Generate CSV
    return Papa.unparse(exportRows, {
      header: true,
      delimiter: ',',
      quotes: true
    })
  }
}

// Singleton instance
export const csvProcessor = new SecureCSVProcessor()

// Export processing functions
export async function processLEXImport(importId: string, csvContent: string): Promise<ProcessingProgress> {
  return csvProcessor.processLEXImport(importId, csvContent)
}

export async function getImportProgress(importId: string): Promise<ProcessingProgress | null> {
  return csvProcessor.getProgress(importId)
}

export async function generateLEXExport(): Promise<string> {
  return csvProcessor.generateLEXExport()
}

export async function initializeCSVImport(filename: string, type: CSVImport['type']): Promise<string> {
  return csvProcessor.initializeImport(filename, type)
}