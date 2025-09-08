-- =============================================================================
-- BDIP Authentication System Migration
-- Version: 20250109000000_create_authentication_system.sql
-- Purpose: Create comprehensive authentication system for UK Barristers' Chambers
-- =============================================================================

-- Enable required extensions for security
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- UPDATE PROFILES TABLE FOR AUTHENTICATION SYSTEM
-- =============================================================================

-- Drop existing profiles table if it doesn't meet our auth requirements
-- We'll recreate it with proper authentication integration
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Recreate profiles table with enhanced authentication features
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Basic profile information
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    
    -- Role-based access control
    role TEXT NOT NULL CHECK (role IN ('admin', 'clerk', 'barrister', 'read_only')),
    permissions JSONB DEFAULT '{}',
    
    -- Account status and management
    is_active BOOLEAN DEFAULT true NOT NULL,
    is_verified BOOLEAN DEFAULT false NOT NULL,
    last_sign_in_at TIMESTAMPTZ,
    sign_in_count INTEGER DEFAULT 0,
    
    -- Chambers-specific data
    chambers_id UUID, -- For multi-tenancy support
    department TEXT,
    position_title TEXT,
    start_date DATE,
    
    -- Security settings
    require_password_change BOOLEAN DEFAULT false,
    password_changed_at TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    -- Invitation system
    invited_by UUID REFERENCES auth.users(id),
    invited_at TIMESTAMPTZ,
    invitation_accepted_at TIMESTAMPTZ,
    invitation_token TEXT UNIQUE,
    
    -- Profile completeness and onboarding
    profile_completed BOOLEAN DEFAULT false,
    onboarding_completed BOOLEAN DEFAULT false,
    terms_accepted_at TIMESTAMPTZ,
    privacy_policy_accepted_at TIMESTAMPTZ,
    
    -- Preferences
    notification_preferences JSONB DEFAULT '{}',
    ui_preferences JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- =============================================================================
-- AUTHENTICATION AUDIT TABLES
-- =============================================================================

-- Authentication events audit table
CREATE TABLE public.auth_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Event details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'sign_up', 'sign_in', 'sign_out', 'password_change', 'password_reset_request',
        'password_reset_complete', 'profile_update', 'role_change', 'account_lock',
        'account_unlock', 'email_verification', 'invitation_sent', 'invitation_accepted',
        'failed_login', 'session_expired'
    )),
    event_status TEXT NOT NULL CHECK (event_status IN ('success', 'failure', 'pending')),
    
    -- Context information
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    
    -- Additional event data
    event_data JSONB DEFAULT '{}',
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Profile changes audit table
CREATE TABLE public.profile_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL, -- Don't use FK to allow retention after deletion
    
    -- Change tracking
    operation_type TEXT NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_fields JSONB,
    old_values JSONB,
    new_values JSONB,
    
    -- Context
    changed_by UUID REFERENCES auth.users(id),
    change_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- AUTHENTICATION FUNCTIONS
