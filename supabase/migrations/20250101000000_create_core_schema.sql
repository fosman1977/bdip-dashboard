-- =============================================================================
-- BDIP Core Database Schema Migration
-- Version: 20250101000000_create_core_schema.sql
-- Purpose: Create comprehensive database schema for UK Barristers' Chambers Management
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users table (extends Supabase auth.users)
-- Stores additional profile information for chambers staff
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('barrister', 'clerk', 'admin', 'read_only')),
    is_active BOOLEAN DEFAULT true NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Barristers table
-- Core legal professionals with practice areas and performance tracking
CREATE TABLE IF NOT EXISTS public.barristers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Professional details
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    year_of_call INTEGER CHECK (year_of_call >= 1800 AND year_of_call <= EXTRACT(YEAR FROM NOW())),
    practice_areas TEXT[] DEFAULT '{}' NOT NULL,
    seniority TEXT NOT NULL CHECK (seniority IN ('Pupil', 'Junior', 'Middle', 'Senior', 'KC')),
    
    -- Status and performance
    is_active BOOLEAN DEFAULT true NOT NULL,
    engagement_score DECIMAL(5,2) DEFAULT 0.00 CHECK (engagement_score >= 0 AND engagement_score <= 100),
    current_workload INTEGER DEFAULT 0 CHECK (current_workload >= 0),
    max_workload INTEGER DEFAULT 20 CHECK (max_workload > 0),
    
    -- Contact details
    phone TEXT,
    clerk_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Clerks table
-- Administrative staff managing enquiries and assignments
CREATE TABLE IF NOT EXISTS public.clerks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Basic details
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    team TEXT,
    is_senior BOOLEAN DEFAULT false NOT NULL,
    
    -- Workload management
    max_workload INTEGER DEFAULT 20 CHECK (max_workload > 0) NOT NULL,
    current_workload INTEGER DEFAULT 0 CHECK (current_workload >= 0) NOT NULL,
    
    -- Performance tracking
    avg_response_time_hours DECIMAL(6,2) DEFAULT 0.00,
    assignment_count INTEGER DEFAULT 0,
    
    -- Contact and notes
    phone TEXT,
    notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Clients table
-- Individual, company, and solicitor client records with relationship tracking
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core details
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Individual', 'Company', 'Solicitor')),
    email TEXT,
    phone TEXT,
    
    -- Company-specific fields
    company_number TEXT,
    company_house_verified_at TIMESTAMPTZ,
    
    -- Address information
    address_line_1 TEXT,
    address_line_2 TEXT,
    city TEXT,
    postcode TEXT,
    country TEXT DEFAULT 'UK',
    
    -- Relationship and value tracking
    total_value DECIMAL(12,2) DEFAULT 0.00 NOT NULL CHECK (total_value >= 0),
    matter_count INTEGER DEFAULT 0 NOT NULL CHECK (matter_count >= 0),
    first_instruction DATE,
    last_instruction DATE,
    
    -- Client status
    is_active BOOLEAN DEFAULT true NOT NULL,
    credit_limit DECIMAL(12,2),
    payment_terms_days INTEGER DEFAULT 30,
    
    -- Marketing preferences
    marketing_consent BOOLEAN DEFAULT false,
    preferred_contact_method TEXT CHECK (preferred_contact_method IN ('email', 'phone', 'post', 'none')),
    
    -- Notes and tags
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Enquiries table
-- Central business entity tracking opportunities from receipt to conversion
CREATE TABLE IF NOT EXISTS public.enquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- External system integration
    lex_reference TEXT UNIQUE,
    
    -- Client relationship
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    
    -- Enquiry classification
    source TEXT NOT NULL CHECK (source IN ('Email', 'Phone', 'Website', 'Referral', 'Direct', 'LEX_Import')),
    practice_area TEXT,
    matter_type TEXT,
    description TEXT,
    
    -- Value and priority
    estimated_value DECIMAL(12,2) CHECK (estimated_value >= 0),
    actual_value DECIMAL(12,2) CHECK (actual_value >= 0),
    urgency TEXT NOT NULL CHECK (urgency IN ('Immediate', 'This Week', 'This Month', 'Flexible')),
    complexity TEXT CHECK (complexity IN ('Simple', 'Medium', 'Complex')),
    
    -- Assignment and status
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Assigned', 'In Progress', 'Converted', 'Lost', 'On Hold')),
    assigned_clerk_id UUID REFERENCES public.clerks(id) ON DELETE SET NULL,
    assigned_barrister_id UUID REFERENCES public.barristers(id) ON DELETE SET NULL,
    
    -- Timing and performance
    received_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    responded_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    
    -- Calculated fields
    response_time_hours INTEGER,
    conversion_probability DECIMAL(4,3) CHECK (conversion_probability >= 0 AND conversion_probability <= 1),
    
    -- Additional context
    referral_source TEXT,
    client_requirements TEXT,
    competitor_information TEXT,
    loss_reason TEXT,
    
    -- Internal notes
    clerk_notes TEXT,
    barrister_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Tasks table
