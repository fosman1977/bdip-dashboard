'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { authService, AuthUser } from './auth-service'
import { createClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  profile: AuthUser | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>
  signUp: (data: {
    email: string
    password: string
    full_name: string
    role: 'admin' | 'clerk' | 'barrister' | 'read_only'
    invitation_token?: string
  }) => Promise<boolean>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<AuthUser>) => Promise<boolean>
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  resetPassword: (email: string, redirectTo?: string) => Promise<boolean>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Fetch user profile
  const fetchProfile = async (userId: string) => {
    const profileResult = await authService.getProfile()
    if (profileResult.success && profileResult.data) {
      setProfile(profileResult.data)
    } else {
      setProfile(null)
    }
  }

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get initial session
        const sessionResult = await authService.getSession()
        if (sessionResult.success && sessionResult.data) {
          setSession(sessionResult.data)
          setUser(sessionResult.data.user)
          await fetchProfile(sessionResult.data.user.id)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (
    email: string,
    password: string,
    rememberMe?: boolean
  ): Promise<boolean> => {
    setLoading(true)
    try {
      const result = await authService.signIn({
        email,
        password,
        remember_me: rememberMe,
      })

      if (result.success) {
        // Auth state will be updated via the listener
        return true
      } else {
        console.error('Sign in failed:', result.error)
        return false
      }
    } catch (error) {
      console.error('Sign in error:', error)
      return false
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (data: {
    email: string
    password: string
    full_name: string
    role: 'admin' | 'clerk' | 'barrister' | 'read_only'
    invitation_token?: string
  }): Promise<boolean> => {
    setLoading(true)
    try {
      const result = await authService.signUp(data)

      if (result.success) {
        // If email confirmation is required, user won't be signed in automatically
        return true
      } else {
        console.error('Sign up failed:', result.error)
        return false
      }
    } catch (error) {
      console.error('Sign up error:', error)
      return false
    } finally {
      setLoading(false)
    }
  }

  const signOut = async (): Promise<void> => {
    setLoading(true)
    try {
      await authService.signOut()
      // Auth state will be updated via the listener
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (updates: Partial<AuthUser>): Promise<boolean> => {
    try {
      const result = await authService.updateProfile(updates)

      if (result.success && result.data) {
        setProfile(result.data)
        return true
      } else {
        console.error('Profile update failed:', result.error)
        return false
      }
    } catch (error) {
      console.error('Profile update error:', error)
      return false
    }
  }

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> => {
    try {
      const result = await authService.changePassword(currentPassword, newPassword)

      if (result.success) {
        return true
      } else {
        console.error('Password change failed:', result.error)
        return false
      }
    } catch (error) {
      console.error('Password change error:', error)
      return false
    }
  }

  const resetPassword = async (
    email: string,
    redirectTo?: string
  ): Promise<boolean> => {
    try {
      const result = await authService.resetPassword(email, redirectTo)

      if (result.success) {
        return true
      } else {
        console.error('Password reset failed:', result.error)
        return false
      }
    } catch (error) {
      console.error('Password reset error:', error)
      return false
    }
  }

  const refreshProfile = async (): Promise<void> => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    changePassword,
    resetPassword,
    refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook for checking user permissions
export function usePermission(permission: string): boolean {
  const { profile } = useAuth()
  const [hasPermission, setHasPermission] = useState(false)

  useEffect(() => {
    const checkPermission = async () => {
      if (profile) {
        const result = await authService.hasPermission(permission)
        setHasPermission(result)
      } else {
        setHasPermission(false)
      }
    }

    checkPermission()
  }, [profile, permission])

  return hasPermission
}

// Hook for role-based access control
export function useRole(requiredRoles: string | string[]): boolean {
  const { profile } = useAuth()

  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]
  
  if (!profile) {
    return false
  }

  // Admin has access to everything
  if (profile.role === 'admin') {
    return true
  }

  return roles.includes(profile.role)
}