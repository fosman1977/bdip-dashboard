import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { applyCorsHeaders } from '@/lib/security/cors'

export async function POST(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    const supabase = createServerSupabaseClient()

    // Get current user before signing out for logging
    const { data: { user } } = await supabase.auth.getUser()

    // Sign out the user
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Signout error:', error)
      return NextResponse.json(
        {
          error: 'Signout failed',
          message: error.message,
          code: 'SIGNOUT_ERROR'
        },
        { status: 400 }
      )
    }

    // Log the signout event if we had a user
    if (user) {
      await supabase.rpc('log_auth_event', {
        p_user_id: user.id,
        p_event_type: 'sign_out',
        p_event_status: 'success',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email: user.email
        }
      })
    }

    return NextResponse.json(
      {
        message: 'Signed out successfully'
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Signout error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred during signout',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return applyCorsHeaders(request) || new NextResponse(null, { status: 200 })
}