-- Workflow items assigned to barristers/clerks with completion tracking
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relationships
    enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE CASCADE,
    barrister_id UUID REFERENCES public.barristers(id) ON DELETE SET NULL,
    clerk_id UUID REFERENCES public.clerks(id) ON DELETE SET NULL,
    
    -- Task details
    type TEXT NOT NULL CHECK (type IN ('Call', 'Email', 'Research', 'Meeting', 'Proposal', 'Follow-up', 'Document_Review', 'Court_Filing')),
    title TEXT NOT NULL,
    description TEXT,
    
    -- Scheduling and priority
    due_date TIMESTAMPTZ,
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    estimated_hours DECIMAL(4,2) DEFAULT 1.00 CHECK (estimated_hours > 0),
    actual_hours DECIMAL(4,2) CHECK (actual_hours >= 0),
    
    -- Completion and scoring
    completed_at TIMESTAMPTZ,
    points INTEGER DEFAULT 5 CHECK (points > 0),
    quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
    
    -- Task status and notes
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled', 'Blocked')),
    completion_notes TEXT,
    blocking_reason TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- CSV Imports table
-- ETL job tracking for LEX system integration
CREATE TABLE IF NOT EXISTS public.csv_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- File information
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT,
    file_hash TEXT, -- For duplicate detection
    
    -- Import configuration
    type TEXT NOT NULL CHECK (type IN ('enquiries', 'clients', 'matters', 'fees', 'barristers')),
    import_mode TEXT DEFAULT 'insert' CHECK (import_mode IN ('insert', 'upsert', 'update_only')),
    
    -- Processing status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Progress tracking
    total_rows INTEGER,
    processed_rows INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    
    -- Error handling
    errors JSONB,
    validation_errors JSONB,
    warnings JSONB,
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,
    
    -- User context
    imported_by UUID REFERENCES auth.users(id),
    import_notes TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- AUDIT TRAIL TABLES (Legal Compliance Requirement)
-- =============================================================================

-- Enquiry audit trail
-- Comprehensive change tracking for legal compliance
CREATE TABLE IF NOT EXISTS public.enquiry_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enquiry_id UUID NOT NULL, -- Don't use FK to allow historical data retention
    
    -- Change tracking
    operation_type TEXT NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE', 'STATUS_CHANGE')),
    changed_fields JSONB, -- Array of field names that changed
    old_values JSONB,     -- Previous values for changed fields
    new_values JSONB,     -- New values for changed fields
    
    -- Context
    user_id UUID REFERENCES auth.users(id),
    user_role TEXT,
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    
    -- Business context
    reason TEXT,
    notes TEXT,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Assignment audit trail
