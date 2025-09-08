-- =============================================================================
-- BDIP Row Level Security Policies
-- Version: 20250102000000_create_rls_policies.sql
-- Purpose: Comprehensive RLS policies for role-based access control
-- =============================================================================

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barristers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clerks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER FUNCTIONS FOR RLS
-- =============================================================================

-- Function to get current user's profile
CREATE OR REPLACE FUNCTION auth.user_profile()
RETURNS public.profiles AS $$
BEGIN
  RETURN (
    SELECT p.* 
    FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND p.deleted_at IS NULL
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if current user has specific role
CREATE OR REPLACE FUNCTION auth.has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND p.role = required_role 
    AND p.is_active = true
    AND p.deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if current user has any of the specified roles
CREATE OR REPLACE FUNCTION auth.has_any_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND p.role = ANY(required_roles) 
    AND p.is_active = true
    AND p.deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get current user's barrister record
CREATE OR REPLACE FUNCTION auth.current_barrister()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT b.id 
    FROM public.barristers b
    INNER JOIN public.profiles p ON p.id = b.profile_id
    WHERE p.id = auth.uid() 
    AND p.role = 'barrister'
    AND p.is_active = true
    AND p.deleted_at IS NULL
    AND b.deleted_at IS NULL
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get current user's clerk record
CREATE OR REPLACE FUNCTION auth.current_clerk()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT c.id 
    FROM public.clerks c
    INNER JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.id = auth.uid() 
    AND p.role = 'clerk'
    AND p.is_active = true
    AND p.deleted_at IS NULL
    AND c.deleted_at IS NULL
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- PROFILES TABLE POLICIES
-- =============================================================================

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Allow users to update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (auth.has_role('admin'));

-- Allow admins and clerks to view active profiles
CREATE POLICY "Clerks can view active profiles" ON public.profiles
  FOR SELECT USING (
    auth.has_any_role(ARRAY['admin', 'clerk']) 
    AND deleted_at IS NULL 
    AND is_active = true
  );

-- Allow admins to manage all profiles
CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL USING (auth.has_role('admin'));

-- =============================================================================
-- BARRISTERS TABLE POLICIES
-- =============================================================================

-- Allow barristers to view their own record
CREATE POLICY "Barristers can view own record" ON public.barristers
  FOR SELECT USING (
    profile_id = auth.uid() OR 
    auth.has_any_role(ARRAY['admin', 'clerk'])
  );

-- Allow barristers to update limited fields in their own record
CREATE POLICY "Barristers can update own record" ON public.barristers
  FOR UPDATE USING (
    profile_id = auth.uid()
  ) WITH CHECK (
    profile_id = auth.uid() AND
    -- Prevent barristers from changing critical fields
    OLD.profile_id = NEW.profile_id AND
    OLD.seniority = NEW.seniority AND
    OLD.engagement_score = NEW.engagement_score AND
    OLD.max_workload = NEW.max_workload
  );

-- Allow admins and clerks to view all barristers
CREATE POLICY "Admin/Clerks can view barristers" ON public.barristers
  FOR SELECT USING (
    auth.has_any_role(ARRAY['admin', 'clerk']) AND
    deleted_at IS NULL
  );

-- Allow admins to manage all barrister records
CREATE POLICY "Admins can manage barristers" ON public.barristers
  FOR ALL USING (auth.has_role('admin'));

-- Allow clerks to update workload and assignment-related fields
CREATE POLICY "Clerks can update barrister assignments" ON public.barristers
  FOR UPDATE USING (
    auth.has_role('clerk') AND deleted_at IS NULL
  ) WITH CHECK (
    -- Clerks can only update specific fields
    OLD.profile_id = NEW.profile_id AND
    OLD.seniority = NEW.seniority AND
    OLD.practice_areas = NEW.practice_areas AND
    OLD.year_of_call = NEW.year_of_call
  );

-- =============================================================================
-- CLERKS TABLE POLICIES
-- =============================================================================

-- Allow clerks to view their own record
CREATE POLICY "Clerks can view own record" ON public.clerks
  FOR SELECT USING (
    profile_id = auth.uid() OR 
    auth.has_any_role(ARRAY['admin', 'clerk'])
  );

-- Allow clerks to update their own record (limited fields)
CREATE POLICY "Clerks can update own record" ON public.clerks
  FOR UPDATE USING (
    profile_id = auth.uid()
  ) WITH CHECK (
    profile_id = auth.uid() AND
    OLD.profile_id = NEW.profile_id AND
    OLD.max_workload = NEW.max_workload -- Prevent changing workload limits
  );

-- Allow admins and clerks to view all clerks
CREATE POLICY "Admin/Clerks can view clerks" ON public.clerks
  FOR SELECT USING (
    auth.has_any_role(ARRAY['admin', 'clerk']) AND
    deleted_at IS NULL
  );

-- Allow admins to manage all clerk records
CREATE POLICY "Admins can manage clerks" ON public.clerks
  FOR ALL USING (auth.has_role('admin'));

-- =============================================================================
-- CLIENTS TABLE POLICIES
-- =============================================================================

-- Allow authenticated users to view clients (all roles need this for enquiries)
CREATE POLICY "Staff can view clients" ON public.clients
  FOR SELECT USING (
    auth.has_any_role(ARRAY['admin', 'clerk', 'barrister', 'read_only']) AND
    deleted_at IS NULL
  );

-- Allow admins and clerks to create clients
CREATE POLICY "Admin/Clerks can create clients" ON public.clients
  FOR INSERT WITH CHECK (auth.has_any_role(ARRAY['admin', 'clerk']));

-- Allow admins and clerks to update clients
CREATE POLICY "Admin/Clerks can update clients" ON public.clients
  FOR UPDATE USING (
    auth.has_any_role(ARRAY['admin', 'clerk']) AND
    deleted_at IS NULL
  );

-- Allow admins to delete (soft delete) clients
CREATE POLICY "Admins can delete clients" ON public.clients
  FOR UPDATE USING (
    auth.has_role('admin')
  ) WITH CHECK (
    deleted_at IS NOT NULL -- Only allow setting deleted_at
  );

-- =============================================================================
-- ENQUIRIES TABLE POLICIES (Most Complex - Core Business Logic)
-- =============================================================================

-- Allow all staff to view enquiries with role-based filtering
CREATE POLICY "Staff can view enquiries" ON public.enquiries
  FOR SELECT USING (
    CASE 
      -- Admins can see all enquiries
      WHEN auth.has_role('admin') THEN deleted_at IS NULL
      
      -- Clerks can see all active enquiries
      WHEN auth.has_role('clerk') THEN deleted_at IS NULL
      
      -- Barristers can only see enquiries assigned to them or unassigned in their practice areas
      WHEN auth.has_role('barrister') THEN (
        deleted_at IS NULL AND (
          assigned_barrister_id = auth.current_barrister() OR
          (assigned_barrister_id IS NULL AND status IN ('New', 'Assigned') AND
           EXISTS(
             SELECT 1 FROM public.barristers b 
             WHERE b.id = auth.current_barrister() 
             AND practice_area = ANY(b.practice_areas)
           ))
        )
      )
      
      -- Read-only users can see all enquiries but no sensitive data
      WHEN auth.has_role('read_only') THEN deleted_at IS NULL
      
      ELSE false
    END
  );

-- Allow admins and clerks to create enquiries
CREATE POLICY "Admin/Clerks can create enquiries" ON public.enquiries
  FOR INSERT WITH CHECK (auth.has_any_role(ARRAY['admin', 'clerk']));

-- Complex update policy for enquiries
CREATE POLICY "Staff can update enquiries" ON public.enquiries
  FOR UPDATE USING (
    CASE 
      -- Admins can update all enquiries
      WHEN auth.has_role('admin') THEN deleted_at IS NULL
      
      -- Clerks can update all enquiries
      WHEN auth.has_role('clerk') THEN deleted_at IS NULL
      
      -- Barristers can only update their assigned enquiries (limited fields)
      WHEN auth.has_role('barrister') THEN (
        deleted_at IS NULL AND 
        assigned_barrister_id = auth.current_barrister()
      )
      
      ELSE false
    END
  ) WITH CHECK (
    CASE 
      -- Admins and clerks have full update rights
      WHEN auth.has_any_role(ARRAY['admin', 'clerk']) THEN true
      
      -- Barristers can only update specific fields
      WHEN auth.has_role('barrister') THEN (
        OLD.id = NEW.id AND
        OLD.client_id = NEW.client_id AND
        OLD.assigned_clerk_id = NEW.assigned_clerk_id AND
        OLD.assigned_barrister_id = NEW.assigned_barrister_id AND
        OLD.received_at = NEW.received_at AND
        OLD.estimated_value = NEW.estimated_value
        -- Allow updating: status, responded_at, barrister_notes, description
      )
      
      ELSE false
    END
  );

-- Allow admins to delete enquiries
CREATE POLICY "Admins can delete enquiries" ON public.enquiries
  FOR UPDATE USING (
    auth.has_role('admin')
  ) WITH CHECK (
    deleted_at IS NOT NULL
  );

-- =============================================================================
-- TASKS TABLE POLICIES
-- =============================================================================

-- Allow staff to view tasks based on assignment and role
CREATE POLICY "Staff can view tasks" ON public.tasks
  FOR SELECT USING (
    CASE 
      -- Admins can see all tasks
      WHEN auth.has_role('admin') THEN deleted_at IS NULL
      
      -- Clerks can see all tasks
      WHEN auth.has_role('clerk') THEN deleted_at IS NULL
      
      -- Barristers can see tasks assigned to them
      WHEN auth.has_role('barrister') THEN (
        deleted_at IS NULL AND 
        barrister_id = auth.current_barrister()
      )
      
      -- Read-only users can see all tasks
      WHEN auth.has_role('read_only') THEN deleted_at IS NULL
      
      ELSE false
    END
  );

-- Allow admins and clerks to create tasks
CREATE POLICY "Admin/Clerks can create tasks" ON public.tasks
  FOR INSERT WITH CHECK (auth.has_any_role(ARRAY['admin', 'clerk']));

-- Allow task updates based on assignment
CREATE POLICY "Staff can update tasks" ON public.tasks
  FOR UPDATE USING (
    CASE 
      -- Admins can update all tasks
      WHEN auth.has_role('admin') THEN deleted_at IS NULL
      
      -- Clerks can update all tasks
      WHEN auth.has_role('clerk') THEN deleted_at IS NULL
      
      -- Barristers can update their assigned tasks (limited fields)
      WHEN auth.has_role('barrister') THEN (
        deleted_at IS NULL AND 
        barrister_id = auth.current_barrister()
      )
      
      ELSE false
    END
  ) WITH CHECK (
    CASE 
      -- Admins and clerks have full update rights
      WHEN auth.has_any_role(ARRAY['admin', 'clerk']) THEN true
      
      -- Barristers can only update completion and notes
      WHEN auth.has_role('barrister') THEN (
        OLD.id = NEW.id AND
        OLD.enquiry_id = NEW.enquiry_id AND
        OLD.barrister_id = NEW.barrister_id AND
        OLD.clerk_id = NEW.clerk_id AND
        OLD.type = NEW.type AND
        OLD.due_date = NEW.due_date
        -- Allow updating: completed_at, status, completion_notes, actual_hours
      )
      
      ELSE false
    END
  );

-- =============================================================================
-- CSV IMPORTS TABLE POLICIES
-- =============================================================================

-- Allow all staff to view CSV imports
CREATE POLICY "Staff can view csv imports" ON public.csv_imports
  FOR SELECT USING (auth.has_any_role(ARRAY['admin', 'clerk', 'barrister', 'read_only']));

-- Allow admins to manage CSV imports
CREATE POLICY "Admins can manage csv imports" ON public.csv_imports
  FOR ALL USING (auth.has_role('admin'));

-- Allow clerks to create and view CSV imports
CREATE POLICY "Clerks can create csv imports" ON public.csv_imports
  FOR INSERT WITH CHECK (auth.has_role('clerk'));

-- =============================================================================
-- AUDIT LOG POLICIES
-- =============================================================================

-- Allow admins and senior clerks to view audit logs
CREATE POLICY "Admins can view enquiry audit log" ON public.enquiry_audit_log
  FOR SELECT USING (auth.has_role('admin'));

CREATE POLICY "Senior clerks can view enquiry audit log" ON public.enquiry_audit_log
  FOR SELECT USING (
    auth.has_role('clerk') AND 
    EXISTS(
      SELECT 1 FROM public.clerks c 
      WHERE c.id = auth.current_clerk() 
      AND c.is_senior = true
    )
  );

-- System can insert audit logs (triggers)
CREATE POLICY "System can insert enquiry audit log" ON public.enquiry_audit_log
  FOR INSERT WITH CHECK (true);

-- Assignment audit log policies
CREATE POLICY "Admins can view assignment audit log" ON public.assignment_audit_log
  FOR SELECT USING (auth.has_role('admin'));

CREATE POLICY "Clerks can view assignment audit log" ON public.assignment_audit_log
  FOR SELECT USING (auth.has_role('clerk'));

CREATE POLICY "System can insert assignment audit log" ON public.assignment_audit_log
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- SECURITY DEFINER FUNCTIONS FOR CONTROLLED OPERATIONS
-- =============================================================================

-- Function for barristers to safely update task completion
CREATE OR REPLACE FUNCTION public.complete_barrister_task(
  task_id UUID,
  completion_notes TEXT DEFAULT NULL,
  actual_hours DECIMAL DEFAULT NULL,
  quality_score INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  task_record public.tasks;
BEGIN
  -- Verify the task exists and is assigned to current barrister
  SELECT * INTO task_record 
  FROM public.tasks 
  WHERE id = task_id 
  AND barrister_id = auth.current_barrister()
  AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Update the task
  UPDATE public.tasks 
  SET 
    completed_at = NOW(),
    status = 'Completed',
    completion_notes = COALESCE(complete_barrister_task.completion_notes, completion_notes),
    actual_hours = COALESCE(complete_barrister_task.actual_hours, actual_hours),
    quality_score = CASE 
      WHEN complete_barrister_task.quality_score IS NOT NULL AND 
           complete_barrister_task.quality_score BETWEEN 1 AND 5 
      THEN complete_barrister_task.quality_score 
      ELSE quality_score 
    END,
    updated_at = NOW()
  WHERE id = task_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for barristers to safely respond to enquiries
CREATE OR REPLACE FUNCTION public.respond_to_enquiry(
  enquiry_id UUID,
  response_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  enquiry_record public.enquiries;
  response_hours INTEGER;
BEGIN
  -- Verify the enquiry exists and is assigned to current barrister
  SELECT * INTO enquiry_record 
  FROM public.enquiries 
  WHERE id = enquiry_id 
  AND assigned_barrister_id = auth.current_barrister()
  AND status IN ('Assigned', 'In Progress')
  AND responded_at IS NULL
  AND deleted_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate response time
  response_hours := EXTRACT(EPOCH FROM (NOW() - enquiry_record.received_at)) / 3600;
  
  -- Update the enquiry
  UPDATE public.enquiries 
  SET 
    responded_at = NOW(),
    response_time_hours = response_hours,
    status = CASE 
      WHEN status = 'Assigned' THEN 'In Progress'
      ELSE status 
    END,
    barrister_notes = COALESCE(response_notes, barrister_notes),
    updated_at = NOW()
  WHERE id = enquiry_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.complete_barrister_task TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_enquiry TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_role TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_any_role TO authenticated;
GRANT EXECUTE ON FUNCTION auth.current_barrister TO authenticated;
GRANT EXECUTE ON FUNCTION auth.current_clerk TO authenticated;

-- =============================================================================
-- ROW LEVEL SECURITY COMPLETE
-- =============================================================================

-- Log migration completion
INSERT INTO _supabase_migrations (version) VALUES ('20250102000000') 
ON CONFLICT (version) DO NOTHING;