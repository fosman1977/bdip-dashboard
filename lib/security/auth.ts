import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../supabase/server'

export interface AuthenticatedUser {
  id: string
  email?: string
  role: string
  is_active: boolean
}

export type AuthResult = {
  success: true
  user: AuthenticatedUser
  supabase: ReturnType<typeof createServerSupabaseClient>
} | {
  success: false
  response: NextResponse
}

// Secure authentication with proper error handling
export async function authenticateRequest(
  request: NextRequest,
  requiredRoles: string[] = ['admin', 'clerk', 'barrister']
): Promise<AuthResult> {
  try {
    const supabase = createServerSupabaseClient()
    
    // Get user from session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return {
        success: false,
        response: NextResponse.json(
          { 
            error: 'Unauthorized',
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
          },
          { status: 401 }
        )
      }
    }
    
    // Get user profile with role information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()
    
    if (profileError || !profile) {
      // If profile doesn't exist, it might be a new user
      // For now, deny access - in production you might want to create a profile
      return {
        success: false,
        response: NextResponse.json(
          { 
            error: 'Profile not found',
            message: 'User profile is not configured',
            code: 'PROFILE_NOT_FOUND'
          },
          { status: 403 }
        )
      }
    }
    
    // Check if account is active
    if (!profile.is_active) {
      return {
        success: false,
        response: NextResponse.json(
          { 
            error: 'Account inactive',
            message: 'Your account has been deactivated',
            code: 'ACCOUNT_INACTIVE'
          },
          { status: 403 }
        )
      }
    }
    
    // Check role permissions
    if (requiredRoles.length > 0 && !requiredRoles.includes(profile.role)) {
      return {
        success: false,
        response: NextResponse.json(
          { 
            error: 'Insufficient permissions',
            message: `This operation requires one of the following roles: ${requiredRoles.join(', ')}`,
            code: 'INSUFFICIENT_PERMISSIONS',
            userRole: profile.role,
            requiredRoles
          },
          { status: 403 }
        )
      }
    }
    
    // Return authenticated user with scoped database client
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: profile.role,
        is_active: profile.is_active
      },
      supabase // This still uses service role, but with authenticated context
    }
    
  } catch (error) {
    console.error('Authentication error:', error)
    return {
      success: false,
      response: NextResponse.json(
        { 
          error: 'Authentication failed',
          message: 'An error occurred during authentication',
          code: 'AUTH_ERROR'
        },
        { status: 500 }
      )
    }
  }
}