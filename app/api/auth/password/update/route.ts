import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/security/auth'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { applyCorsHeaders } from '@/lib/security/cors'

interface PasswordUpdateRequest {
  current_password: string
  new_password: string
}

export async function PUT(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, {
      requests: 5, // 5 password change attempts
      window: 60 * 60, // per hour
      keyGenerator: (req) => `password_change:${req.ip || 'anonymous'}`
    })
    if (rateLimitResponse) return rateLimitResponse

    // Authenticate the request
    const authResult = await authenticateRequest(request, [])
    
    if (!authResult.success) {
      return authResult.response
    }

    const { user, supabase } = authResult
    const body: PasswordUpdateRequest = await request.json()
    const { current_password, new_password } = body

    // Validate required fields
    if (!current_password || !new_password) {
      return NextResponse.json(
        {
          error: 'Missing passwords',
          message: 'Both current and new password are required',
          code: 'MISSING_PASSWORDS'
        },
        { status: 400 }
      )
    }

    // Validate new password strength (basic validation)
    if (new_password.length < 8) {
      return NextResponse.json(
        {
          error: 'Weak password',
          message: 'Password must be at least 8 characters long',
          code: 'WEAK_PASSWORD'
        },
        { status: 400 }
      )
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current_password
    })

    if (verifyError) {
      // Log failed password verification
      await supabase.rpc('log_auth_event', {
        p_user_id: user.id,
        p_event_type: 'password_change',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email: user.email,
          error: 'invalid_current_password'
        }
      })

      return NextResponse.json(
        {
          error: 'Invalid current password',
          message: 'The current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD'
        },
        { status: 400 }
      )
    }

    // Update the password
    const { error: updateError } = await supabase.auth.updateUser({
      password: new_password
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      
      // Log failed password change
      await supabase.rpc('log_auth_event', {
        p_user_id: user.id,
        p_event_type: 'password_change',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email: user.email,
          error: updateError.message
        }
      })

      return NextResponse.json(
        {
          error: 'Password update failed',
          message: updateError.message,
          code: 'UPDATE_FAILED'
        },
        { status: 400 }
      )
    }

    // Update profile to track password change
    await supabase
      .from('profiles')
      .update({
        password_changed_at: new Date().toISOString(),
        require_password_change: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    // Log successful password change
    await supabase.rpc('log_auth_event', {
      p_user_id: user.id,
      p_event_type: 'password_change',
      p_event_status: 'success',
      p_ip_address: request.ip,
      p_user_agent: request.headers.get('user-agent'),
      p_event_data: {
        email: user.email
      }
    })

    return NextResponse.json(
      {
        message: 'Password updated successfully'
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Password update error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while updating password',
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