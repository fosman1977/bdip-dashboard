import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../../lib/supabase/server'
import { progressTracker } from '../../../../../lib/csv/progress-tracker'
import { isValidUUID } from '../../../../../lib/csv/database-constraints'

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

// GET /api/csv/progress/[id] - Real-time progress updates with security
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
    const { user } = authResult
    
    // Validate import ID
    const importId = params.id
    if (!importId || !isValidUUID(importId)) {
      return NextResponse.json(
        { error: 'Invalid import ID format' },
        { status: 400 }
      )
    }
    
    try {
      // Get progress with security checks
      const progress = await progressTracker.getProgress(importId, user.id)
      
      if (!progress) {
        return NextResponse.json(
          { error: 'Import not found or access denied' },
          { status: 404 }
        )
      }
      
      // Add security headers for real-time data
      const headers = new Headers()
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      headers.set('Pragma', 'no-cache')
      headers.set('Expires', '0')
      
      return NextResponse.json({
        success: true,
        data: progress,
        timestamp: new Date().toISOString()
      }, { headers })
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        return NextResponse.json(
          { error: 'Access denied to import progress' },
          { status: 403 }
        )
      }
      
      console.error(`Progress fetch error for ${importId}:`, error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch progress',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('Progress endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}

// POST /api/csv/progress/[id] - Force progress update (admin only)
export async function POST(
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
    
    // Check admin permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required for progress updates' },
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
    
    // Parse update request
    const body = await request.json()
    const { action, data } = body
    
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      )
    }
    
    try {
      switch (action) {
        case 'refresh':
          // Force refresh progress from database
          const progress = await progressTracker.getProgress(importId, user.id)
          return NextResponse.json({
            success: true,
            data: progress,
            message: 'Progress refreshed'
          })
          
        case 'cleanup':
          // Clean up completed import tracking
          await progressTracker.cleanupProgress(importId, user.id)
          return NextResponse.json({
            success: true,
            message: 'Progress tracking cleaned up'
          })
          
        case 'reset':
          // Reset failed import (admin only)
          const { error: resetError } = await supabase
            .from('csv_imports')
            .update({
              status: 'pending',
              processed_rows: 0,
              error_rows: 0,
              errors: null,
              started_at: null,
              completed_at: null
            })
            .eq('id', importId)
          
          if (resetError) {
            throw new Error(`Failed to reset import: ${resetError.message}`)
          }
          
          await progressTracker.cleanupProgress(importId)
          
          return NextResponse.json({
            success: true,
            message: 'Import reset successfully'
          })
          
        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          )
      }
    } catch (error) {
      console.error(`Progress update error for ${importId}:`, error)
      return NextResponse.json(
        { 
          error: 'Failed to update progress',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('Progress update endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  }
}

// DELETE /api/csv/progress/[id] - Cancel import with cleanup
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
    
    // Check permissions (clerks and admins can cancel)
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
    
    try {
      // Check current status
      const { data: importRecord, error: fetchError } = await supabase
        .from('csv_imports')
        .select('status, filename')
        .eq('id', importId)
        .single()
      
      if (fetchError || !importRecord) {
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
        // Already failed, just cleanup
        await progressTracker.cleanupProgress(importId, user.id)
        return NextResponse.json({
          success: true,
          message: 'Import was already failed, cleaned up tracking'
        })
      }
      
      // Mark as cancelled
      const { error: updateError } = await supabase
        .from('csv_imports')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: {
            cancelled: true,
            cancelledBy: user.email,
            cancelledAt: new Date().toISOString(),
            reason: 'Import cancelled by user'
          }
        })
        .eq('id', importId)
      
      if (updateError) {
        throw new Error(`Failed to cancel import: ${updateError.message}`)
      }
      
      // Clean up progress tracking
      await progressTracker.cleanupProgress(importId, user.id)
      
      return NextResponse.json({
        success: true,
        message: `Import "${importRecord.filename}" cancelled successfully`
      })
      
    } catch (error) {
      console.error(`Import cancellation error for ${importId}:`, error)
      return NextResponse.json(
        { 
          error: 'Failed to cancel import',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('Import cancellation endpoint error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred'
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}