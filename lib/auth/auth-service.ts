import { createClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { User, Session } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'clerk' | 'barrister' | 'read_only'
  avatar_url?: string
  is_active: boolean
  profile_completed: boolean
  onboarding_completed: boolean
  chambers_id?: string
}

export interface SignInCredentials {
  email: string
  password: string
  remember_me?: boolean
}

export interface SignUpData {
  email: string
  password: string
  full_name: string
  role: 'admin' | 'clerk' | 'barrister' | 'read_only'
  invitation_token?: string
}

export interface AuthResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    message: string
    code: string
    details?: any
  }
}

export class AuthService {
  private supabase

  constructor(serverSide: boolean = false) {
    this.supabase = serverSide ? createServerSupabaseClient() : createClient()
  }

  /**
   * Sign in with email and password
   */
  async signIn(credentials: SignInCredentials): Promise<AuthResponse<{ user: AuthUser; session: Session }>> {
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Sign in failed',
            code: data.code || 'SIGNIN_ERROR',
            details: data
          }
        }
      }

      return {
        success: true,
        data: {
          user: data.user,
          session: data.session
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error during sign in',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(signUpData: SignUpData): Promise<AuthResponse<{ user: User; requires_email_confirmation: boolean }>> {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signUpData),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Sign up failed',
            code: data.code || 'SIGNUP_ERROR',
            details: data
          }
        }
      }

      return {
        success: true,
        data: {
          user: data.user,
          requires_email_confirmation: data.requires_email_confirmation
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error during sign up',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<AuthResponse<void>> {
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Sign out failed',
            code: data.code || 'SIGNOUT_ERROR',
            details: data
          }
        }
      }

      return {
        success: true
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error during sign out',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Get current user session
   */
  async getSession(): Promise<AuthResponse<Session | null>> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession()

      if (error) {
        return {
          success: false,
          error: {
            message: error.message,
            code: 'SESSION_ERROR',
            details: error
          }
        }
      }

      return {
        success: true,
        data: session
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Error retrieving session',
          code: 'SESSION_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Get current user
   */
  async getUser(): Promise<AuthResponse<User | null>> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser()

      if (error) {
        return {
          success: false,
          error: {
            message: error.message,
            code: 'USER_ERROR',
            details: error
          }
        }
      }

      return {
        success: true,
        data: user
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Error retrieving user',
          code: 'USER_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Get user profile with role information
   */
  async getProfile(): Promise<AuthResponse<AuthUser | null>> {
    try {
      const response = await fetch('/api/auth/profile')
      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Failed to fetch profile',
            code: data.code || 'PROFILE_ERROR',
            details: data
          }
        }
      }

      return {
        success: true,
        data: data.profile
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error fetching profile',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<AuthUser>): Promise<AuthResponse<AuthUser>> {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Profile update failed',
            code: data.code || 'UPDATE_ERROR',
            details: data
          }
        }
      }

      return {
        success: true,
        data: data.profile
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error updating profile',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse<void>> {
    try {
      const response = await fetch('/api/auth/password/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Password change failed',
            code: data.code || 'PASSWORD_ERROR',
            details: data
          }
        }
      }

      return {
        success: true
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error changing password',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Request password reset
   */
  async resetPassword(email: string, redirectTo?: string): Promise<AuthResponse<void>> {
    try {
      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          redirect_to: redirectTo,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Password reset request failed',
            code: data.code || 'RESET_ERROR',
            details: data
          }
        }
      }

      return {
        success: true
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error requesting password reset',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback)
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(permission: string): Promise<boolean> {
    try {
      const { data: user } = await this.getUser()
      if (!user.success || !user.data) {
        return false
      }

      const { data, error } = await this.supabase.rpc('check_user_permission', {
        p_user_id: user.data.id,
        p_permission: permission
      })

      return !error && data === true
    } catch {
      return false
    }
  }

  /**
   * Invite a new user (admin only)
   */
  async inviteUser(invitation: {
    email: string
    full_name: string
    role: 'admin' | 'clerk' | 'barrister' | 'read_only'
    chambers_id?: string
    message?: string
  }): Promise<AuthResponse<{ invitation_url: string; expires_at: string }>> {
    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invitation),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Invitation failed',
            code: data.code || 'INVITE_ERROR',
            details: data
          }
        }
      }

      return {
        success: true,
        data: data.invitation
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error sending invitation',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }

  /**
   * Get pending invitations (admin only)
   */
  async getPendingInvitations(): Promise<AuthResponse<any[]>> {
    try {
      const response = await fetch('/api/auth/invite')
      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: data.message || 'Failed to fetch invitations',
            code: data.code || 'FETCH_ERROR',
            details: data
          }
        }
      }

      return {
        success: true,
        data: data.invitations
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Network error fetching invitations',
          code: 'NETWORK_ERROR',
          details: error
        }
      }
    }
  }
}

// Export singleton instances
export const authService = new AuthService()
export const serverAuthService = new AuthService(true)