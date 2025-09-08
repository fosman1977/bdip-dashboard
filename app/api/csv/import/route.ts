import { NextRequest, NextResponse } from 'next/server'
import { validateCSVFile, initializeCSVImport, processLEXImport } from '../../../../lib/csv/processor'
import { securitySchemas } from '../../../../lib/csv/validation'
import { authenticateRequest } from '../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../lib/security/cors'
import { z } from 'zod'

// Request validation schema
const importRequestSchema = z.object({
  type: z.enum(['enquiries', 'clients', 'matters', 'fees']),
  filename: z.string().min(1).max(255),
})


// POST /api/csv/import - Secure CSV file upload and processing
export async function POST(request: NextRequest) {
  try {
    // Authenticate request with specific roles for CSV import
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting with distributed system
    const rateLimitResult = await checkRateLimit(request, rateLimitConfigs.csvImport, user.id)
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null
    
    if (!file || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: file and type' },
        { status: 400 }
      )
    }
    
    // Validate request parameters
    const requestValidation = importRequestSchema.safeParse({
      type,
      filename: file.name
    })
    
    if (!requestValidation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request parameters',
          details: requestValidation.error.issues
        },
        { status: 400 }
      )
    }
    
    // Validate file security
    const fileValidation = validateCSVFile(file)
    if (!fileValidation.isValid) {
      return NextResponse.json(
        { 
          error: 'File validation failed',
          details: fileValidation.errors
        },
        { status: 400 }
      )
    }
    
    // Additional filename validation
    const filenameValidation = securitySchemas.fileUpload.safeParse({
      name: file.name,
      size: file.size,
      type: file.type
    })
    
    if (!filenameValidation.success) {
      return NextResponse.json(
        { 
          error: 'File security validation failed',
          details: filenameValidation.error.issues
        },
        { status: 400 }
      )
    }
    
    // Read file content securely
    let csvContent: string
    try {
      const buffer = await file.arrayBuffer()
      const decoder = new TextDecoder('utf-8')
      csvContent = decoder.decode(buffer)
      
      // Basic content validation
      if (!csvContent.includes(',') && !csvContent.includes('\t')) {
        throw new Error('File does not appear to be a valid CSV')
      }
      
      // Check for potential malicious content
      if (csvContent.includes('<script') || csvContent.includes('javascript:') || csvContent.includes('data:')) {
        throw new Error('File contains potentially malicious content')
      }
      
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Failed to read file content',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      )
    }
    
    try {
      // Initialize import job with authenticated user context
      const importId = await initializeCSVImport(file.name, requestValidation.data.type)
      
      // Start processing asynchronously (don't await)
      processLEXImport(importId, csvContent).catch(error => {
        console.error(`Import ${importId} failed:`, error)
        // Error is already logged in the database via updateProgress
      })
      
      // Return immediate response with import ID and CORS headers
      const response = NextResponse.json({
        success: true,
        importId,
        message: 'Import started successfully',
        filename: file.name,
        type: requestValidation.data.type,
        size: file.size
      }, { status: 202 }) // 202 Accepted for async processing
      
      return addSecureCORSHeaders(response, request)
      
    } catch (error) {
      console.error('Import initialization failed:', error)
      const response = NextResponse.json(
        { 
          error: 'Failed to start import',
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'IMPORT_INIT_FAILED'
        },
        { status: 500 }
      )
      return addSecureCORSHeaders(response, request)
    }
    
  } catch (error) {
    console.error('CSV import endpoint error:', error)
    const response = NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
    return addSecureCORSHeaders(response, request)
  }
}

// GET /api/csv/import - List import history with pagination
export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, ['admin', 'clerk', 'barrister'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Parse query parameters
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '10')))
    const status = url.searchParams.get('status')
    const type = url.searchParams.get('type')
    
    // Build query with filters
    let query = supabase
      .from('csv_imports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    
    if (status && ['pending', 'processing', 'completed', 'failed'].includes(status)) {
      query = query.eq('status', status)
    }
    
    if (type && ['enquiries', 'clients', 'matters', 'fees'].includes(type)) {
      query = query.eq('type', type)
    }
    
    const { data: imports, error, count } = await query
    
    if (error) {
      throw new Error(`Failed to fetch imports: ${error.message}`)
    }
    
    const response = NextResponse.json({
      success: true,
      data: imports || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    })
    
    return addSecureCORSHeaders(response, request)
    
  } catch (error) {
    console.error('Import list endpoint error:', error)
    const response = NextResponse.json(
      { 
        error: 'Failed to fetch imports',
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'FETCH_IMPORTS_FAILED'
      },
      { status: 500 }
    )
    return addSecureCORSHeaders(response, request)
  }
}

// OPTIONS - Secure CORS support
export async function OPTIONS(request: NextRequest) {
  return createSecureOPTIONSResponse(request)
}