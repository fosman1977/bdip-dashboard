import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { applyCorsHeaders } from '@/lib/security/cors'

interface SignInRequest {
  email: string
  password: string
  remember_me?: boolean
}

export async function POST(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Apply rate limiting - stricter for signin
    const rateLimitResponse = await applyRateLimit(request, {
      requests: 10, // 10 signin attempts
      window: 60 * 15, // per 15 minutes
      keyGenerator: (req) => `signin:${req.ip || 'anonymous'}`
    })
    if (rateLimitResponse) return rateLimitResponse

    const body: SignInRequest = await request.json()
    const { email, password, remember_me } = body

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        {
          error: 'Missing credentials',
          message: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if user exists and account status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active, failed_login_attempts, locked_until, role')
      .eq('email', email)
      .single()

    if (profileError) {
      // Don't reveal if user exists - just log the attempt
      await supabase.rpc('log_auth_event', {
        p_user_id: null,
        p_event_type: 'failed_login',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email,
          reason: 'user_not_found'
        }
      })

      return NextResponse.json(
        {
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
          code: 'INVALID_CREDENTIALS'
        },
        { status: 401 }
      )
    }

    // Check if account is locked
    if (profile.locked_until && new Date() < new Date(profile.locked_until)) {
      await supabase.rpc('log_auth_event', {
        p_user_id: profile.id,
        p_event_type: 'failed_login',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email,
          reason: 'account_locked',
          locked_until: profile.locked_until
        }
      })

      return NextResponse.json(
        {
          error: 'Account locked',
          message: `Account is temporarily locked. Please try again later.`,
          code: 'ACCOUNT_LOCKED',
          locked_until: profile.locked_until
        },
        { status: 423 }
      )
    }

    // Check if account is active
    if (!profile.is_active) {
      await supabase.rpc('log_auth_event', {
        p_user_id: profile.id,
        p_event_type: 'failed_login',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email,
          reason: 'account_inactive'
        }
      })

      return NextResponse.json(
        {
          error: 'Account inactive',
          message: 'Your account has been deactivated. Contact an administrator.',
          code: 'ACCOUNT_INACTIVE'
        },
        { status: 403 }
      )
    }

    // Attempt authentication
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (authError || !authData.user) {
      // Increment failed login attempts
      const newFailedAttempts = (profile.failed_login_attempts || 0) + 1
      const shouldLock = newFailedAttempts >= 5
      
      const updateData: any = {
        failed_login_attempts: newFailedAttempts,
        updated_at: new Date().toISOString()
      }

      // Lock account if too many failed attempts
      if (shouldLock) {
        const lockDuration = Math.min(30 * Math.pow(2, Math.floor(newFailedAttempts / 5)), 60 * 60) // Max 1 hour
        updateData.locked_until = new Date(Date.now() + lockDuration * 1000).toISOString()
      }

      await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile.id)

      // Log failed attempt
      await supabase.rpc('log_auth_event', {
        p_user_id: profile.id,
        p_event_type: 'failed_login',
        p_event_status: 'failure',
        p_ip_address: request.ip,
        p_user_agent: request.headers.get('user-agent'),
        p_event_data: {
          email,
          failed_attempts: newFailedAttempts,
          account_locked: shouldLock,
          error: authError?.message
        }
      })

      return NextResponse.json(
        {
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
          code: 'INVALID_CREDENTIALS',
          ...(shouldLock && {
            account_locked: true,
            message: 'Too many failed attempts. Account temporarily locked.'
          })
        },
        { status: 401 }
      )
    }

    // Successful login - reset failed attempts and update login tracking
    await supabase
      .from('profiles')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_sign_in_at: new Date().toISOString(),
        sign_in_count: profile.sign_in_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', authData.user.id)

    // Log successful login
    await supabase.rpc('log_auth_event', {
      p_user_id: authData.user.id,
      p_event_type: 'sign_in',
      p_event_status: 'success',
      p_ip_address: request.ip,
      p_user_agent: request.headers.get('user-agent'),
      p_event_data: {
        email,
        role: profile.role,
        remember_me: remember_me || false
      }
    })

    // Get updated profile information
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        avatar_url,
        is_active,
        profile_completed,
        onboarding_completed,
        last_sign_in_at,
        chambers_id
      `)
      .eq('id', authData.user.id)
      .single()

    return NextResponse.json(
      {
        message: 'Signed in successfully',
        user: {
          id: authData.user.id,
          email: authData.user.email,
          ...updatedProfile
        },
        session: {
          access_token: authData.session?.access_token,
          refresh_token: authData.session?.refresh_token,
          expires_at: authData.session?.expires_at
        }
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Signin error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred during signin',
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