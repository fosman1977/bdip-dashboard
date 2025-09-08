import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/security/auth'
import { applyCorsHeaders } from '@/lib/security/cors'

interface UpdateProfileRequest {
  full_name?: string
  avatar_url?: string
  phone?: string
  department?: string
  position_title?: string
  notification_preferences?: Record<string, any>
  ui_preferences?: Record<string, any>
}

// GET /api/auth/profile - Get current user profile
export async function GET(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Authenticate the request
    const authResult = await authenticateRequest(request, [])
    
    if (!authResult.success) {
      return authResult.response
    }

    const { user, supabase } = authResult

    // Get detailed profile information
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        avatar_url,
        phone,
        role,
        is_active,
        is_verified,
        chambers_id,
        department,
        position_title,
        start_date,
        last_sign_in_at,
        sign_in_count,
        profile_completed,
        onboarding_completed,
        notification_preferences,
        ui_preferences,
        created_at,
        updated_at
      `)
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Profile fetch error:', error)
      return NextResponse.json(
        {
          error: 'Profile not found',
          message: 'Unable to fetch user profile',
          code: 'PROFILE_NOT_FOUND'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      profile
    }, { status: 200 })

  } catch (error) {
    console.error('Get profile error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while fetching profile',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}

// PUT /api/auth/profile - Update current user profile
export async function PUT(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Authenticate the request
    const authResult = await authenticateRequest(request, [])
    
    if (!authResult.success) {
      return authResult.response
    }

    const { user, supabase } = authResult
    const body: UpdateProfileRequest = await request.json()

    // Validate input data
    const allowedFields = [
      'full_name',
      'avatar_url', 
      'phone',
      'department',
      'position_title',
      'notification_preferences',
      'ui_preferences'
    ]

    const updateData: any = {}
    
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value
      }
    }

    // Ensure we have something to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          error: 'No valid fields to update',
          message: 'Please provide at least one valid field to update',
          code: 'NO_UPDATE_DATA'
        },
        { status: 400 }
      )
    }

    // Update profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        ...updateData,
        profile_completed: true, // Mark profile as completed when they update it
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select(`
        id,
        email,
        full_name,
        avatar_url,
        phone,
        role,
        is_active,
        is_verified,
        chambers_id,
        department,
        position_title,
        start_date,
        profile_completed,
        onboarding_completed,
        notification_preferences,
        ui_preferences,
        updated_at
      `)
      .single()

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json(
        {
          error: 'Profile update failed',
          message: updateError.message,
          code: 'UPDATE_FAILED'
        },
        { status: 400 }
      )
    }

    // Log profile update
    await supabase.rpc('log_auth_event', {
      p_user_id: user.id,
      p_event_type: 'profile_update',
      p_event_status: 'success',
      p_ip_address: request.ip,
      p_user_agent: request.headers.get('user-agent'),
      p_event_data: {
        updated_fields: Object.keys(updateData),
        email: user.email
      }
    })

    return NextResponse.json({
      message: 'Profile updated successfully',
      profile: updatedProfile
    }, { status: 200 })

  } catch (error) {
    console.error('Update profile error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while updating profile',
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