-- Track all enquiry assignments and reassignments
CREATE TABLE IF NOT EXISTS public.assignment_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enquiry_id UUID NOT NULL,
    
    -- Assignment details
    from_clerk_id UUID,
    to_clerk_id UUID,
    from_barrister_id UUID,
    to_barrister_id UUID,
    
    -- Assignment reason and context
    assignment_reason TEXT,
    automatic_assignment BOOLEAN DEFAULT false,
    algorithm_score DECIMAL(8,4), -- For automatic assignments
    
    -- User context
    assigned_by UUID REFERENCES auth.users(id),
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_barristers_active ON public.barristers(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_barristers_practice_areas ON public.barristers USING GIN(practice_areas) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_barristers_seniority ON public.barristers(seniority) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_barristers_engagement ON public.barristers(engagement_score DESC) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_barristers_workload ON public.barristers(current_workload) WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_clerks_active ON public.clerks(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clerks_workload ON public.clerks(current_workload) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_clerks_team ON public.clerks(team) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_type ON public.clients(type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_active ON public.clients(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_number ON public.clients(company_number) WHERE company_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_value ON public.clients(total_value DESC) WHERE deleted_at IS NULL;

-- Enquiry performance indexes
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON public.enquiries(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_received_at ON public.enquiries(received_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_clerk ON public.enquiries(assigned_clerk_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_barrister ON public.enquiries(assigned_barrister_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_client ON public.enquiries(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_source ON public.enquiries(source) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_practice_area ON public.enquiries(practice_area) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_urgency ON public.enquiries(urgency) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_value ON public.enquiries(estimated_value DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_lex_ref ON public.enquiries(lex_reference) WHERE lex_reference IS NOT NULL;

-- Task performance indexes
CREATE INDEX IF NOT EXISTS idx_tasks_barrister ON public.tasks(barrister_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_clerk ON public.tasks(clerk_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_enquiry ON public.tasks(enquiry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date) WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority) WHERE deleted_at IS NULL AND completed_at IS NULL;

-- CSV import indexes
CREATE INDEX IF NOT EXISTS idx_csv_imports_status ON public.csv_imports(status);
CREATE INDEX IF NOT EXISTS idx_csv_imports_type ON public.csv_imports(type);
CREATE INDEX IF NOT EXISTS idx_csv_imports_created_at ON public.csv_imports(created_at DESC);

-- Audit trail indexes
CREATE INDEX IF NOT EXISTS idx_enquiry_audit_enquiry_id ON public.enquiry_audit_log(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_enquiry_audit_created_at ON public.enquiry_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiry_audit_user ON public.enquiry_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_assignment_audit_enquiry_id ON public.assignment_audit_log(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_assignment_audit_created_at ON public.assignment_audit_log(created_at DESC);

-- Composite indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_enquiries_status_received ON public.enquiries(status, received_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_clerk_status ON public.enquiries(assigned_clerk_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_barrister_status ON public.enquiries(assigned_barrister_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks(COALESCE(barrister_id, clerk_id), status) WHERE deleted_at IS NULL;

-- =============================================================================
-- TABLE COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth.users with role-based information';
COMMENT ON TABLE public.barristers IS 'Legal professionals with practice areas, seniority, and performance tracking';
COMMENT ON TABLE public.clerks IS 'Administrative staff managing enquiries, assignments, and workloads';
COMMENT ON TABLE public.clients IS 'Individual, company, and solicitor clients with relationship and value tracking';
COMMENT ON TABLE public.enquiries IS 'Central business entity tracking opportunities from receipt to conversion';
COMMENT ON TABLE public.tasks IS 'Workflow items assigned to barristers/clerks with completion tracking';
COMMENT ON TABLE public.csv_imports IS 'ETL job tracking for LEX system integration and bulk operations';
COMMENT ON TABLE public.enquiry_audit_log IS 'Comprehensive audit trail for enquiry changes (legal compliance)';
COMMENT ON TABLE public.assignment_audit_log IS 'Track all enquiry assignments and reassignments with context';

-- Key column comments
COMMENT ON COLUMN public.barristers.engagement_score IS 'Calculated score (0-100) based on response time, conversion rate, client satisfaction, and revenue';
COMMENT ON COLUMN public.enquiries.conversion_probability IS 'ML-calculated probability (0.0-1.0) of enquiry converting to instruction';
COMMENT ON COLUMN public.enquiries.response_time_hours IS 'Calculated hours between received_at and responded_at';
COMMENT ON COLUMN public.tasks.points IS 'Point value for performance scoring (default: 5)';

-- =============================================================================
-- INITIAL DATA SETUP
-- =============================================================================

-- Insert default practice areas lookup (will be used for validation)
-- This could be expanded to a proper lookup table if needed
-- For now, we'll handle this in application logic

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration completion
INSERT INTO _supabase_migrations (version) VALUES ('20250101000000') 
ON CONFLICT (version) DO NOTHING;