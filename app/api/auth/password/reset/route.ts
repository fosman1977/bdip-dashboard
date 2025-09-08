import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { applyCorsHeaders } from '@/lib/security/cors'

interface PasswordResetRequest {
  email: string
  redirect_to?: string
}

export async function POST(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Apply rate limiting - very restrictive for password resets
    const rateLimitResponse = await applyRateLimit(request, {
      requests: 3, // Only 3 password reset requests
      window: 60 * 60, // per hour
      keyGenerator: (req) => `password_reset:${req.ip || 'anonymous'}`
    })
    if (rateLimitResponse) return rateLimitResponse

    const body: PasswordResetRequest = await request.json()
    const { email, redirect_to } = body

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        {
          error: 'Missing email',
          message: 'Email address is required for password reset',
          code: 'MISSING_EMAIL'
        },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if user exists (but don't reveal this information in response)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, is_active')
      .eq('email', email)
      .single()

    // Always return success to prevent user enumeration
    // But only actually send reset email if user exists and is active
    let actualResult = { success: false, reason: 'user_not_found' }

    if (profile && profile.is_active) {
      // Send password reset email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect_to || `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`
      })

      if (!resetError) {
        actualResult = { success: true, reason: 'email_sent' }
        
        // Log successful password reset request
        await supabase.rpc('log_auth_event', {
          p_user_id: profile.id,
          p_event_type: 'password_reset_request',
          p_event_status: 'success',
          p_ip_address: request.ip,
          p_user_agent: request.headers.get('user-agent'),
          p_event_data: {
            email,
            redirect_to: redirect_to || 'default'
          }
        })
      } else {
        actualResult = { success: false, reason: resetError.message }
      }
    }

    // Log all password reset attempts (including non-existent users)
    await supabase.rpc('log_auth_event', {
      p_user_id: profile?.id || null,
      p_event_type: 'password_reset_request',
      p_event_status: actualResult.success ? 'success' : 'failure',
      p_ip_address: request.ip,
      p_user_agent: request.headers.get('user-agent'),
      p_event_data: {
        email,
        reason: actualResult.reason,
        user_exists: !!profile,
        user_active: profile?.is_active || false
      }
    })

    // Always return success message to prevent user enumeration
    return NextResponse.json(
      {
        message: 'Password reset instructions sent',
        detail: 'If an account with this email exists, you will receive password reset instructions shortly.'
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Password reset error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing password reset',
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