import { NextRequest, NextResponse } from 'next/server'
import { generateLEXExport } from '../../../../lib/csv/processor'
import { authenticateRequest } from '../../../../lib/security/auth'
import { checkRateLimit, rateLimitConfigs } from '../../../../lib/security/rate-limit'
import { createSecureOPTIONSResponse, addSecureCORSHeaders } from '../../../../lib/security/cors'
import { z } from 'zod'

// Export request validation
const exportRequestSchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  type: z.enum(['lex-export', 'enquiries', 'clients']).default('lex-export'),
  filters: z.object({
    status: z.array(z.string()).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    practiceArea: z.string().optional()
  }).optional()
})


// GET /api/csv/export - Generate secure data export
export async function GET(request: NextRequest) {
  try {
    // Authenticate request - only admin and clerk can export
    const authResult = await authenticateRequest(request, ['admin', 'clerk'])
    if (!authResult.success) {
      return addSecureCORSHeaders(authResult.response, request)
    }
    const { user, supabase } = authResult
    
    // Rate limiting with distributed system
    const rateLimitResult = await checkRateLimit(request, rateLimitConfigs.csvExport, user.id)
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return addSecureCORSHeaders(rateLimitResult.response, request)
    }
    
    // Parse and validate query parameters
    const url = new URL(request.url)
    const exportParams = {
      format: url.searchParams.get('format') || 'csv',
      type: url.searchParams.get('type') || 'lex-export',
      filters: {
        status: url.searchParams.get('status')?.split(','),
        dateFrom: url.searchParams.get('dateFrom'),
        dateTo: url.searchParams.get('dateTo'),
        practiceArea: url.searchParams.get('practiceArea')
      }
    }
    
    // Validate parameters
    const validation = exportRequestSchema.safeParse(exportParams)
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid export parameters',
          details: validation.error.errors
        },
        { status: 400 }
      )
    }
    
    const { format, type, filters } = validation.data
    
    try {
      let csvContent: string
      let filename: string
      
      switch (type) {
        case 'lex-export':
          csvContent = await generateLEXExport()
          filename = `lex-export-${new Date().toISOString().split('T')[0]}.csv`
          break
          
        case 'enquiries':
          csvContent = await generateEnquiriesExport(supabase, filters)
          filename = `enquiries-export-${new Date().toISOString().split('T')[0]}.csv`
          break
          
        case 'clients':
          csvContent = await generateClientsExport(supabase, filters)
          filename = `clients-export-${new Date().toISOString().split('T')[0]}.csv`
          break
          
        default:
          return NextResponse.json(
            { error: 'Unsupported export type' },
            { status: 400 }
          )
      }
      
      // Log export activity for audit trail
      await supabase
        .from('csv_imports') // Reuse table for export logging
        .insert({
          filename,
          type: 'export' as any, // Extend enum or use separate table
          status: 'completed',
          total_rows: csvContent.split('\n').length - 1, // Subtract header
          processed_rows: csvContent.split('\n').length - 1,
          error_rows: 0,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        })
      
      // Set security headers
      const headers = new Headers()
      headers.set('Content-Type', 'text/csv')
      headers.set('Content-Disposition', `attachment; filename="${filename}"`)
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      headers.set('Pragma', 'no-cache')
      headers.set('Expires', '0')
      
      const response = new NextResponse(csvContent, {
        status: 200,
        headers
      })
      
      return addSecureCORSHeaders(response, request)
      
    } catch (error) {
      console.error('Export generation failed:', error)
      const response = NextResponse.json(
        { 
          error: 'Export generation failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'EXPORT_FAILED'
        },
        { status: 500 }
      )
      return addSecureCORSHeaders(response, request)
    }
    
  } catch (error) {
    console.error('Export endpoint error:', error)
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

// Generate enquiries export with filters
async function generateEnquiriesExport(
  supabase: any,
  filters?: { status?: string[], dateFrom?: string, dateTo?: string, practiceArea?: string }
): Promise<string> {
  let query = supabase
    .from('enquiries')
    .select(`
      id,
      lex_reference,
      client:clients(name, type),
      source,
      practice_area,
      matter_type,
      description,
      estimated_value,
      urgency,
      status,
      assigned_clerk:clerks(name),
      assigned_barrister:barristers(name),
      received_at,
      responded_at,
      converted_at,
      created_at
    `)
    .order('created_at', { ascending: false })
  
  // Apply filters
  if (filters?.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }
  
  if (filters?.dateFrom) {
    query = query.gte('received_at', filters.dateFrom)
  }
  
  if (filters?.dateTo) {
    query = query.lte('received_at', filters.dateTo)
  }
  
  if (filters?.practiceArea) {
    query = query.eq('practice_area', filters.practiceArea)
  }
  
  const { data: enquiries, error } = await query
  
  if (error) {
    throw new Error(`Failed to fetch enquiries: ${error.message}`)
  }
  
  // Transform to CSV format
  const csvData = enquiries.map(enquiry => ({
    'LEX Reference': enquiry.lex_reference || '',
    'Client Name': enquiry.client?.name || '',
    'Client Type': enquiry.client?.type || '',
    'Source': enquiry.source || '',
    'Practice Area': enquiry.practice_area || '',
    'Matter Type': enquiry.matter_type || '',
    'Description': enquiry.description ? enquiry.description.substring(0, 500) : '',
    'Estimated Value': enquiry.estimated_value ? `£${enquiry.estimated_value.toLocaleString()}` : '',
    'Urgency': enquiry.urgency || '',
    'Status': enquiry.status || '',
    'Assigned Clerk': enquiry.assigned_clerk?.name || '',
    'Assigned Barrister': enquiry.assigned_barrister?.name || '',
    'Received Date': enquiry.received_at ? new Date(enquiry.received_at).toLocaleDateString('en-GB') : '',
    'Response Date': enquiry.responded_at ? new Date(enquiry.responded_at).toLocaleDateString('en-GB') : '',
    'Conversion Date': enquiry.converted_at ? new Date(enquiry.converted_at).toLocaleDateString('en-GB') : '',
    'Created Date': new Date(enquiry.created_at).toLocaleDateString('en-GB')
  }))
  
  // Generate CSV using Papa Parse
  const Papa = require('papaparse')
  return Papa.unparse(csvData, {
    header: true,
    delimiter: ',',
    quotes: true
  })
}

// Generate clients export with filters
async function generateClientsExport(
  supabase: any,
  filters?: { dateFrom?: string, dateTo?: string }
): Promise<string> {
  let query = supabase
    .from('clients')
    .select(`
      id,
      name,
      type,
      email,
      phone,
      company_number,
      total_value,
      matter_count,
      first_instruction,
      last_instruction,
      created_at
    `)
    .order('created_at', { ascending: false })
  
  // Apply date filters
  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  
  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo)
  }
  
  const { data: clients, error } = await query
  
  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }
  
  // Transform to CSV format
  const csvData = clients.map(client => ({
    'Client ID': client.id,
    'Name': client.name,
    'Type': client.type,
    'Email': client.email || '',
    'Phone': client.phone || '',
    'Company Number': client.company_number || '',
    'Total Value': client.total_value ? `£${client.total_value.toLocaleString()}` : '£0',
    'Matter Count': client.matter_count || 0,
    'First Instruction': client.first_instruction ? new Date(client.first_instruction).toLocaleDateString('en-GB') : '',
    'Last Instruction': client.last_instruction ? new Date(client.last_instruction).toLocaleDateString('en-GB') : '',
    'Created Date': new Date(client.created_at).toLocaleDateString('en-GB')
  }))
  
  // Generate CSV using Papa Parse
  const Papa = require('papaparse')
  return Papa.unparse(csvData, {
    header: true,
    delimiter: ',',
    quotes: true
  })
}

// OPTIONS - Secure CORS support
export async function OPTIONS(request: NextRequest) {
  return createSecureOPTIONSResponse(request)
}