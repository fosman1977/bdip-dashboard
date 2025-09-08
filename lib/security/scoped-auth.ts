import { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '../supabase/server'

export interface ScopedAuthContext {
  userId: string
  userRole: string
  userEmail?: string
  isActive: boolean
  supabase: SupabaseClient
}

export type AuthContext = {
  success: true
  context: ScopedAuthContext
} | {
  success: false
  error: string
}

// Create a user-scoped Supabase client that respects RLS policies
export async function createScopedClient(
  userId: string,
  userRole: string
): Promise<AuthContext> {
  try {
    // Create a server-side client that works with user context
    const supabase = createServerSupabaseClient()
    
    // Verify the user exists and is active
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_active, email')
      .eq('id', userId)
      .single()
    
    if (error || !profile) {
      return {
        success: false,
        error: 'User profile not found or inactive'
      }
    }
    
    if (!profile.is_active) {
      return {
        success: false,
        error: 'User account is inactive'
      }
    }
    
    // Validate role matches
    if (profile.role !== userRole) {
      return {
        success: false,
        error: 'Role mismatch detected'
      }
    }
    
    // Create context with user information
    return {
      success: true,
      context: {
        userId,
        userRole: profile.role,
        userEmail: profile.email,
        isActive: profile.is_active,
        supabase // This client will automatically use RLS policies
      }
    }
    
  } catch (error) {
    console.error('Failed to create scoped client:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Database operations with user context
export class ScopedDatabaseClient {
  constructor(private context: ScopedAuthContext) {}
  
  // Get the underlying Supabase client
  get client(): SupabaseClient {
    return this.context.supabase
  }
  
  // Get user context information
  get userContext() {
    return {
      userId: this.context.userId,
      userRole: this.context.userRole,
      userEmail: this.context.userEmail,
      isActive: this.context.isActive
    }
  }
  
  // Perform operations with automatic user context
  async safeInsert(table: string, data: Record<string, any>) {
    try {
      // Add audit fields automatically
      const auditData = {
        ...data,
        created_by: this.context.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      const { data: result, error } = await this.context.supabase
        .from(table)
        .insert(auditData as any)
        .select()
        .single()
      
      if (error) {
        throw new Error(`Insert failed: ${error.message}`)
      }
      
      return result
    } catch (error) {
      console.error(`Safe insert failed for table ${table}:`, error)
      throw error
    }
  }
  
  async safeUpdate(table: string, id: string, data: Record<string, any>) {
    try {
      // Add audit fields automatically
      const auditData = {
        ...data,
        updated_by: this.context.userId,
        updated_at: new Date().toISOString()
      }
      
      const { data: result, error } = await this.context.supabase
        .from(table)
        .update(auditData as any)
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        throw new Error(`Update failed: ${error.message}`)
      }
      
      return result
    } catch (error) {
      console.error(`Safe update failed for table ${table}:`, error)
      throw error
    }
  }
  
  async safeSelect(table: string, columns: string = '*') {
    try {
      const { data, error } = await this.context.supabase
        .from(table)
        .select(columns)
      
      if (error) {
        throw new Error(`Select failed: ${error.message}`)
      }
      
      return data || []
    } catch (error) {
      console.error(`Safe select failed for table ${table}:`, error)
      throw error
    }
  }
  
  // Check if user has permission to access specific data
  async checkAccess(table: string, recordId: string): Promise<boolean> {
    try {
      const { data, error } = await this.context.supabase
        .from(table)
        .select('id')
        .eq('id', recordId)
        .single()
      
      // If RLS allows access, we get data back
      // If RLS denies access, we get an error or no data
      return !!data && !error
      
    } catch {
      return false
    }
  }
}