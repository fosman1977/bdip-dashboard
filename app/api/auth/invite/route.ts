import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/security/auth'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { applyCorsHeaders } from '@/lib/security/cors'

interface InviteUserRequest {
  email: string
  full_name: string
  role: 'admin' | 'clerk' | 'barrister' | 'read_only'
  chambers_id?: string
  message?: string
}

// POST /api/auth/invite - Invite a new user
export async function POST(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, {
      requests: 10, // 10 invitations per hour
      window: 60 * 60,
      keyGenerator: (req) => `invite:${req.ip || 'anonymous'}`
    })
    if (rateLimitResponse) return rateLimitResponse

    // Authenticate the request - only admins and senior clerks can invite
    const authResult = await authenticateRequest(request, ['admin'])
    
    if (!authResult.success) {
      return authResult.response
    }

    const { user, supabase } = authResult
    const body: InviteUserRequest = await request.json()
    const { email, full_name, role, chambers_id, message } = body

    // Validate required fields
    if (!email || !full_name || !role) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'Email, full name, and role are required',
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

    // Check if user already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, is_active, invitation_token')
      .eq('email', email)
      .single()

    if (existingProfile && existingProfile.is_active) {
      return NextResponse.json(
        {
          error: 'User already exists',
          message: 'A user with this email address already exists',
          code: 'USER_EXISTS'
        },
        { status: 409 }
      )
    }

    // Get inviting user's chambers_id if not specified
    const finalChambersId = chambers_id || user.chambers_id

    // Create invitation using database function
    const { data: invitationData, error: inviteError } = await supabase.rpc(
      'create_user_invitation',
      {
        p_email: email,
        p_role: role,
        p_full_name: full_name,
        p_invited_by: user.id,
        p_chambers_id: finalChambersId
      }
    )

    if (inviteError || !invitationData) {
      console.error('Invitation creation error:', inviteError)
      return NextResponse.json(
        {
          error: 'Invitation failed',
          message: 'Unable to create user invitation',
          code: 'INVITATION_FAILED'
        },
        { status: 500 }
      )
    }

    // In a real application, you would send an email here
    // For now, we'll return the invitation details
    const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/accept-invitation?token=${invitationData.invitation_token}&email=${encodeURIComponent(email)}`

    // TODO: Integrate with email service to send invitation email
    // await emailService.sendInvitationEmail({
    //   to: email,
    //   inviterName: user.full_name,
    //   invitationUrl,
    //   role,
    //   message
    // })

    return NextResponse.json(
      {
        message: 'Invitation created successfully',
        invitation: {
          id: invitationData.id,
          email: invitationData.email,
          role,
          invitation_url: invitationUrl,
          expires_at: invitationData.expires_at
        }
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Invite user error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while creating invitation',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}

// GET /api/auth/invite - List pending invitations (admin only)
export async function GET(request: NextRequest) {
  try {
    // Apply CORS headers
    const corsResponse = applyCorsHeaders(request)
    if (corsResponse) return corsResponse

    // Authenticate the request - only admins can view invitations
    const authResult = await authenticateRequest(request, ['admin'])
    
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult

    // Get pending invitations
    const { data: invitations, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        invited_at,
        invited_by,
        invitation_accepted_at,
        profiles_inviter:invited_by (
          full_name
        )
      `)
      .not('invitation_token', 'is', null)
      .eq('is_active', false)
      .order('invited_at', { ascending: false })

    if (error) {
      console.error('Fetch invitations error:', error)
      return NextResponse.json(
        {
          error: 'Fetch failed',
          message: 'Unable to fetch invitations',
          code: 'FETCH_FAILED'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        full_name: inv.full_name,
        role: inv.role,
        invited_at: inv.invited_at,
        invited_by_name: inv.profiles_inviter?.full_name,
        status: inv.invitation_accepted_at ? 'accepted' : 'pending',
        accepted_at: inv.invitation_accepted_at
      }))
    }, { status: 200 })

  } catch (error) {
    console.error('Get invitations error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while fetching invitations',
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