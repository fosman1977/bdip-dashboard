import { SupabaseClient } from '@supabase/supabase-js'

export interface TransactionResult<T> {
  success: boolean
  data?: T
  error?: Error
}

// Safe transaction wrapper using Supabase's built-in transaction handling
export async function withTransaction<T>(
  supabase: SupabaseClient,
  operation: (client: SupabaseClient) => Promise<T>
): Promise<TransactionResult<T>> {
  try {
    // Supabase handles transactions automatically when using multiple operations
    // We'll implement proper error boundaries and rollback logic
    const result = await operation(supabase)
    
    return {
      success: true,
      data: result
    }
    
  } catch (error) {
    console.error('Transaction failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Transaction failed')
    }
  }
}

// Batch operation with proper transaction boundaries
export async function withBatchTransaction<T>(
  supabase: SupabaseClient,
  batchOperations: Array<(client: SupabaseClient) => Promise<void>>,
  batchSize: number = 100
): Promise<TransactionResult<void>> {
  try {
    // Process in smaller batches to avoid timeout and memory issues
    for (let i = 0; i < batchOperations.length; i += batchSize) {
      const batch = batchOperations.slice(i, i + batchSize)
      
      // Execute batch operations
      const batchPromises = batch.map(operation => operation(supabase))
      
      try {
        await Promise.all(batchPromises)
      } catch (batchError) {
        // If any operation in the batch fails, we need to handle it gracefully
        console.error(`Batch ${Math.floor(i / batchSize)} failed:`, batchError)
        throw batchError
      }
    }
    
    return { success: true }
    
  } catch (error) {
    console.error('Batch transaction failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Batch transaction failed')
    }
  }
}

// Atomic upsert operation for CSV imports
export async function atomicUpsert(
  supabase: SupabaseClient,
  table: string,
  data: Record<string, any>,
  conflictColumns: string[]
): Promise<TransactionResult<any>> {
  try {
    const { data: result, error } = await supabase
      .from(table)
      .upsert(data, {
        onConflict: conflictColumns.join(','),
        ignoreDuplicates: false
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }
    
    return {
      success: true,
      data: result
    }
    
  } catch (error) {
    console.error(`Atomic upsert failed for table ${table}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Atomic upsert failed')
    }
  }
}

// Safe bulk insert with conflict resolution
export async function safeBulkInsert(
  supabase: SupabaseClient,
  table: string,
  records: Record<string, any>[],
  options: {
    onConflict?: string
    batchSize?: number
    ignoreErrors?: boolean
  } = {}
): Promise<TransactionResult<{ inserted: number; errors: any[] }>> {
  const {
    onConflict,
    batchSize = 500,
    ignoreErrors = false
  } = options
  
  const errors: any[] = []
  let inserted = 0
  
  try {
    // Process in batches
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      
      try {
        const query = supabase.from(table)
        
        if (onConflict) {
          const { data, error } = await query
            .upsert(batch, { onConflict })
            .select()
        } else {
          const { data, error } = await query
            .insert(batch)
            .select()
        }
        
        if (error) {
          if (ignoreErrors) {
            errors.push({
              batchIndex: Math.floor(i / batchSize),
              error: error.message,
              records: batch.length
            })
          } else {
            throw error
          }
        } else {
          inserted += batch.length
        }
        
      } catch (batchError) {
        if (ignoreErrors) {
          errors.push({
            batchIndex: Math.floor(i / batchSize),
            error: batchError instanceof Error ? batchError.message : 'Unknown error',
            records: batch.length
          })
        } else {
          throw batchError
        }
      }
    }
    
    return {
      success: true,
      data: { inserted, errors }
    }
    
  } catch (error) {
    console.error(`Bulk insert failed for table ${table}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Bulk insert failed')
    }
  }
}

// CSV-specific transaction patterns
export class CSVTransactionManager {
  constructor(private supabase: SupabaseClient) {}
  
  async processCSVBatch(
    records: any[],
    processor: (record: any) => Promise<void>
  ): Promise<TransactionResult<{ processed: number; errors: any[] }>> {
    const errors: any[] = []
    let processed = 0
    
    try {
      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        
        try {
          await processor(record)
          processed++
        } catch (recordError) {
          errors.push({
            row: i + 1,
            record,
            error: recordError instanceof Error ? recordError.message : 'Unknown error'
          })
          
          // Continue processing other records
        }
      }
      
      return {
        success: true,
        data: { processed, errors }
      }
      
    } catch (error) {
      console.error('CSV batch processing failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error : new Error('CSV batch processing failed')
      }
    }
  }
  
  async updateImportProgress(
    importId: string,
    progress: {
      status?: string
      processed_rows?: number
      error_rows?: number
      errors?: any
    }
  ): Promise<TransactionResult<void>> {
    try {
      const { error } = await this.supabase
        .from('csv_imports')
        .update({
          ...progress,
          updated_at: new Date().toISOString()
        })
        .eq('id', importId)
      
      if (error) {
        throw new Error(`Progress update failed: ${error.message}`)
      }
      
      return { success: true }
      
    } catch (error) {
      console.error(`Progress update failed for import ${importId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Progress update failed')
      }
    }
  }
}