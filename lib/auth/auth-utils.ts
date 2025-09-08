import { createServerSupabaseClient } from '@/lib/supabase/server'
import { User } from '@supabase/supabase-js'

/**
 * Server-side utility to get authenticated user with profile
 */
export async function getAuthenticatedUser(): Promise<{
  user: User | null
  profile: any | null
  error: string | null
}> {
  try {
    const supabase = createServerSupabaseClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return {
        user: null,
        profile: null,
        error: authError?.message || 'Not authenticated'
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        avatar_url,
        phone,
        is_active,
        is_verified,
        profile_completed,
        onboarding_completed,
        chambers_id,
        department,
        position_title,
        last_sign_in_at,
        created_at,
        updated_at
      `)
      .eq('id', user.id)
      .single()

    if (profileError) {
      return {
        user,
        profile: null,
        error: profileError.message
      }
    }

    return {
      user,
      profile,
      error: null
    }

  } catch (error) {
    return {
      user: null,
      profile: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check if user has required role
 */
export function hasRequiredRole(
  userRole: string,
  requiredRoles: string | string[]
): boolean {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]
  
  // Admin has access to everything
  if (userRole === 'admin') {
    return true
  }

  return roles.includes(userRole)
}

/**
 * Check if user can access resource based on role hierarchy
 */
export function canAccessResource(
  userRole: string,
  resourceRole: string
): boolean {
  const roleHierarchy = {
    'admin': 4,
    'clerk': 3,
    'barrister': 2,
    'read_only': 1
  }

  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
  const resourceLevel = roleHierarchy[resourceRole as keyof typeof roleHierarchy] || 0

  return userLevel >= resourceLevel
}

/**
 * Generate secure invitation token
 */
export function generateInvitationToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate password strength
 */
export interface PasswordValidation {
  isValid: boolean
  errors: string[]
  score: number // 0-5 strength score
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = []
  let score = 0

  // Minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long')
  } else {
    score += 1
  }

  // Contains uppercase
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  } else {
    score += 1
  }

  // Contains lowercase
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  } else {
    score += 1
  }

  // Contains number
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  } else {
    score += 1
  }

  // Contains special character
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character')
  } else {
    score += 1
  }

  return {
    isValid: errors.length === 0,
    errors,
    score
  }
}

/**
 * Check if account is locked due to failed login attempts
 */
export function isAccountLocked(
  failedAttempts: number,
  lockedUntil: string | null
): boolean {
  if (!lockedUntil) {
    return false
  }

  return new Date() < new Date(lockedUntil)
}

/**
 * Calculate account lock duration based on failed attempts
 */
export function calculateLockDuration(failedAttempts: number): number {
  // Progressive lockout: 5 minutes for first lock, then doubles up to max 1 hour
  const baseMinutes = 5
  const maxMinutes = 60
  const lockSeries = Math.floor(failedAttempts / 5) // Every 5 failed attempts
  
  const minutes = Math.min(baseMinutes * Math.pow(2, lockSeries), maxMinutes)
  return minutes * 60 * 1000 // Convert to milliseconds
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>'"&]/g, (match) => {
      const replacements: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      }
      return replacements[match]
    })
    .trim()
}

/**
 * Format role name for display
 */
export function formatRoleName(role: string): string {
  const roleNames: { [key: string]: string } = {
    'admin': 'Administrator',
    'clerk': 'Clerk',
    'barrister': 'Barrister',
    'read_only': 'Read Only'
  }

  return roleNames[role] || role
}

/**
 * Get role permissions
 */
export function getRolePermissions(role: string): string[] {
  const rolePermissions: { [key: string]: string[] } = {
    'admin': [
      'read_all', 'write_all', 'delete_all', 'manage_users',
      'manage_system', 'view_analytics', 'export_data'
    ],
    'clerk': [
      'read_enquiries', 'write_enquiries', 'assign_enquiries',
      'read_clients', 'write_clients', 'read_barristers',
      'manage_tasks', 'view_reports'
    ],
    'barrister': [
      'read_own_enquiries', 'update_own_enquiries',
      'read_clients', 'read_own_tasks', 'write_own_tasks',
      'view_own_analytics'
    ],
    'read_only': [
      'read_enquiries', 'read_clients', 'read_barristers',
      'view_reports'
    ]
  }

  return rolePermissions[role] || []
}

/**
 * Check if invitation has expired
 */
export function isInvitationExpired(invitedAt: string, expiryDays: number = 7): boolean {
  const inviteDate = new Date(invitedAt)
  const expiryDate = new Date(inviteDate.getTime() + (expiryDays * 24 * 60 * 60 * 1000))
  return new Date() > expiryDate
}

/**
 * Generate user display name
 */
export function getUserDisplayName(user: {
  full_name?: string
  email?: string
  role?: string
}): string {
  if (user.full_name) {
    return user.full_name
  }
  
  if (user.email) {
    return user.email.split('@')[0]
  }
  
  return 'Unknown User'
}

/**
 * Get user avatar initials
 */
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

/**
 * Format last seen timestamp
 */
export function formatLastSeen(lastSignInAt: string | null): string {
  if (!lastSignInAt) {
    return 'Never'
  }

  const lastSeen = new Date(lastSignInAt)
  const now = new Date()
  const diffMs = now.getTime() - lastSeen.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) {
    return 'Just now'
  } else if (diffMins < 60) {
    return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
  } else if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
  } else {
    return lastSeen.toLocaleDateString()
  }
}