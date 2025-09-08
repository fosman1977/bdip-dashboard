import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { authenticateRequest } from '@/lib/security/auth'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { applyCorsHeaders } from '@/lib/security/cors'

interface SignUpRequest {
  email: string
  password: string
  full_name: string
  role: 'admin' | 'clerk' | 'barrister' | 'read_only'
  invitation_token?: string
  chambers_id?: string
}

export async function POST(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, {
      requests: 5, // 5 signup attempts
      window: 60 * 15, // per 15 minutes
      keyGenerator: (req) => `signup:${req.ip || 'anonymous'}`
    })
    if (rateLimitResponse) return rateLimitResponse

    const body: SignUpRequest = await request.json()
    const { email, password, full_name, role, invitation_token, chambers_id } = body

    // Validate required fields
    if (!email || !password || !full_name || !role) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'Email, password, full name, and role are required',
          code: 'MISSING_FIELDS'
        },
        { status: 400 }
      )
    }

    // Validate role
    if (!['admin', 'clerk', 'barrister', 'read_only'].includes(role)) {
      return NextResponse.json(
        {
          error: 'Invalid role',
          message: 'Role must be one of: admin, clerk, barrister, read_only',
          code: 'INVALID_ROLE'
        },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if invitation-based signup is required
    if (invitation_token) {
      // Validate invitation token
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('invitation_token', invitation_token)
        .eq('email', email)
        .single()

      if (profileError || !profile) {
        return NextResponse.json(
          {
            error: 'Invalid invitation',
            message: 'The invitation token is invalid or has expired',
            code: 'INVALID_INVITATION'
          },
          { status: 400 }
        )
      }

      // Check if invitation has expired (7 days)
      const invitationExpiry = new Date(profile.invited_at)
      invitationExpiry.setDate(invitationExpiry.getDate() + 7)
      
      if (new Date() > invitationExpiry) {
        return NextResponse.json(
          {
            error: 'Invitation expired',
            message: 'This invitation has expired. Please request a new one.',
            code: 'INVITATION_EXPIRED'
          },
          { status: 400 }
        )
      }
    }

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role,
          chambers_id
        }
      }
    })

    if (authError) {
      // Log the failed signup attempt
      await supabase.rpc('log_auth_event', {
        p_user_id: null,
        p_event_type: 'sign_up',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email,
          error: authError.message
        }
      })

      return NextResponse.json(
        {
          error: 'Signup failed',
          message: authError.message,
          code: 'SIGNUP_ERROR'
        },
        { status: 400 }
      )
    }

    // If this was an invitation signup, update the profile
    if (invitation_token && authData.user) {
      await supabase
        .from('profiles')
        .update({
          is_active: true,
          is_verified: true,
          invitation_accepted_at: new Date().toISOString(),
          invitation_token: null, // Clear the token
          profile_completed: true
        })
        .eq('email', email)

      // Log invitation acceptance
      await supabase.rpc('log_auth_event', {
        p_user_id: authData.user.id,
        p_event_type: 'invitation_accepted',
        p_event_status: 'success',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email,
          role
        }
      })
    }

    // Return success response
    return NextResponse.json(
      {
        message: 'User created successfully',
        user: {
          id: authData.user?.id,
          email: authData.user?.email,
          email_confirmed: !!authData.user?.email_confirmed_at
        },
        requires_email_confirmation: !authData.session
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Signup error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred during signup',
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