-- =============================================================================

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create profile for new user
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'read_only'),
        true,
        NOW(),
        NOW()
    );
    
    -- Log the profile creation
    INSERT INTO public.auth_audit_log (
        user_id,
        event_type,
        event_status,
        event_data
    ) VALUES (
        NEW.id,
        'sign_up',
        'success',
        jsonb_build_object(
            'email', NEW.email,
            'role', COALESCE(NEW.raw_user_meta_data->>'role', 'read_only')
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle user profile updates
CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the updated_at timestamp
    NEW.updated_at = NOW();
    
    -- Log profile changes
    IF OLD IS DISTINCT FROM NEW THEN
        INSERT INTO public.profile_audit_log (
            profile_id,
            operation_type,
            changed_fields,
            old_values,
            new_values,
            changed_by
        ) VALUES (
            NEW.id,
            'UPDATE',
            jsonb_build_object(
                'changed_fields', (
                    SELECT jsonb_agg(key)
                    FROM jsonb_each(to_jsonb(NEW)) AS new_data(key, value)
                    JOIN jsonb_each(to_jsonb(OLD)) AS old_data(key, old_value) ON new_data.key = old_data.key
                    WHERE new_data.value IS DISTINCT FROM old_data.old_value
                )
            ),
            to_jsonb(OLD),
            to_jsonb(NEW),
            auth.uid()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log authentication events
CREATE OR REPLACE FUNCTION public.log_auth_event(
    p_user_id UUID,
    p_event_type TEXT,
    p_event_status TEXT DEFAULT 'success',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_event_data JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO public.auth_audit_log (
        user_id,
        event_type,
        event_status,
        ip_address,
        user_agent,
        event_data
    ) VALUES (
        p_user_id,
        p_event_type,
        p_event_status,
        p_ip_address,
        p_user_agent,
        p_event_data
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user permissions
CREATE OR REPLACE FUNCTION public.check_user_permission(
    p_user_id UUID,
    p_permission TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_permissions JSONB;
    has_permission BOOLEAN := false;
BEGIN
    -- Get user role and permissions
    SELECT role, permissions
    INTO user_role, user_permissions
    FROM public.profiles
    WHERE id = p_user_id AND is_active = true AND deleted_at IS NULL;
    
    -- Check if user exists and is active
    IF user_role IS NULL THEN
        RETURN false;
    END IF;
    
    -- Admin has all permissions
    IF user_role = 'admin' THEN
        RETURN true;
    END IF;
    
    -- Check role-based permissions
    has_permission := CASE 
        WHEN user_role = 'clerk' AND p_permission IN (
            'read_enquiries', 'write_enquiries', 'assign_enquiries',
            'read_clients', 'write_clients', 'read_barristers'
        ) THEN true
        WHEN user_role = 'barrister' AND p_permission IN (
            'read_enquiries', 'read_own_enquiries', 'update_own_enquiries',
            'read_clients', 'read_own_tasks', 'write_own_tasks'
        ) THEN true
        WHEN user_role = 'read_only' AND p_permission LIKE 'read_%' THEN true
        ELSE false
    END;
    
    -- Check custom permissions
    IF NOT has_permission AND user_permissions IS NOT NULL THEN
        has_permission := (user_permissions->p_permission)::BOOLEAN = true;
    END IF;
    
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create user invitation
CREATE OR REPLACE FUNCTION public.create_user_invitation(
    p_email TEXT,
    p_role TEXT,
    p_full_name TEXT,
    p_invited_by UUID,
    p_chambers_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    invitation_token TEXT;
    invitation_record RECORD;
BEGIN
    -- Generate secure invitation token
    invitation_token := encode(gen_random_bytes(32), 'base64url');
    
    -- Create or update profile with invitation
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        is_active,
        invited_by,
        invited_at,
        invitation_token,
        chambers_id,
        is_verified
    ) VALUES (
        gen_random_uuid(),
        p_email,
        p_full_name,
        p_role,
        false, -- Inactive until invitation accepted
        p_invited_by,
        NOW(),
        invitation_token,
        p_chambers_id,
        false
    )
    ON CONFLICT (email) DO UPDATE SET
        invitation_token = invitation_token,
        invited_by = p_invited_by,
        invited_at = NOW(),
        updated_at = NOW()
    RETURNING * INTO invitation_record;
    
    -- Log the invitation
    PERFORM public.log_auth_event(
        p_invited_by,
        'invitation_sent',
        'success',
        NULL,
        NULL,
        jsonb_build_object(
            'invited_email', p_email,
            'invited_role', p_role,
            'invitation_token', invitation_token
        )
    );
    
    RETURN jsonb_build_object(
        'id', invitation_record.id,
        'email', invitation_record.email,
        'invitation_token', invitation_token,
        'expires_at', (NOW() + INTERVAL '7 days')::TEXT
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Trigger for profile updates
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_profile_update();

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Users can read own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
            AND is_active = true
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Admins can update all profiles"
    ON public.profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
            AND is_active = true
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Admins can insert profiles"
    ON public.profiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
            AND is_active = true
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Service role can manage profiles"
    ON public.profiles
    FOR ALL
    USING (auth.role() = 'service_role');

-- Auth audit log policies
CREATE POLICY "Users can read own auth events"
    ON public.auth_audit_log
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins can read all auth events"
    ON public.auth_audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
            AND is_active = true
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Service role can manage auth audit"
    ON public.auth_audit_log
    FOR ALL
    USING (auth.role() = 'service_role');

-- Profile audit log policies
CREATE POLICY "Admins can read profile audit log"
    ON public.profile_audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
            AND is_active = true
            AND deleted_at IS NULL
        )
    );

CREATE POLICY "Service role can manage profile audit"
    ON public.profile_audit_log
    FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Profile indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_chambers ON public.profiles(chambers_id) WHERE chambers_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_invitation_token ON public.profiles(invitation_token) WHERE invitation_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by ON public.profiles(invited_by) WHERE invited_by IS NOT NULL;

-- Auth audit indexes
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON public.auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON public.auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON public.auth_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip_address ON public.auth_audit_log(ip_address) WHERE ip_address IS NOT NULL;

-- Profile audit indexes
CREATE INDEX IF NOT EXISTS idx_profile_audit_profile_id ON public.profile_audit_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_audit_created_at ON public.profile_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_audit_changed_by ON public.profile_audit_log(changed_by);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles(role, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_event ON public.auth_audit_log(user_id, event_type, created_at DESC);

-- =============================================================================
-- SEED DATA FOR DEVELOPMENT
-- =============================================================================

-- Create initial admin user profile (will be populated via trigger when first admin signs up)
-- This serves as a template for the profile structure

-- =============================================================================
-- TABLE COMMENTS
-- =============================================================================

COMMENT ON TABLE public.profiles IS 'Enhanced user profiles with authentication, RBAC, and chambers management';
COMMENT ON TABLE public.auth_audit_log IS 'Comprehensive audit trail for all authentication events';
COMMENT ON TABLE public.profile_audit_log IS 'Detailed change tracking for profile modifications';

COMMENT ON COLUMN public.profiles.role IS 'Role-based access control: admin, clerk, barrister, read_only';
COMMENT ON COLUMN public.profiles.permissions IS 'Additional custom permissions beyond role-based access';
COMMENT ON COLUMN public.profiles.chambers_id IS 'Multi-tenancy support for multiple chambers';
COMMENT ON COLUMN public.profiles.invitation_token IS 'Secure token for invitation-based signup';
COMMENT ON COLUMN public.profiles.failed_login_attempts IS 'Counter for account security and lockout';
COMMENT ON COLUMN public.profiles.locked_until IS 'Timestamp for automatic account unlock';

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Active users view
CREATE OR REPLACE VIEW public.active_users AS
SELECT 
    p.*,
    au.last_sign_in_at as auth_last_sign_in_at,
    au.created_at as auth_created_at
FROM public.profiles p
JOIN auth.users au ON au.id = p.id
WHERE p.is_active = true 
AND p.deleted_at IS NULL
ORDER BY p.last_sign_in_at DESC NULLS LAST;

-- User roles summary view
CREATE OR REPLACE VIEW public.user_roles_summary AS
SELECT 
    role,
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE is_active = true) as active_users,
    COUNT(*) FILTER (WHERE last_sign_in_at > NOW() - INTERVAL '30 days') as recent_users
FROM public.profiles
WHERE deleted_at IS NULL
GROUP BY role
ORDER BY total_users DESC;

COMMENT ON VIEW public.active_users IS 'Active user profiles with authentication data';
COMMENT ON VIEW public.user_roles_summary IS 'Summary statistics by user role';

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant access to authenticated users
GRANT SELECT ON public.active_users TO authenticated;
GRANT SELECT ON public.user_roles_summary TO authenticated;

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION public.log_auth_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_invitation TO authenticated;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Update migration tracking
INSERT INTO public._supabase_migrations (version) VALUES ('20250109000000')
ON CONFLICT (version) DO NOTHING;