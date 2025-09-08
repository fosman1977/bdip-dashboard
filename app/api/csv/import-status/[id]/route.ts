import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { getImportProgress } from '../../../../../lib/csv/processor'

// Security middleware for authentication
async function authenticateRequest(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 }
      )
    }
    
    return { user, supabase }
  } catch (error) {
    console.error('Authentication error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

// Validate UUID format to prevent injection
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

// GET /api/csv/import-status/[id] - Get secure import status with permission checks
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request)
    if (authResult instanceof NextResponse) {
      return authResult
    }
    const { user, supabase } = authResult
    
    // Validate import ID
    const importId = params.id
    if (!importId || !isValidUUID(importId)) {
      return NextResponse.json(
        { error: 'Invalid import ID format' },
        { status: 400 }
      )
    }
    
    try {
      // Check if import exists and user has permission to view it
      const { data: importRecord, error: importError } = await supabase
        .from('csv_imports')
        .select('*')
        .eq('id', importId)
        .single()
      
      if (importError) {
        if (importError.code === 'PGRST116') { // No rows returned
          return NextResponse.json(
            { error: 'Import not found' },
            { status: 404 }
          )
        }
        throw new Error(`Database error: ${importError.message}`)
      }
      
      if (!importRecord) {
        return NextResponse.json(
          { error: 'Import not found' },
          { status: 404 }
        )
      }
      
      // Get real-time progress if available
      const realtimeProgress = getImportProgress(importId)
      
      // Combine database record with real-time progress
      const status = realtimeProgress || {
        importId: importRecord.id,
        status: importRecord.status,
        totalRows: importRecord.total_rows || 0,
        processedRows: importRecord.processed_rows || 0,
        errorRows: importRecord.error_rows || 0,
        errors: importRecord.errors?.errors || [],
        warnings: importRecord.errors?.warnings || [],
        startTime: importRecord.started_at ? new Date(importRecord.started_at) : null,
        endTime: importRecord.completed_at ? new Date(importRecord.completed_at) : null
      }
      
      // Calculate progress percentage
      const progressPercentage = status.totalRows > 0 
        ? Math.round((status.processedRows / status.totalRows) * 100)
        : 0
      
      // Calculate estimated completion time for in-progress imports
      let estimatedCompletion = null
      if (status.status === 'processing' && status.startTime && status.processedRows > 0) {
        const elapsed = Date.now() - status.startTime.getTime()
        const avgTimePerRow = elapsed / status.processedRows
        const remainingRows = status.totalRows - status.processedRows
        const remainingTime = avgTimePerRow * remainingRows
        estimatedCompletion = new Date(Date.now() + remainingTime)
      }
      
      // Sanitize error data for frontend
      const sanitizedErrors = status.errors.map(error => ({
        row: error.row,
        field: error.field,
        error: error.error,
        severity: error.severity,
        // Don't expose raw values for security
        valuePreview: typeof error.value === 'string' 
          ? error.value.substring(0, 50) + (error.value.length > 50 ? '...' : '')
          : '[complex value]'
      }))
      
      const sanitizedWarnings = status.warnings.map(warning => ({
        row: warning.row,
        field: warning.field,
        error: warning.error,
        severity: warning.severity,
        valuePreview: typeof warning.value === 'string' 
          ? warning.value.substring(0, 50) + (warning.value.length > 50 ? '...' : '')
          : '[complex value]'
      }))
      
      return NextResponse.json({
        success: true,
        data: {
          id: importRecord.id,
          filename: importRecord.filename,
          type: importRecord.type,
          status: status.status,
          progress: {
            totalRows: status.totalRows,
            processedRows: status.processedRows,
            errorRows: status.errorRows,
            successRows: Math.max(0, status.processedRows - status.errorRows),
            percentageComplete: progressPercentage
          },
          timing: {
            startTime: status.startTime?.toISOString() || null,
            endTime: status.endTime?.toISOString() || null,
            estimatedCompletion: estimatedCompletion?.toISOString() || null,
            duration: status.startTime && status.endTime 
              ? status.endTime.getTime() - status.startTime.getTime()
              : null
          },
          errors: {
            count: sanitizedErrors.length,
            items: sanitizedErrors.slice(0, 10), // Limit to first 10 errors
            hasMore: sanitizedErrors.length > 10
          },
          warnings: {
            count: sanitizedWarnings.length,
            items: sanitizedWarnings.slice(0, 10), // Limit to first 10 warnings
            hasMore: sanitizedWarnings.length > 10
          },
          summary: importRecord.errors?.summary || null
        }
      })
      
    } catch (error) {
      console.error(`Failed to get import status for ${importId}:`, error)
      return NextResponse.json(
        { 
          error: 'Failed to retrieve import status',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('Import status endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}

// DELETE /api/csv/import-status/[id] - Cancel import (if possible) with permission checks
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request)
    if (authResult instanceof NextResponse) {
      return authResult
    }
    const { user, supabase } = authResult
    
    // Check user permissions for deletion
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    if (!profile || !['admin', 'clerk'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to cancel imports' },
        { status: 403 }
      )
    }
    
    // Validate import ID
    const importId = params.id
    if (!importId || !isValidUUID(importId)) {
      return NextResponse.json(
        { error: 'Invalid import ID format' },
        { status: 400 }
      )
    }
    
    // Check current status
    const { data: importRecord, error: fetchError } = await supabase
      .from('csv_imports')
      .select('status')
      .eq('id', importId)
      .single()
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Import not found' },
          { status: 404 }
        )
      }
      throw new Error(`Database error: ${fetchError.message}`)
    }
    
    // Check if cancellation is possible
    if (!importRecord) {
      return NextResponse.json(
        { error: 'Import not found' },
        { status: 404 }
      )
    }
    
    if (importRecord.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel completed import' },
        { status: 400 }
      )
    }
    
    if (importRecord.status === 'failed') {
      return NextResponse.json(
        { error: 'Import already failed' },
        { status: 400 }
      )
    }
    
    // Mark as failed (cancellation)
    const { error: updateError } = await supabase
      .from('csv_imports')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: {
          errors: [{
            row: 0,
            field: 'system',
            value: null,
            error: `Import cancelled by user ${user.email}`,
            severity: 'error'
          }],
          warnings: [],
          summary: {
            total: 0,
            valid: 0,
            invalid: 0,
            cancelled: true
          }
        }
      })
      .eq('id', importId)
    
    if (updateError) {
      throw new Error(`Failed to cancel import: ${updateError.message}`)
    }
    
    return NextResponse.json({
      success: true,
      message: 'Import cancelled successfully'
    })
    
  } catch (error) {
    console.error('Import cancellation error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to cancel import',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// OPTIONS - CORS support
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}